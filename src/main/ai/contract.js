// =============================================================
// PATH: src/main/ai/contract.js
// ROLE: The shared AI contract — provider descriptor shape, curated model
//       list, and the two error vocabularies every ai/* module speaks
// DEPENDS: none (leaf module by design — everything else in ai/ imports it)
// CREATED: 2026-08-30
// =============================================================
//
// ─── Provider descriptor ──────────────────────────────────────────────────
//
//   {
//     id            string   stable key, also the key-store account name
//     label         string   human name for the settings dropdown
//     needsKey      boolean  false ⇒ the session never touches the key store
//     envKeyVars    string[] env vars that count as "a key is present"
//     validateKey(key)                 → { ok: true } | { ok: false, error }
//     listModels()                     → [{ id, label, supportsEffort }, ...]
//     createTurn({ key, model, effort, system, messages, tools,
//                  signal, onDelta })  → { stopReason, text, usage }
//   }
//
// createTurn resolves on refusal (stopReason 'refusal') and rejects only on
// failure. validateKey never rejects — its result crosses the IPC bridge,
// where a thrown Error arrives as a bare string with the typed shape gone.
//
// `tools` is the provider-neutral shape { name, description, inputSchema,
// run(input) }; each provider adapts it to its own SDK.
//
// ─── Two error vocabularies, deliberately different ───────────────────────
//
// TURN_ERROR_TYPES — what an `ai:turn` event's `error.type` may be. These
// describe a FAILED MODEL CALL, so the panel can offer the right recovery
// (re-enter key, wait and retry, check the network). Anything unrecognized
// normalizes to 'api'.
//
//   auth        credential rejected or missing
//   rate-limit  429 — retry later
//   network     connection failed before a response
//   api         any other API-side failure
//
// RESULT_ERROR_TYPES — what an `error.type` may be on a value RETURNED from
// an ipcMain.handle call (never pushed as an event). A superset: it adds the
// four ways a request can be refused before any model call happens. Keeping
// these separate is what stops "you typed nothing" from rendering with the
// same recovery affordance as "your key is bad".
//
//   …all of the above, plus:
//   busy                   a turn is already running (single-flight)
//   invalid                caller-side bad input
//   unknown-call           tool result for a callId nobody is waiting on
//   encryption-unavailable safeStorage cannot encrypt on this system

export const TURN_ERROR_TYPES = Object.freeze(new Set([
  'auth',
  'rate-limit',
  'network',
  'api'
]))

export const RESULT_ERROR_TYPES = Object.freeze(new Set([
  ...TURN_ERROR_TYPES,
  'busy',
  'invalid',
  'unknown-call',
  'encryption-unavailable'
]))

/**
 * Curated model list. These id strings are exact and complete — never append
 * a date suffix, and never build one by hand.
 *
 * `supportsEffort` gates `output_config.effort`: sending it to a model that
 * does not accept it is a hard 400, whereas omitting it just means the
 * documented default. Haiku 4.5 predates the effort parameter.
 */
export const CURATED_MODELS = Object.freeze([
  Object.freeze({ id: 'claude-opus-5', label: 'Claude Opus 5', supportsEffort: true }),
  Object.freeze({ id: 'claude-sonnet-5', label: 'Claude Sonnet 5', supportsEffort: true }),
  Object.freeze({ id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', supportsEffort: false })
])

/**
 * Build a typed provider error — an Error (so stacks and `instanceof Error`
 * still work) carrying the `type` an ai:turn payload switches on.
 *
 * @param {string} type - a TURN_ERROR_TYPES member
 * @param {string} message - human-readable failure text (never a key value)
 * @returns {Error} error with a `.type` property
 */
export function createProviderError(type, message) {
  const error = new Error(message)
  error.type = type
  return error
}

/**
 * Normalize a thrown value into an ai:turn `error` payload.
 *
 * @param {unknown} error - whatever was thrown
 * @returns {{type: string, message: string}} always a TURN_ERROR_TYPES member
 */
export function toTurnError(error) {
  const type = TURN_ERROR_TYPES.has(error?.type) ? error.type : 'api'
  return { type, message: error?.message || 'Unknown provider error.' }
}

/**
 * Build the `error` half of a failed invoke return value.
 *
 * An unrecognized type collapses to 'api' rather than travelling to the
 * renderer as a string no switch statement handles.
 *
 * @param {string} type - a RESULT_ERROR_TYPES member
 * @param {string} message - human-readable text
 * @returns {{type: string, message: string}}
 */
export function createResultError(type, message) {
  return { type: RESULT_ERROR_TYPES.has(type) ? type : 'api', message }
}
