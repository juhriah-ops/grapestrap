// =============================================================
// PATH: src/main/ai/ollama-provider.js
// ROLE: Ollama provider — local, keyless model serving over plain HTTP,
//       with its own streaming agent loop and tool round trip
// DEPENDS: contract.js, logger.js (no SDK, no npm dependency — global fetch)
// CREATED: 2026-08-30
// =============================================================
//
// Ollama speaks plain HTTP/JSON, so this provider needs no client library:
// global fetch in the Electron main process is the whole transport. That is
// also why the agent loop is hand-written here rather than delegated the way
// the Anthropic path delegates to the SDK's tool runner.
//
// ─── The host is never assumed ────────────────────────────────────────────
//
// Every request takes its base URL from `config.host`, threaded down from
// prefs.ai.ollamaHost. OLLAMA_DEFAULT_HOST is loopback and applies only when
// that pref has not been written yet. GrapeStrap ships publicly: a LAN
// address must never appear in this file.
//
// ─── Wire format: verified, and still parsed defensively ──────────────────
//
// Checked against a live Ollama server on 2026-08-30: GET /api/tags, POST
// /api/chat streaming, the tool_calls shape {id, function:{index, name,
// arguments}}, and the role:'tool' result round trip.
//
// The parser stays forgiving anyway, for reasons that have nothing to do with
// that check: `host` is user-typed, so requests may land on a reverse proxy,
// a compatibility shim, or an Ollama older or newer than the one verified.
// Unparseable JSONL lines are skipped rather than fatal, absent fields read
// as absent, and tool-call arguments are accepted as either an object or a
// JSON string. Wire drift should degrade into "no text" or "no tool calls",
// never a crash mid-turn.
//
// A user-typed host is also why this file has explicit resource limits: a
// stranger's HTTP server can answer 200 and then stream forever, stall after
// the handshake, or return a body with no newline in it at all. See
// MAX_LINE_BYTES, STREAM_IDLE_TIMEOUT_MS, and ERROR_BODY_BUDGET_BYTES.

import { log } from '../logger.js'
import { OLLAMA_DEFAULT_HOST, createProviderError } from './contract.js'

// The model dropdown must not hang on a host that silently blackholes
// packets — a wrong host typed into Preferences is the common case here.
const PROBE_TIMEOUT_MS = 5000

// Server error bodies can be large; the user only needs the first line.
// ERROR_BODY_BUDGET_BYTES caps what is READ, not just what is kept — an
// unbounded read of a hostile error body is the same denial of service as an
// unbounded read of a hostile stream.
const ERROR_TEXT_CAP = 500
const ERROR_BODY_BUDGET_BYTES = 8 * 1024

// One JSONL line should be a few KB. A megabyte without a newline means the
// endpoint is not speaking JSONL — most likely an HTML page from something
// that is not Ollama at all — and buffering it to find out is how a wrong
// host turns into unbounded memory growth.
const MAX_LINE_BYTES = 1_000_000

// Ollama streams steadily once generating; a long gap means the connection is
// dead, not that the model is thinking hard. Armed before the request and
// re-armed on every chunk, so this is an IDLE timeout rather than a total
// deadline — a genuinely slow local model never trips it.
const STREAM_IDLE_TIMEOUT_MS = 30_000

// Backstop for a local model that keeps calling tools forever. The Anthropic
// path gets this from the SDK runner; here it has to be explicit.
const MAX_TOOL_ITERATIONS = 12

/**
 * Normalize the configured base URL.
 *
 * @param {object} [config] - { host } from prefs.ai.ollamaHost
 * @returns {string} base URL with no trailing slash
 */
function resolveHost(config) {
  const configured = typeof config?.host === 'string' ? config.host.trim() : ''
  const host = configured || OLLAMA_DEFAULT_HOST
  return host.replace(/\/+$/, '')
}

/**
 * Flatten either a plain string or a content-block array into text.
 *
 * agent-session passes strings, but the descriptor contract allows the block
 * array the Anthropic path builds, so both are accepted.
 *
 * @param {string|Array<object>|unknown} value - message or system content
 * @returns {string}
 */
function flattenText(value) {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .filter(block => block?.type === 'text')
    .map(block => block.text || '')
    .join('\n')
}

/**
 * Hand one delta to the caller without letting a renderer-side throw tear
 * down the stream mid-turn.
 *
 * @param {Function|undefined} onDelta - caller's delta sink
 * @param {string} text - the delta
 * @returns {void}
 */
function emitDelta(onDelta, text) {
  if (typeof onDelta !== 'function' || !text) return
  try {
    onDelta(text)
  } catch (error) {
    log.warn(`ai/ollama: onDelta callback threw — ${error?.message || error}`)
  }
}

/**
 * Turn a failed fetch into a typed 'network' error.
 *
 * fetch rejects with a TypeError for connection refused, DNS failure, and TLS
 * problems alike, so the host is included — "could not reach X" is the one
 * piece of information that actually helps here.
 *
 * @param {unknown} error - the thrown value
 * @param {string} host - base URL that was being contacted
 * @returns {Error} typed 'network' error
 */
function toNetworkError(error, host) {
  return createProviderError('network', `Could not reach Ollama at ${host} — ${error?.message || error}`)
}

/**
 * Extract a useful message from a non-2xx response.
 *
 * Reads at most ERROR_BODY_BUDGET_BYTES and then cancels: response.text()
 * would buffer the whole body, and an error body from a user-typed host is
 * exactly as untrusted as a success body from one.
 *
 * @param {Response} response - the failed response
 * @returns {Promise<string>} capped error text
 */
async function readErrorText(response) {
  if (!response.body) return `HTTP ${response.status}`

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let body = ''
  let bytesRead = 0

  try {
    while (bytesRead < ERROR_BODY_BUDGET_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      bytesRead += value.byteLength
      body += decoder.decode(value, { stream: true })
    }
  } catch (error) {
    // Connection died mid-read — keep whatever arrived before it did.
  } finally {
    reader.cancel().catch(() => {})
  }

  try {
    // Ollama reports failures as {"error":"..."} — surface that, not raw JSON.
    const parsed = JSON.parse(body)
    if (parsed?.error) return String(parsed.error).slice(0, ERROR_TEXT_CAP)
  } catch (error) {
    // Not JSON, or truncated mid-object by the budget — use the raw text.
  }
  return body.slice(0, ERROR_TEXT_CAP) || `HTTP ${response.status}`
}

/**
 * Map our tool descriptors onto Ollama's OpenAI-style function schema.
 *
 * Sorted by name for the same reason the Anthropic path sorts: a tool list
 * that reorders between requests is a needlessly unstable prompt prefix.
 *
 * @param {Array<object>|undefined} tools - provider-neutral tool definitions
 * @returns {Array<object>} Ollama tool entries (empty when there are none)
 */
function mapTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return []
  return [...tools]
    .sort((first, second) => String(first?.name).localeCompare(String(second?.name)))
    .map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }))
}

/**
 * Normalize one streamed tool call.
 *
 * Ollama sends `arguments` as an object, but some builds and proxies send the
 * OpenAI-style JSON string instead — both are accepted, and anything else
 * degrades to an empty input rather than failing the turn.
 *
 * @param {object} raw - a tool_calls entry
 * @returns {{name: string, input: object}|null} null when unusable
 */
function toToolCall(raw) {
  const name = raw?.function?.name
  if (typeof name !== 'string' || name.length === 0) return null

  let input = raw?.function?.arguments
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input)
    } catch (error) {
      input = {}
    }
  }
  if (!input || typeof input !== 'object') input = {}
  return { name, input }
}

/**
 * Map Ollama's done_reason onto our stopReason vocabulary.
 *
 * @param {string|undefined} doneReason - value from the final chunk
 * @returns {string}
 */
function mapStopReason(doneReason) {
  if (doneReason === 'stop' || !doneReason) return 'end_turn'
  if (doneReason === 'length') return 'max_tokens'
  return doneReason
}

/**
 * Map Ollama's token counters onto the usage shape the session reports.
 *
 * @param {object} chunk - the final (done) chunk
 * @returns {object|null}
 */
function mapUsage(chunk) {
  const inputTokens = chunk?.prompt_eval_count
  const outputTokens = chunk?.eval_count
  if (typeof inputTokens !== 'number' && typeof outputTokens !== 'number') return null
  return {
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    // Ollama has no prompt cache; reported as zero so the shape matches the
    // Anthropic path rather than going missing.
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0
  }
}

/**
 * Accumulate usage across the requests that make up one turn.
 *
 * Each /api/chat round reports only its own tokens, so a tool-using turn that
 * made four requests would otherwise report the last round's counts as if
 * they were the whole turn.
 *
 * @param {object|null} total - usage so far
 * @param {object|null} next - usage from the round that just finished
 * @returns {object|null}
 */
function addUsage(total, next) {
  if (!next) return total
  if (!total) return { ...next }
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0
  }
}

/**
 * Run one bridged tool and render its outcome as tool-message content.
 *
 * Ollama has no is_error flag on tool messages, so a failure has to be
 * visible in the content itself or the model reads a refusal as success.
 *
 * @param {Array<object>|undefined} tools - provider-neutral tool definitions
 * @param {{name: string, input: object}} call - the requested call
 * @returns {Promise<string>} content for the tool message
 */
async function runBridgedTool(tools, call) {
  const available = Array.isArray(tools) ? tools : []
  const tool = available.find(candidate => candidate?.name === call.name)
  if (!tool || typeof tool.run !== 'function') {
    return `Error: no tool named ${call.name}`
  }
  try {
    const result = await tool.run(call.input)
    if (typeof result === 'string') return result
    try {
      return JSON.stringify(result)
    } catch (error) {
      return String(result)
    }
  } catch (error) {
    return `Error: ${error?.message || error}`
  }
}

/**
 * POST one /api/chat request and consume its JSONL stream.
 *
 * @param {object} request
 * @param {string} request.host - base URL
 * @param {string} request.modelId - model to run
 * @param {Array<object>} request.messages - full intra-turn message array
 * @param {Array<object>} request.tools - mapped Ollama tool entries
 * @param {AbortSignal} [request.signal] - cancels the request
 * @param {Function} [request.onDelta] - receives text deltas
 * @returns {Promise<{content: string, toolCalls: Array<object>, rawToolCalls: Array<object>, stopReason: string, usage: object|null}>}
 * @throws {Error} typed 'network' or 'api' error
 */
async function streamChat({ host, modelId, messages, tools, signal, onDelta }) {
  const body = { model: modelId, stream: true, messages }
  if (tools.length > 0) body.tools = tools

  // Idle watchdog. Armed before the request and re-armed on every chunk, so a
  // host that completes the handshake and then goes silent fails in seconds
  // instead of parking the turn — and the single-flight slot — indefinitely.
  const idleController = new AbortController()
  let idleTimer = null
  const armIdleTimer = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => idleController.abort(), STREAM_IDLE_TIMEOUT_MS)
  }
  const disarmIdleTimer = () => {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  // True only when OUR watchdog fired. A user cancel aborts the same fetch and
  // must not be reported to them as a dead server.
  const idleTripped = () => idleController.signal.aborted && !signal?.aborted
  const idleError = () => createProviderError(
    'network',
    `Ollama at ${host} stopped responding (no data for ${STREAM_IDLE_TIMEOUT_MS / 1000}s).`
  )

  const requestSignal = signal
    ? AbortSignal.any([signal, idleController.signal])
    : idleController.signal

  let response = null
  armIdleTimer()
  try {
    response = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: requestSignal
    })
  } catch (error) {
    disarmIdleTimer()
    throw idleTripped() ? idleError() : toNetworkError(error, host)
  }

  if (!response.ok) {
    disarmIdleTimer()
    // Covers the common "model not found" 404 as well as server errors.
    throw createProviderError('api', `Ollama rejected the request (HTTP ${response.status}): ${await readErrorText(response)}`)
  }
  if (!response.body) {
    disarmIdleTimer()
    throw createProviderError('api', 'Ollama returned an empty response body.')
  }

  let content = ''
  let stopReason = 'end_turn'
  let usage = null

  // Keyed, not appended. A build that repeats a call across chunks (which is
  // why function.index exists at all) would otherwise queue the same call
  // twice — and these tools MUTATE the user's document, so a duplicate is a
  // duplicate edit. Last write wins; nothing runs until the stream ends.
  // Ollama sends both `id` and `function.index`; the positional fallback only
  // matters for a shim that sends neither, where two genuinely different
  // calls at the same position in different chunks would collapse into one.
  // Losing a call is recoverable, running a mutation twice is not.
  const toolCallDrafts = new Map()

  const applyChunk = line => {
    let chunk = null
    try {
      chunk = JSON.parse(line)
    } catch (error) {
      // Tolerant by design: a malformed line loses one delta, not the turn.
      return
    }

    const delta = chunk?.message?.content
    if (typeof delta === 'string' && delta.length > 0) {
      content += delta
      emitDelta(onDelta, delta)
    }

    // tool_calls typically arrive on the final chunk, but nothing guarantees
    // that, so they are collected from every chunk that carries them.
    const calls = chunk?.message?.tool_calls
    if (Array.isArray(calls)) {
      for (let position = 0; position < calls.length; position += 1) {
        const raw = calls[position]
        toolCallDrafts.set(raw?.id ?? raw?.function?.index ?? position, raw)
      }
    }

    if (chunk?.done) {
      stopReason = mapStopReason(chunk.done_reason)
      usage = mapUsage(chunk) || usage
    }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      armIdleTimer()
      buffer += decoder.decode(value, { stream: true })

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line) applyChunk(line)
        newlineIndex = buffer.indexOf('\n')
      }

      // Checked after draining: whatever is left is one unterminated line.
      if (buffer.length > MAX_LINE_BYTES) {
        throw createProviderError(
          'api',
          `Ollama at ${host} sent over ${MAX_LINE_BYTES} characters with no line break — that is not an Ollama stream.`
        )
      }
    }
  } catch (error) {
    // Our own typed errors (the line cap) pass through unchanged.
    if (error?.type) throw error
    if (idleTripped()) throw idleError()
    // Everything else is a transport failure — including the abort the user
    // triggered, which the session recognises via signal.aborted.
    throw toNetworkError(error, host)
  } finally {
    disarmIdleTimer()
    // Releases the socket on every path, including the throws above — without
    // this, a decode or cap failure leaks the connection.
    reader.cancel().catch(() => {})
  }

  // A final line with no trailing newline is normal at end of stream.
  const tail = buffer.trim()
  if (tail) applyChunk(tail)

  // Materialized only now: a call repeated across chunks has settled to its
  // final form before anything is allowed to run it.
  const toolCalls = []
  const rawToolCalls = []
  for (const raw of toolCallDrafts.values()) {
    const call = toToolCall(raw)
    if (!call) continue
    toolCalls.push(call)
    rawToolCalls.push(raw)
  }

  return { content, toolCalls, rawToolCalls, stopReason, usage }
}

/**
 * List the models installed on the Ollama host.
 *
 * Sorted by name so the preferences dropdown has a stable order — /api/tags
 * order is not documented as meaningful.
 *
 * @param {string|null} key - unused; Ollama is keyless
 * @param {object} [config] - { host }
 * @returns {Promise<Array<{id: string, label: string, supportsEffort: boolean}>>}
 * @throws {Error} typed 'network' or 'api' error
 */
async function listModels(key, config) {
  const host = resolveHost(config)

  let response = null
  try {
    response = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
  } catch (error) {
    throw toNetworkError(error, host)
  }

  if (!response.ok) {
    throw createProviderError('api', `Ollama returned HTTP ${response.status}: ${await readErrorText(response)}`)
  }

  let payload = null
  try {
    payload = await response.json()
  } catch (error) {
    throw createProviderError('api', `Ollama sent an unreadable model list — ${error?.message || error}`)
  }

  const entries = Array.isArray(payload?.models) ? payload.models : []
  return entries
    .map(entry => entry?.name)
    .filter(name => typeof name === 'string' && name.length > 0)
    .sort((first, second) => first.localeCompare(second))
    .map(name => ({
      id: name,
      label: name,
      // Effort is an Anthropic parameter. Marking every Ollama model false is
      // what makes the pane's existing per-model gating hide the control.
      supportsEffort: false
    }))
}

/**
 * Keyless — there is nothing to validate.
 *
 * @returns {Promise<{ok: true}>}
 */
async function validateKey() {
  return { ok: true }
}

/**
 * Run one agent turn against Ollama, streaming text through onDelta.
 *
 * `effort` is accepted and ignored: Ollama has no equivalent parameter, which
 * is why every model this provider lists reports supportsEffort false.
 *
 * @param {object} request
 * @param {string} request.model - model id (an installed Ollama model name)
 * @param {string|Array<object>} request.system - system prompt
 * @param {Array<{role: string, content: unknown}>} request.messages - history
 * @param {Array<object>} request.tools - provider-neutral tool definitions
 * @param {AbortSignal} [request.signal] - cancels the turn
 * @param {Function} [request.onDelta] - receives text deltas
 * @param {object} [request.config] - { host }
 * @returns {Promise<{stopReason: string, text: string, usage: object|null}>}
 * @throws {Error} typed error (.type ∈ network | api)
 */
async function createTurn({ model, system, messages, tools, signal, onDelta, config }) {
  const host = resolveHost(config)
  const modelId = typeof model === 'string' ? model.trim() : ''
  if (!modelId) {
    throw createProviderError('api', 'No Ollama model selected. Pick one in Preferences → AI.')
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw createProviderError('api', 'createTurn requires at least one message.')
  }

  // The intra-turn array grows as the loop runs: assistant tool_calls turns
  // and their tool results are appended here, not to the session's history.
  const turnMessages = []
  const systemText = flattenText(system)
  if (systemText) turnMessages.push({ role: 'system', content: systemText })
  for (const entry of messages) {
    turnMessages.push({ role: entry.role, content: flattenText(entry.content) })
  }

  const mappedTools = mapTools(tools)
  let text = ''
  let usage = null

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    if (signal?.aborted) throw createProviderError('network', 'Turn cancelled.')

    const step = await streamChat({ host, modelId, messages: turnMessages, tools: mappedTools, signal, onDelta })
    text += step.content
    usage = addUsage(usage, step.usage)

    if (step.toolCalls.length === 0) {
      return { stopReason: step.stopReason, text, usage }
    }

    // A cancel that landed while streamChat was resolving must stop here.
    // These tools mutate the user's document, and running one after the user
    // pressed cancel is a change they did not ask for and cannot see coming.
    if (signal?.aborted) throw createProviderError('network', 'Turn cancelled.')

    // Echo the assistant turn that requested the calls, then answer each one.
    // Both halves are required: dropping the assistant turn leaves the tool
    // messages replying to nothing.
    turnMessages.push({ role: 'assistant', content: step.content, tool_calls: step.rawToolCalls })
    for (const call of step.toolCalls) {
      const resultText = await runBridgedTool(tools, call)
      turnMessages.push({
        role: 'tool',
        content: resultText,
        // Ollama names this field tool_name; `name` is carried too because
        // older builds read that instead, and an ignored extra key is free.
        tool_name: call.name,
        name: call.name
      })
    }
  }

  // Fell out of the loop still asking for tools. Throwing rather than
  // returning is deliberate: a returned partial would render as a normal
  // completed answer, and the user would have no idea the model was cut off
  // mid-task. The error row says so plainly instead.
  log.warn(`ai/ollama: turn hit the ${MAX_TOOL_ITERATIONS}-iteration tool limit`)
  throw createProviderError(
    'api',
    `Stopped after ${MAX_TOOL_ITERATIONS} tool rounds without a final answer — try a more specific request.`
  )
}

export const ollamaProvider = Object.freeze({
  id: 'ollama',
  label: 'Ollama (local)',
  needsKey: false,
  envKeyVars: Object.freeze([]),
  validateKey,
  listModels,
  createTurn
})
