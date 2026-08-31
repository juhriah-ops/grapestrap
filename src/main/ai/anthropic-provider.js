// =============================================================
// PATH: src/main/ai/anthropic-provider.js
// ROLE: Anthropic provider — key validation, model list, and the streaming
//       agent turn against the Messages API
// DEPENDS: contract.js, @anthropic-ai/sdk (dynamic import, first use), logger.js
// CREATED: 2026-08-30
// =============================================================
//
// The SDK is imported dynamically inside loadCore()/loadToolHelper() and
// nowhere else. Importing THIS module is therefore free — app startup and
// fake mode never pull @anthropic-ai/sdk into memory.
//
// Request shape is pinned by the v0.2 spec: max_tokens 64000, effort from
// output_config, NO `thinking` block (adaptive is the default on Opus 5 and
// Sonnet 5; Haiku 4.5 simply runs without it), and no sampling parameters
// (temperature/top_p/top_k are rejected with a 400 on Opus 5 / Sonnet 5).

import { log } from '../logger.js'
import { CURATED_MODELS, TURN_ERROR_TYPES, createProviderError } from './contract.js'

const ENV_KEY_VARS = Object.freeze(['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'])

const DEFAULT_MODEL_ID = 'claude-opus-5'
const VALIDATE_KEY_MODEL = 'claude-opus-5'   // zero-token probe: metadata fetch, no completion
const MAX_OUTPUT_TOKENS = 64000
const DEFAULT_EFFORT = 'high'
const VALID_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

// TURN_ERROR_TYPES members are deliberately distinct from the SDK's own
// `.type` strings ('authentication_error', 'api_error', …), so this check can
// never mistake an un-mapped SDK error for one we already mapped.
function isTypedError(error) {
  return !!error && typeof error.type === 'string' && TURN_ERROR_TYPES.has(error.type)
}

/**
 * Does this model accept output_config.effort?
 *
 * An unknown id (hand-edited prefs) omits the parameter: a wrong
 * output_config is a hard 400, a missing one is just the documented default.
 *
 * @param {string} modelId - model id being requested
 * @returns {boolean}
 */
function supportsEffort(modelId) {
  const entry = CURATED_MODELS.find(model => model.id === modelId)
  return !!entry?.supportsEffort
}

// ─── Lazy SDK loading ────────────────────────────────────────────────────

let corePromise = null
let toolHelperPromise = null

/**
 * Dynamically import the SDK's default export (the Anthropic class, which
 * also carries the typed error classes as statics).
 *
 * The cached promise is cleared on failure so a later turn can retry — the
 * realistic failure here is a half-finished `npm install`, not a permanent
 * condition.
 *
 * @returns {Promise<Function>} the Anthropic client class
 * @throws {Error} typed 'api' error when the package cannot be resolved
 */
function loadCore() {
  if (!corePromise) {
    corePromise = import('@anthropic-ai/sdk')
      .then(module => module.default)
      .catch(error => {
        corePromise = null
        throw createProviderError('api', `Anthropic SDK could not be loaded: ${error?.message || error}`)
      })
  }
  return corePromise
}

/**
 * Dynamically import the raw-JSON-Schema tool helper. Loaded separately from
 * the core so a Phase A turn (no tools) never touches this subpath at all.
 *
 * @returns {Promise<Function>} betaTool factory
 * @throws {Error} typed 'api' error when the helper subpath cannot be resolved
 */
function loadToolHelper() {
  if (!toolHelperPromise) {
    toolHelperPromise = import('@anthropic-ai/sdk/helpers/beta/json-schema')
      .then(module => module.betaTool)
      .catch(error => {
        toolHelperPromise = null
        throw createProviderError('api', `Anthropic tool helper could not be loaded: ${error?.message || error}`)
      })
  }
  return toolHelperPromise
}

// ─── Client construction ─────────────────────────────────────────────────

/**
 * Build a client for one request.
 *
 * A null/empty `key` is not an error: it means "no key in the keyring, use
 * the environment". The bare constructor is the right call there because
 * ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN need different auth headers and
 * the SDK already knows which is which — sniffing the string ourselves would
 * send an OAuth token as an api key and 401.
 *
 * @param {Function} Anthropic - the SDK client class
 * @param {string|null} key - stored key, or null to defer to the environment
 * @returns {object} configured client
 */
function buildClient(Anthropic, key) {
  const trimmed = typeof key === 'string' ? key.trim() : ''
  return trimmed ? new Anthropic({ apiKey: trimmed }) : new Anthropic()
}

function hasEnvKey() {
  return ENV_KEY_VARS.some(name => {
    const value = process.env[name]
    return typeof value === 'string' && value.length > 0
  })
}

// ─── Error mapping ───────────────────────────────────────────────────────

/**
 * Map an SDK exception onto a typed provider error using the SDK's own
 * classes — never string matching on the message.
 *
 * Order matters: APIConnectionError extends APIError in this SDK, so it has
 * to be tested before the APIError catch-all or a dropped connection would
 * report as a plain API failure.
 *
 * @param {Function} Anthropic - the SDK client class (carries the error statics)
 * @param {unknown} error - whatever was thrown
 * @returns {Error} typed provider error
 */
function mapSdkError(Anthropic, error) {
  if (isTypedError(error)) return error

  const message = error?.message || String(error)

  if (Anthropic?.AuthenticationError && error instanceof Anthropic.AuthenticationError) {
    return createProviderError('auth', message)
  }
  if (Anthropic?.RateLimitError && error instanceof Anthropic.RateLimitError) {
    return createProviderError('rate-limit', message)
  }
  if (Anthropic?.APIConnectionError && error instanceof Anthropic.APIConnectionError) {
    return createProviderError('network', message)
  }
  if (Anthropic?.APIError && error instanceof Anthropic.APIError) {
    return createProviderError('api', message)
  }
  return createProviderError('api', message)
}

// ─── Stream consumption ──────────────────────────────────────────────────

/**
 * Hand one text delta to the caller. A throw from the renderer-facing
 * callback must not tear down the stream mid-turn, so it is contained here.
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
    log.warn(`ai: onDelta callback threw — ${error?.message || error}`)
  }
}

function extractText(message) {
  const blocks = Array.isArray(message?.content) ? message.content : []
  return blocks
    .filter(block => block?.type === 'text')
    .map(block => block.text || '')
    .join('')
}

function mapUsage(usage) {
  if (!usage) return null
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0
  }
}

/**
 * Normalize a finished SDK message into the turn result contract.
 *
 * Refusal is checked FIRST and returns early: a refused turn carries
 * stop_details rather than assistant text, and reading content blocks as if
 * it answered is how a refusal turns into a confusing empty reply. A refusal
 * is a normal outcome, never an error.
 *
 * @param {object|null} message - the SDK's final Message
 * @param {string} streamedText - text already pushed through onDelta
 * @returns {{stopReason: string, text: string, usage: object|null}}
 */
function toTurnResult(message, streamedText) {
  if (message?.stop_reason === 'refusal') {
    return { stopReason: 'refusal', text: streamedText, usage: mapUsage(message?.usage) }
  }
  return {
    stopReason: message?.stop_reason || 'end_turn',
    text: streamedText || extractText(message),
    usage: mapUsage(message?.usage)
  }
}

/**
 * Phase A path: one streaming completion, no tools.
 *
 * @param {object} client - SDK client
 * @param {object} params - message-create params
 * @param {{signal: AbortSignal|undefined, onDelta: Function|undefined}} hooks
 * @returns {Promise<{stopReason: string, text: string, usage: object|null}>}
 */
async function runPlainStream(client, params, { signal, onDelta }) {
  let streamedText = ''
  const stream = client.messages.stream(params, { signal })
  stream.on('text', delta => {
    streamedText += delta
    emitDelta(onDelta, delta)
  })
  // finalMessage() resolves the complete Message and internally handles the
  // error/abort states — do not re-wrap .on() events in a Promise.
  const message = await stream.finalMessage()
  return toTurnResult(message, streamedText)
}

/**
 * Phase C path: the beta Tool Runner drives request → tool → request until
 * Claude stops asking for tools. Structurally identical to the plain path
 * from the caller's point of view.
 *
 * @param {object} client - SDK client
 * @param {object} params - message-create params including `tools` and `stream: true`
 * @param {{signal: AbortSignal|undefined, onDelta: Function|undefined}} hooks
 * @returns {Promise<{stopReason: string, text: string, usage: object|null}>}
 */
async function runToolLoop(client, params, { signal, onDelta }) {
  let streamedText = ''
  let lastMessage = null
  const runner = client.beta.messages.toolRunner(params, { signal })

  // Outer loop: one iteration per model turn. Inner loop: that turn's stream.
  for await (const messageStream of runner) {
    for await (const event of messageStream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        streamedText += event.delta.text
        emitDelta(onDelta, event.delta.text)
      }
    }
    lastMessage = await messageStream.finalMessage()

    if (signal?.aborted) break
    if (lastMessage.stop_reason === 'refusal') break
    // The runner only auto-continues after a client tool produces a result,
    // so a server-tool pause would otherwise end the loop silently truncated.
    if (lastMessage.stop_reason === 'pause_turn') {
      runner.pushMessages({ role: 'assistant', content: lastMessage.content })
    }
  }

  return toTurnResult(lastMessage, streamedText)
}

/**
 * Adapt provider-neutral tool definitions to SDK runnable tools.
 *
 * Sorted by name on purpose: `tools` renders before `system` in the cached
 * prefix, so a set that reorders between turns invalidates the cache on
 * every request.
 *
 * @param {Array<object>|undefined} tools - { name, description, inputSchema, run }
 * @returns {Promise<Array<object>>} runnable tools (empty array when none)
 */
async function buildTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return []

  const ordered = [...tools].sort((first, second) => String(first?.name).localeCompare(String(second?.name)))
  const betaTool = await loadToolHelper()

  return ordered.map(tool => betaTool({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    run: tool.run
  }))
}

// ─── Descriptor surface ──────────────────────────────────────────────────

/**
 * Zero-token key check — retrieves model metadata rather than completing
 * anything, so a wrong key costs nothing to discover.
 *
 * Never rejects: the result crosses the IPC bridge, where a thrown Error
 * would arrive as a bare string with the typed shape stripped off.
 *
 * @param {string|null} key - key to test, or null to test the environment
 * @returns {Promise<{ok: boolean, error?: {type: string, message: string}}>}
 */
async function validateKey(key) {
  const trimmed = typeof key === 'string' ? key.trim() : ''
  if (!trimmed && !hasEnvKey()) {
    return { ok: false, error: { type: 'auth', message: 'No API key supplied and no key environment variable is set.' } }
  }

  let Anthropic = null
  try {
    Anthropic = await loadCore()
  } catch (error) {
    return { ok: false, error: { type: error.type || 'api', message: error.message } }
  }

  try {
    const client = buildClient(Anthropic, trimmed)
    await client.models.retrieve(VALIDATE_KEY_MODEL)
    return { ok: true }
  } catch (error) {
    const mapped = mapSdkError(Anthropic, error)
    return { ok: false, error: { type: mapped.type, message: mapped.message } }
  }
}

/**
 * The curated list. Deliberately not a live /v1/models call: the panel's
 * model dropdown has to paint before a key exists, and the three ids here
 * are the only ones this app supports.
 *
 * @returns {Array<{id: string, label: string}>}
 */
function listModels() {
  return CURATED_MODELS
}

/**
 * Run one agent turn against Anthropic, streaming text through onDelta.
 *
 * @param {object} request
 * @param {string|null} request.key - stored key, or null to use the environment
 * @param {string} request.model - model id from the curated list
 * @param {string} request.effort - low | medium | high | xhigh | max
 * @param {string} request.system - frozen system prompt (cached prefix)
 * @param {Array<{role: string, content: unknown}>} request.messages - full history
 * @param {Array<object>} request.tools - provider-neutral tool definitions
 * @param {AbortSignal} [request.signal] - cancels the turn
 * @param {Function} [request.onDelta] - called with each text delta
 * @returns {Promise<{stopReason: string, text: string, usage: object|null}>}
 * @throws {Error} typed error (.type ∈ auth | rate-limit | network | api)
 */
async function createTurn({ key, model, effort, system, messages, tools, signal, onDelta }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw createProviderError('api', 'createTurn requires at least one message.')
  }

  const Anthropic = await loadCore()

  const modelId = model || DEFAULT_MODEL_ID
  const params = {
    model: modelId,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages
  }
  // Omitted entirely on models that predate the effort parameter — sending it
  // there is a 400, and omitting it lands on the same 'high' default anyway.
  if (supportsEffort(modelId)) {
    params.output_config = { effort: VALID_EFFORTS.has(effort) ? effort : DEFAULT_EFFORT }
  }
  if (typeof system === 'string' && system.length > 0) {
    // The breakpoint is here so it stays correct as the prefix grows, but it
    // does NOT cache yet: the Phase A system prompt is ~181 tokens, under the
    // 512-token minimum cacheable prefix on Opus 5 / Sonnet 5 (4096 on Haiku
    // 4.5), and a below-minimum prefix is silently not cached. It becomes
    // effective once Phase C's tool schemas push the prefix past that floor —
    // which is also why the prompt has to stay byte-stable now.
    params.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
  }

  try {
    const client = buildClient(Anthropic, key)
    const runnableTools = await buildTools(tools)
    if (runnableTools.length === 0) {
      return await runPlainStream(client, params, { signal, onDelta })
    }
    return await runToolLoop(client, { ...params, tools: runnableTools, stream: true }, { signal, onDelta })
  } catch (error) {
    // Includes aborts: the session checks signal.aborted before reading this,
    // so a cancelled turn reports 'cancelled' rather than a network failure.
    throw mapSdkError(Anthropic, error)
  }
}

export const anthropicProvider = Object.freeze({
  id: 'anthropic',
  label: 'Anthropic',
  needsKey: true,
  envKeyVars: ENV_KEY_VARS,
  validateKey,
  listModels,
  createTurn
})
