// =============================================================
// PATH: src/main/ai/agent-session.js
// ROLE: Singleton agent-turn service — conversation history, single-flight
//       turn loop, batched ai:delta push, cancel/reset, tool-result bridge
// DEPENDS: contract.js, provider.js, prefs.js, logger.js,
//          key-store.js (dynamic import)
// CREATED: 2026-08-30
// =============================================================
//
// Module-level singleton, same lifecycle model as git-status.js: state lives
// at module scope, one operation runs at a time, and a generation token
// invalidates in-flight work instead of trying to unwind it. There is no
// "close" path — the session ends with the app.
//
// Three guarantees the IPC layer depends on:
//
//  1. Single-flight. One turn at a time; a second sendTurn returns a 'busy'
//     result rather than queueing, because a queued turn would answer into a
//     conversation the user has already moved past.
//  2. Terminal event, always. Every turn ends with exactly one ai:turn event
//     in state done | error | cancelled — a webContents that navigated away
//     mid-turn is cancelled by the did-navigate hook so the single-flight
//     slot can never leak for the rest of the app's life.
//  3. Nothing throws across the bridge. Provider failures become an ai:turn
//     'error' payload; the exported functions return { ok } results.
//
// History invariant: the array always alternates user → assistant and always
// starts on a user entry. Both are load-bearing — the API rejects consecutive
// same-role messages with a 400, and that 400 would stick to every later turn
// until the user hit Reset. finishTurn is the only place that can break the
// invariant, so it is the only place that repairs it.
//
// key-store.js is imported dynamically so this module still loads (and the
// fake seam still runs) when that file is absent or its keyring backend is
// unavailable.

import { log } from '../logger.js'
import { getPref } from '../prefs.js'
import { getProvider } from './provider.js'
import { createProviderError, createResultError, toTurnError } from './contract.js'

// Deltas are coalesced into at most one IPC message per interval. Raw SDK
// deltas arrive far faster than the panel can paint; 40 ms reads as instant
// and keeps the renderer off the wire for every token.
const DELTA_FLUSH_MS = 40

// A renderer tool that never answers would otherwise park the SDK loop — and
// with it the single-flight slot — forever. Generous on purpose: this is a
// deadlock backstop, not a latency budget.
const TOOL_CALL_TIMEOUT_MS = 120_000

// Conversation cap, counted in entries (20 user/assistant pairs). Unbounded
// history eventually overruns the context window, and that arrives as an
// opaque 'api' 400 the user cannot act on.
const MAX_HISTORY_ENTRIES = 40

// Mirrors prefs DEFAULTS.ai. Duplicated deliberately: prefs may not be
// initialized yet (early boot, unit tests), and the panel still has to report
// a coherent status instead of throwing.
const AI_PREF_FALLBACKS = Object.freeze({
  provider: 'anthropic',
  model: 'claude-opus-5',
  effort: 'high'
})

// Prompt caching is a prefix match, so a single varying byte here costs every
// cache hit for the rest of the session. Frozen on purpose: no timestamp, no
// project name, no model name. Per-turn context rides the newest user turn.
const SYSTEM_PROMPT = [
  'You are the GrapeStrap assistant, embedded in a desktop visual editor for static Bootstrap 5 websites.',
  'You help the user build and edit pages made of plain HTML, CSS, and JavaScript.',
  '',
  'Ground rules:',
  '- Work from the page context the user gives you. If you do not have it, ask for it instead of guessing.',
  '- Keep answers short. A concrete snippet beats a paragraph.',
  '- Never write inline style attributes or inline event handlers. Use CSS classes and script-side bindings.',
  '- Bootstrap 5, Bootstrap Icons, and Font Awesome are already local to the project. Never suggest a CDN link.',
  '- Class and id names describe what an element is, never how it looks and never a data value.'
].join('\n')

// Renderer-executed tools. Phase C fills this with { name, description,
// inputSchema } definitions; Phase A ships an empty surface, which makes the
// turn a plain streaming completion while the bridge below stays wired.
const RENDERER_TOOL_DEFINITIONS = Object.freeze([])

let generation = 0          // bumped on send/cancel/reset — stale results drop
let turnCounter = 0         // turn id sequence
let activeTurn = null       // the single in-flight turn, or null
let history = []            // [{ role, content }] — the conversation
let deltaBuffer = ''        // text waiting for the next flush
let deltaTimer = null
let keyStorePromise = null  // cached dynamic import of key-store.js

const pendingToolCalls = new Map()     // callId → { resolve, reject, timer }
const navigationWatched = new WeakSet() // webContents already wired for cancel-on-navigate

// ─── Preferences ─────────────────────────────────────────────────────────

/**
 * Read the ai.* preference block with defensive fallbacks.
 *
 * @returns {{provider: string, model: string, effort: string}}
 */
function readAiSettings() {
  let stored = null
  try {
    stored = getPref('ai')
  } catch (error) {
    // prefs not initialized yet — fall through to the defaults below.
  }
  return {
    provider: stored?.provider || AI_PREF_FALLBACKS.provider,
    model: stored?.model || AI_PREF_FALLBACKS.model,
    effort: stored?.effort || AI_PREF_FALLBACKS.effort
  }
}

// ─── Key store (dynamic) ─────────────────────────────────────────────────

/**
 * Import key-store.js once, tolerating its absence.
 *
 * @returns {Promise<object|null>} the module namespace, or null when unavailable
 */
function loadKeyStore() {
  if (!keyStorePromise) {
    keyStorePromise = import('./key-store.js').catch(error => {
      log.warn(`ai: key-store module unavailable — ${error?.message || error}`)
      return null
    })
  }
  return keyStorePromise
}

function hasEnvKey(provider) {
  const names = Array.isArray(provider?.envKeyVars) ? provider.envKeyVars : []
  return names.some(name => {
    const value = process.env[name]
    return typeof value === 'string' && value.length > 0
  })
}

/**
 * Determine where this provider's key comes from, without ever reading the
 * value into a log line.
 *
 * @param {object} provider - provider descriptor
 * @returns {Promise<{hasKey: boolean, keySource: string|null, encryptionAvailable: boolean}>}
 */
async function readKeyInfo(provider) {
  // A provider that needs no credential has nothing to look up. This is also
  // what keeps the fake seam away from the key store — by honoring the
  // descriptor rather than branching on an env var, so there is no test-mode
  // code path in a production function.
  if (!provider.needsKey) {
    return { hasKey: true, keySource: null, encryptionAvailable: false }
  }

  const info = { hasKey: false, keySource: null, encryptionAvailable: false }

  const keyStore = await loadKeyStore()
  if (keyStore) {
    // Two independent probes with independent failure domains: safeStorage
    // can be unusable on a box that still has a key file on disk, and the
    // key file can be unreadable on a box where safeStorage works fine.
    // Neither failure may mask the other, hence two try blocks.
    try {
      info.encryptionAvailable = !!keyStore.encryptionAvailable()
    } catch (error) {
      log.warn(`ai: safeStorage probe failed — ${error?.message || error}`)
    }
    try {
      // hasStoredKey, not getKey: the status probe must not decrypt.
      if (await keyStore.hasStoredKey(provider.id)) {
        info.hasKey = true
        info.keySource = 'keyring'
      }
    } catch (error) {
      // A locked or missing keyring is a normal Linux state, not a crash:
      // the panel falls back to the environment and says so.
      log.warn(`ai: key-store lookup failed — ${error?.message || error}`)
    }
  }

  if (!info.hasKey && hasEnvKey(provider)) {
    info.hasKey = true
    info.keySource = 'env'
  }
  return info
}

/**
 * Resolve the key to hand the provider for one turn.
 *
 * Returns null when only an environment variable is present — the two env
 * vars need different auth headers, and the SDK resolves them correctly on
 * its own, whereas guessing here would send an OAuth token as an api key.
 *
 * @param {object} provider - provider descriptor
 * @returns {Promise<string|null>}
 * @throws {Error} typed 'auth' error when no key is configured at all
 */
async function resolveTurnKey(provider) {
  if (!provider.needsKey) return null

  const keyStore = await loadKeyStore()
  if (keyStore) {
    try {
      const storedKey = await keyStore.getKey(provider.id)
      if (typeof storedKey === 'string' && storedKey.length > 0) return storedKey
    } catch (error) {
      log.warn(`ai: key-store read failed, falling back to environment — ${error?.message || error}`)
    }
  }

  if (hasEnvKey(provider)) return null
  throw createProviderError('auth', 'No API key is configured. Add one in Settings, or set ANTHROPIC_API_KEY.')
}

// ─── Renderer push ───────────────────────────────────────────────────────

/**
 * Send one event to a renderer, tolerating a window that has gone away.
 *
 * @param {object} target - Electron webContents
 * @param {string} channel - IPC channel name
 * @param {object} payload - serializable payload
 * @returns {void}
 */
function send(target, channel, payload) {
  if (!target || typeof target.send !== 'function') return
  try {
    if (typeof target.isDestroyed === 'function' && target.isDestroyed()) return
    target.send(channel, payload)
  } catch (error) {
    // The window can close between the isDestroyed() check and the send.
    log.warn(`ai: dropped ${channel} — ${error?.message || error}`)
  }
}

function isStale(turn) {
  return turn.gen !== generation
}

function handleDelta(turn, chunk) {
  if (isStale(turn) || typeof chunk !== 'string' || chunk.length === 0) return
  turn.accumulatedText += chunk
  deltaBuffer += chunk
  if (deltaTimer) return
  deltaTimer = setTimeout(() => {
    deltaTimer = null
    flushDeltas(turn)
  }, DELTA_FLUSH_MS)
}

/**
 * Push whatever text has accumulated and clear the timer. Called on the
 * interval and once more at every terminal state, so no tail is ever lost.
 *
 * @param {object} turn - the turn owning the buffered text
 * @returns {void}
 */
function flushDeltas(turn) {
  if (deltaTimer) {
    clearTimeout(deltaTimer)
    deltaTimer = null
  }
  if (!deltaBuffer) return
  const text = deltaBuffer
  deltaBuffer = ''
  send(turn.target, 'ai:delta', { turnId: turn.turnId, text })
}

function emitTurnState(turn, { state, stopReason, usage, error }) {
  const payload = { turnId: turn.turnId, state }
  if (stopReason) payload.stopReason = stopReason
  if (usage) payload.usage = usage
  if (error) payload.error = error
  send(turn.target, 'ai:turn', payload)
}

// ─── Tool bridge ─────────────────────────────────────────────────────────

/**
 * Ask the renderer to execute one tool call and wait for its answer.
 *
 * The returned promise is parked in pendingToolCalls until handleToolResult
 * settles it — that is the whole bridge between the main-process agent loop
 * and the renderer-side tool implementations.
 *
 * @param {string} name - tool name
 * @param {object} input - parsed tool input
 * @returns {Promise<unknown>} the renderer's result
 */
function dispatchToolCall(name, input) {
  const turn = activeTurn
  if (!turn) {
    return Promise.reject(new Error(`Tool ${name} was called with no active turn.`))
  }
  turn.callCounter += 1
  const callId = `${turn.turnId}-call-${turn.callCounter}`
  send(turn.target, 'ai:tool-call', { turnId: turn.turnId, callId, name, input })

  return new Promise((resolve, reject) => {
    // Deadline, not a latency budget: a renderer that crashes, navigates, or
    // simply never answers must not park this promise — and the turn holding
    // the single-flight slot — for the life of the app.
    const timer = setTimeout(() => {
      pendingToolCalls.delete(callId)
      reject(createProviderError('api', `Tool "${name}" timed out after ${TOOL_CALL_TIMEOUT_MS / 1000}s with no result.`))
    }, TOOL_CALL_TIMEOUT_MS)

    pendingToolCalls.set(callId, { resolve, reject, timer })
  })
}

/**
 * Wrap a tool definition so its run() routes through the renderer bridge.
 *
 * @param {{name: string, description: string, inputSchema: object}} definition
 * @returns {object} provider-neutral runnable tool
 */
function buildBridgedTool(definition) {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    run: input => dispatchToolCall(definition.name, input)
  }
}

/**
 * Fail every parked tool call. A turn that ended cannot answer them, and a
 * promise nobody will ever settle would pin the SDK loop forever.
 *
 * @param {string} reason - message for the rejection
 * @returns {void}
 */
function clearPendingToolCalls(reason) {
  const parked = [...pendingToolCalls.values()]
  pendingToolCalls.clear()
  for (const pending of parked) {
    clearTimeout(pending.timer)
    pending.reject(new Error(reason))
  }
}

// ─── Turn lifecycle ──────────────────────────────────────────────────────

/**
 * Per-turn context that must NOT be cached. Phase C returns the selected
 * element, open page, and current CSS here.
 *
 * @returns {string|null} context text, or null when there is none
 */
function getVolatileContext() {
  return null
}

/**
 * Build the message array for one request.
 *
 * Volatile context is merged into the newest user turn only. Putting it in
 * the system prompt or an older message would change the cached prefix and
 * throw away every cache hit.
 *
 * @returns {Array<{role: string, content: unknown}>}
 */
function buildTurnMessages() {
  const messages = history.map(entry => ({ role: entry.role, content: entry.content }))
  const context = getVolatileContext()
  if (!context) return messages

  const newest = messages[messages.length - 1]
  if (newest?.role !== 'user' || typeof newest.content !== 'string') return messages
  messages[messages.length - 1] = { role: 'user', content: `${context}\n\n${newest.content}` }
  return messages
}

/**
 * Record the assistant's reply, or undo the user entry when there was none.
 *
 * An empty reply is a real outcome — a refusal, an auth failure before the
 * first token, a cancel on the first tick. Appending it is impossible (an
 * empty assistant message is not a valid message), but leaving the user entry
 * behind is worse: the NEXT turn would then send two consecutive user roles,
 * which the API rejects with a 400 that sticks to every later turn until the
 * user hits Reset. So the turn's own user entry comes back out.
 *
 * @param {string} text - assistant text, possibly partial
 * @returns {void}
 */
function recordAssistantReply(text) {
  const trimmed = typeof text === 'string' ? text.trim() : ''
  if (trimmed) {
    history.push({ role: 'assistant', content: trimmed })
    return
  }
  // Single-flight plus the generation guard mean the trailing entry can only
  // be this turn's user message, but check the role rather than assume it.
  if (history[history.length - 1]?.role === 'user') history.pop()
}

/**
 * Enforce the conversation cap by dropping the oldest whole exchanges.
 *
 * Two entries at a time, from the front: dropping one would leave the array
 * starting on an assistant entry, and "first message must be user" is its own
 * 400. Called only after a completed turn, when the array is a clean sequence
 * of user/assistant pairs.
 *
 * @returns {void}
 */
function trimHistory() {
  while (history.length > MAX_HISTORY_ENTRIES) {
    history.splice(0, 2)
  }
}

/**
 * Close out a turn: flush text, settle the tool bridge, record the reply,
 * release the single-flight slot, and emit exactly one terminal event.
 *
 * @param {object} turn - the turn to close
 * @param {{state: string, stopReason?: string, usage?: object, error?: object, assistantText?: string}} outcome
 * @returns {void}
 */
function finishTurn(turn, { state, stopReason, usage, error, assistantText }) {
  flushDeltas(turn)
  clearPendingToolCalls(`Turn ${turn.turnId} ended (${state}).`)
  recordAssistantReply(assistantText)
  trimHistory()
  if (activeTurn === turn) activeTurn = null
  emitTurnState(turn, { state, stopReason, usage, error })
}

/**
 * Drive one turn to a terminal state. Never rejects — every failure path
 * ends in an ai:turn event.
 *
 * @param {object} turn - the turn record created by sendTurn
 * @returns {Promise<void>}
 */
async function runTurn(turn) {
  const settings = readAiSettings()
  const provider = getProvider(settings.provider)

  try {
    const key = await resolveTurnKey(provider)
    if (isStale(turn)) return

    const result = await provider.createTurn({
      key,
      model: settings.model,
      effort: settings.effort,
      system: SYSTEM_PROMPT,
      messages: buildTurnMessages(),
      tools: RENDERER_TOOL_DEFINITIONS.map(buildBridgedTool),
      signal: turn.abortController.signal,
      onDelta: chunk => handleDelta(turn, chunk)
    })

    // A cancel or reset landed while the request was open: that path already
    // emitted its own terminal event, so this completion is dropped.
    if (isStale(turn)) return

    finishTurn(turn, {
      state: 'done',
      stopReason: result?.stopReason || 'end_turn',
      usage: result?.usage || null,
      assistantText: result?.text || turn.accumulatedText
    })
  } catch (error) {
    if (isStale(turn)) return
    finishTurn(turn, {
      state: 'error',
      error: toTurnError(error),
      assistantText: turn.accumulatedText
    })
  }
}

/**
 * Cancel the in-flight turn when its renderer navigates or goes away.
 * Attached once per webContents — without it, a reload mid-turn would hold
 * the single-flight slot for the rest of the app's life.
 *
 * @param {object} target - Electron webContents
 * @returns {void}
 */
function watchNavigation(target) {
  if (navigationWatched.has(target)) return
  navigationWatched.add(target)

  const handleTargetGone = () => {
    if (activeTurn && activeTurn.target === target) cancelTurn()
  }
  target.on('did-navigate', handleTargetGone)
  target.on('destroyed', handleTargetGone)
}

// ─── Exported surface (called by the ai:* IPC handlers) ──────────────────

/**
 * Current provider/model/effort plus where the key is coming from.
 *
 * Reports the configured provider AND the resolved one. They differ under the
 * fake seam and whenever prefs name a provider that no longer exists — and a
 * renderer that saw only the resolved id would file the user's key under the
 * wrong provider account.
 *
 * Async because the key store is imported dynamically; ipcMain.handle awaits
 * the returned promise.
 *
 * @returns {Promise<{ok: boolean, provider: string, effectiveProvider: string,
 *                    model: string, effort: string, hasKey: boolean,
 *                    keySource: string|null, encryptionAvailable: boolean}>}
 */
export async function getStatus() {
  const settings = readAiSettings()
  const provider = getProvider(settings.provider)
  const keyInfo = await readKeyInfo(provider)

  return {
    ok: true,
    provider: settings.provider,
    effectiveProvider: provider.id,
    model: settings.model,
    effort: settings.effort,
    hasKey: keyInfo.hasKey,
    keySource: keyInfo.keySource,
    encryptionAvailable: keyInfo.encryptionAvailable
  }
}

/**
 * Check a key against a provider before it is stored.
 *
 * @param {string} providerId - provider to test the key against
 * @param {string} key - the key as typed by the user
 * @returns {Promise<{ok: true} | {ok: false, error: {type: string, message: string}}>}
 */
export async function validateKey(providerId, key) {
  try {
    return await getProvider(providerId).validateKey(key)
  } catch (error) {
    // Providers are contracted not to reject here, but this result crosses
    // the IPC bridge — a leaked rejection would surface as an unhandled
    // invoke failure rather than a message the settings panel can show.
    log.warn(`ai: validateKey threw for provider "${providerId}" — ${error?.message || error}`)
    return { ok: false, error: createResultError('api', 'Could not check the key.') }
  }
}

/**
 * Start a turn. Returns immediately with the turn id; the answer arrives as
 * ai:delta / ai:turn events on the supplied webContents.
 *
 * @param {string} text - the user's message
 * @param {object} webContents - Electron webContents to push events to
 * @returns {{ok: true, turnId: string} | {ok: false, error: {type: string, message: string}}}
 */
export function sendTurn(text, webContents) {
  const message = typeof text === 'string' ? text.trim() : ''
  if (!message) {
    return { ok: false, error: createResultError('invalid', 'Cannot send an empty message.') }
  }
  if (!webContents || typeof webContents.send !== 'function') {
    return { ok: false, error: createResultError('invalid', 'No renderer target for this turn.') }
  }
  // Single-flight: checked and claimed synchronously, before any await, so
  // two IPC calls in the same tick cannot both win the slot.
  if (activeTurn) {
    return { ok: false, error: createResultError('busy', 'A turn is already running — cancel it first.') }
  }

  generation += 1
  turnCounter += 1
  const turn = {
    turnId: `turn-${turnCounter}`,
    gen: generation,
    target: webContents,
    abortController: new AbortController(),
    accumulatedText: '',
    callCounter: 0
  }
  activeTurn = turn

  history.push({ role: 'user', content: message })
  watchNavigation(webContents)
  emitTurnState(turn, { state: 'running' })

  // Deliberately not awaited — the IPC caller gets its turn id now. runTurn
  // maps every failure to a terminal event, so the catch here only exists to
  // keep a bug in that mapping from surfacing as an unhandled rejection.
  runTurn(turn).catch(error => {
    log.error(`ai: turn ${turn.turnId} failed outside its own handler — ${error?.message || error}`)
    if (activeTurn === turn) activeTurn = null
  })

  return { ok: true, turnId: turn.turnId }
}

/**
 * Abort the in-flight turn. The partial reply is kept in history so the
 * conversation still reads correctly.
 *
 * @returns {{ok: true, turnId: string|null}}
 */
export function cancelTurn() {
  const turn = activeTurn
  if (!turn) return { ok: true, turnId: null }

  try {
    turn.abortController.abort()
  } catch (error) {
    // An already-aborted controller throws on some Node versions; the
    // terminal event below is what actually matters.
    log.warn(`ai: abort failed for ${turn.turnId} — ${error?.message || error}`)
  }

  finishTurn(turn, { state: 'cancelled', assistantText: turn.accumulatedText })
  // Bumped AFTER the terminal event so 'cancelled' actually ships; the
  // provider promise still in flight then sees a new generation and drops.
  generation += 1
  return { ok: true, turnId: turn.turnId }
}

/**
 * Clear the conversation. Cancels an in-flight turn first — otherwise its
 * reply would land in the fresh history the user just asked for.
 *
 * @returns {{ok: true}}
 */
export function resetHistory() {
  cancelTurn()
  history = []
  deltaBuffer = ''
  generation += 1
  return { ok: true }
}

/**
 * Deliver a renderer-executed tool's result back into the agent loop.
 *
 * @param {{callId: string, result: unknown, isError: boolean}} payload
 * @returns {{ok: true} | {ok: false, error: {type: string, message: string}}}
 */
export function handleToolResult({ callId, result, isError } = {}) {
  const pending = pendingToolCalls.get(callId)
  if (!pending) {
    // Late result from a cancelled or timed-out call, or a callId the
    // renderer invented.
    return { ok: false, error: createResultError('unknown-call', `No pending tool call for id ${callId}.`) }
  }
  pendingToolCalls.delete(callId)
  clearTimeout(pending.timer)

  if (isError) {
    // Rejecting is what makes the SDK tool runner send is_error: true.
    pending.reject(new Error(typeof result === 'string' ? result : 'Tool execution failed.'))
  } else {
    pending.resolve(result)
  }
  return { ok: true }
}

/**
 * Models offered by the configured provider.
 *
 * Returns the bare array — the ai:list-models handler is what wraps it in
 * an { ok, models } envelope for the bridge.
 *
 * @returns {Array<{id: string, label: string}>}
 */
export function listModels() {
  const settings = readAiSettings()
  const provider = getProvider(settings.provider)
  return provider.listModels()
}
