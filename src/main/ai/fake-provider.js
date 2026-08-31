// =============================================================
// PATH: src/main/ai/fake-provider.js
// ROLE: Deterministic zero-network provider behind GSTRAP_AI_FAKE=1 —
//       drives every branch of the agent loop from the prompt text
// DEPENDS: contract.js (curated models + typed-error factory)
// CREATED: 2026-08-30
// =============================================================
//
// Fake mode reaches neither the SDK, the key store, nor the network — its
// only import is the dependency-free contract module.
//
// The prompt IS the script. The newest user message selects the branch:
//
//   FAKE:stream                  → five text deltas, stopReason 'end_turn'
//   FAKE:error <type>            → rejects typed (auth|rate-limit|network|api)
//   FAKE:refusal                 → resolves stopReason 'refusal', no text
//   FAKE:tool <name> <json>      → runs that tool, confirms its RESULT
//   FAKE:tool-deny <name> <json> → runs that tool expecting the executor to
//                                  refuse, and confirms the ERROR message
//   FAKE:tools <json-array>      → [{name, input}, …] run SEQUENTIALLY in one
//                                  turn, each result streamed as it lands —
//                                  the multi-call shape undo fusion is specced
//                                  against
//   anything else                → "Echo: <text>" in two deltas
//
// Both tool commands go through the tool's real bridged run(), so a spec
// exercising them exercises the whole main↔renderer round trip — the pending
// map, the ai:tool-call event, and ai:tool-result — not a stub of it.
//
// Chunk boundaries and ordering are identical on every run, so specs can
// assert on them exactly. Each chunk yields a full event-loop turn (not just
// a microtask) on purpose — a turn that completed inside one macrotask would
// finish before the next IPC message is even dequeued, which would make the
// session's single-flight 'busy' guard impossible to observe from a spec.

import {
  CURATED_MODELS, TURN_ERROR_TYPES, buildContextStripRegex, createProviderError
} from './contract.js'

const COMMAND_PREFIX = 'FAKE:'
const ECHO_PREFIX = 'Echo: '

// Five chunks concatenating to 'Fake streaming response in five chunks.'
const STREAM_CHUNKS = Object.freeze(['Fake ', 'streaming ', 'response ', 'in five ', 'chunks.'])

const ZERO_USAGE = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0
})

/**
 * Flatten one message's content to plain text.
 *
 * @param {string|Array<object>|undefined} content - string or content blocks
 * @returns {string} trimmed text ('' when there is none)
 */
function flattenContent(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block?.type === 'text')
    .map(block => block.text || '')
    .join('')
    .trim()
}

/**
 * Read the newest user message — the one that carries the FAKE: command.
 *
 * @param {Array<{role: string, content: unknown}>} messages - turn history
 * @returns {string} trimmed prompt text ('' when there is no user message)
 */
function getNewestUserText(messages) {
  if (!Array.isArray(messages)) return ''
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index]
    if (entry?.role === 'user') return stripContextBlock(flattenContent(entry.content))
  }
  return ''
}

// Built from the shared delimiters in contract.js, not hand-written here —
// the strip pattern and the block agent-session emits have to agree, and a
// hand-copied regex would let them drift apart silently.
const CONTEXT_STRIP_PATTERN = buildContextStripRegex()

/**
 * Drop the volatile editor-context block agent-session prepends to the
 * newest user message. The fake script keys off what the USER typed; with
 * the block left in place every FAKE: command would start with the context
 * delimiter instead and fall through to the echo branch.
 *
 * @param {string} text - flattened user message text
 * @returns {string} the user's own prompt, trimmed
 */
function stripContextBlock(text) {
  return text.replace(CONTEXT_STRIP_PATTERN, '').trim()
}

/**
 * Push chunks through onDelta in order and resolve the turn result.
 *
 * @param {Array<string>} chunks - delta sequence
 * @param {{signal: AbortSignal|undefined, onDelta: Function|undefined}} hooks
 * @returns {Promise<{stopReason: string, text: string, usage: object}>}
 * @throws {Error} typed 'network' error when the signal aborts mid-sequence
 */
async function emitChunks(chunks, { signal, onDelta }) {
  let text = ''
  for (const chunk of chunks) {
    if (signal?.aborted) throw createProviderError('network', 'Fake turn aborted.')
    text += chunk
    if (typeof onDelta === 'function') onDelta(chunk)
    // Yield a full event-loop turn between chunks so a cancel or a second
    // send landing mid-turn is actually observed. Zero delay keeps ordering
    // deterministic; the whole sequence still costs only a few milliseconds.
    await new Promise(resolve => { setTimeout(resolve, 0) })
  }
  return { stopReason: 'end_turn', text, usage: ZERO_USAGE }
}

/**
 * Serialize a tool result for the confirmation stream.
 *
 * @param {unknown} result - whatever the tool's run() resolved with
 * @returns {string} printable form
 */
function stringifyResult(result) {
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result)
  } catch (error) {
    // Circular structures and BigInt both throw here; the branch under test
    // is the tool bridge, not the serializer, so degrade instead of failing.
    return String(result)
  }
}

/**
 * Run one tool through the SAME call path a real provider uses, so the Phase C
 * IPC bridge (emit ai:tool-call → await handleToolResult) is exercised end to
 * end without a network round trip.
 *
 * @param {string} name - tool name from the command
 * @param {string} rawInput - JSON text from the command
 * @param {boolean} expectDeny - true for the tool-deny branch, which catches
 *        the executor's refusal and reports it instead of failing the turn
 * @param {{tools: Array<object>|undefined, signal: AbortSignal|undefined, onDelta: Function|undefined}} context
 * @returns {Promise<{stopReason: string, text: string, usage: object}>}
 * @throws {Error} typed 'api' error for an unknown tool or unparseable input,
 *         or the executor's own rejection when expectDeny is false
 */
async function runFakeTool(name, rawInput, expectDeny, { tools, signal, onDelta }) {
  const tool = requireTool(tools, name)

  let input = null
  try {
    input = JSON.parse(rawInput)
  } catch (error) {
    throw createProviderError('api', `Fake provider: tool input is not valid JSON — ${error.message}`)
  }

  if (!expectDeny) {
    // Success path: a rejection here is a real failure and propagates, ending
    // the turn in 'error' exactly as a live provider's would.
    const result = await tool.run(input)
    return emitChunks([`Tool ${name} returned: `, stringifyResult(result)], { signal, onDelta })
  }

  // Deny path: stands in for the model reading an is_error tool result and
  // telling the user about it rather than retrying in a loop.
  try {
    const result = await tool.run(input)
    return emitChunks([`Tool ${name} returned: `, stringifyResult(result)], { signal, onDelta })
  } catch (error) {
    return emitChunks([`Tool ${name} error: `, error?.message || String(error)], { signal, onDelta })
  }
}

/**
 * Look up a runnable tool by name.
 *
 * @param {Array<object>|undefined} tools - provider-neutral tool definitions
 * @param {string} name - tool name from the command
 * @returns {object} the tool
 * @throws {Error} typed 'api' error when no such runnable tool exists
 */
function requireTool(tools, name) {
  const available = Array.isArray(tools) ? tools : []
  const tool = available.find(candidate => candidate?.name === name)
  if (!tool || typeof tool.run !== 'function') {
    throw createProviderError('api', `Fake provider: no runnable tool named "${name}".`)
  }
  return tool
}

/**
 * Run several tools SEQUENTIALLY inside one turn, streaming each result as it
 * lands. This is the multi-call turn shape — several edits arriving from a
 * single user message — that the renderer's undo fusion is specced against,
 * so the calls must not be parallelised: the order they land in is the thing
 * under test.
 *
 * @param {string} rawList - JSON array text of [{ name, input }, …]
 * @param {{tools: Array<object>|undefined, signal: AbortSignal|undefined, onDelta: Function|undefined}} context
 * @returns {Promise<{stopReason: string, text: string, usage: object}>}
 * @throws {Error} typed 'api' error for bad JSON, a non-array, or an unknown tool
 */
async function runFakeToolSequence(rawList, { tools, signal, onDelta }) {
  let calls = null
  try {
    calls = JSON.parse(rawList)
  } catch (error) {
    throw createProviderError('api', `Fake provider: tool list is not valid JSON — ${error.message}`)
  }
  if (!Array.isArray(calls) || calls.length === 0) {
    throw createProviderError('api', 'Fake provider: tool list must be a non-empty JSON array.')
  }

  let text = ''
  for (const call of calls) {
    const tool = requireTool(tools, call?.name)
    // Awaited in sequence: each call's result must be delivered through the
    // bridge before the next one is issued.
    const result = await tool.run(call?.input ?? {})
    const step = await emitChunks([`${call.name}: `, `${stringifyResult(result)}\n`], { signal, onDelta })
    text += step.text
  }
  return { stopReason: 'end_turn', text, usage: ZERO_USAGE }
}

/**
 * Run one scripted turn.
 *
 * @param {object} request
 * @param {Array<{role: string, content: unknown}>} request.messages - turn history
 * @param {Array<object>} [request.tools] - provider-neutral tool definitions
 * @param {AbortSignal} [request.signal] - cancels the turn
 * @param {Function} [request.onDelta] - called with each text delta
 * @returns {Promise<{stopReason: string, text: string, usage: object}>}
 * @throws {Error} typed error when the prompt scripts a failure
 */
async function createTurn({ messages, tools, signal, onDelta }) {
  const prompt = getNewestUserText(messages)

  if (!prompt.startsWith(COMMAND_PREFIX)) {
    return emitChunks([ECHO_PREFIX, prompt], { signal, onDelta })
  }

  const command = prompt.slice(COMMAND_PREFIX.length).trim()

  if (command === 'stream') {
    return emitChunks(STREAM_CHUNKS, { signal, onDelta })
  }

  if (command === 'refusal') {
    return { stopReason: 'refusal', text: '', usage: ZERO_USAGE }
  }

  const errorMatch = /^error\s+(\S+)$/.exec(command)
  if (errorMatch) {
    const type = TURN_ERROR_TYPES.has(errorMatch[1]) ? errorMatch[1] : 'api'
    throw createProviderError(type, `Fake provider error: ${type}`)
  }

  // Input JSON may contain spaces, so everything after the tool name is one
  // greedy capture rather than a whitespace split. The three tool commands
  // are matched longest-prefix first; each pattern anchors its own literal,
  // so 'tools'/'tool-deny' can never be swallowed by the bare 'tool' branch.
  const sequenceMatch = /^tools\s+([\s\S]+)$/.exec(command)
  if (sequenceMatch) {
    return runFakeToolSequence(sequenceMatch[1], { tools, signal, onDelta })
  }

  const denyMatch = /^tool-deny\s+(\S+)\s+([\s\S]+)$/.exec(command)
  if (denyMatch) {
    return runFakeTool(denyMatch[1], denyMatch[2], true, { tools, signal, onDelta })
  }

  const toolMatch = /^tool\s+(\S+)\s+([\s\S]+)$/.exec(command)
  if (toolMatch) {
    return runFakeTool(toolMatch[1], toolMatch[2], false, { tools, signal, onDelta })
  }

  // Unrecognized FAKE: command — echo like any other prompt rather than
  // failing, so a typo in a spec reads as a wrong assertion, not a crash.
  return emitChunks([ECHO_PREFIX, prompt], { signal, onDelta })
}

/**
 * Always valid — fake mode has no credential to check.
 * @returns {Promise<{ok: boolean}>}
 */
async function validateKey() {
  return { ok: true }
}

/**
 * Same curated list as the real provider, so model-selection specs run
 * unchanged under the fake seam.
 * @returns {Array<{id: string, label: string}>}
 */
function listModels() {
  return CURATED_MODELS
}

export const fakeProvider = Object.freeze({
  id: 'fake',
  label: 'Fake (test seam)',
  needsKey: false,
  envKeyVars: Object.freeze([]),
  validateKey,
  listModels,
  createTurn
})
