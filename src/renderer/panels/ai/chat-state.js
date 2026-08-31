/**
 * GrapeStrap — AI chat transcript model
 *
 * PATH: src/renderer/panels/ai/chat-state.js
 * ROLE: DOM-free transcript store for the AI panel — ordered messages,
 *       streaming append, and a subscribe() feed the panel paints from
 * DEPENDS: log.js (house logger only — no DOM, no IPC, no editor state)
 * CREATED: 2026-08-30
 *
 * The store lives at MODULE scope on purpose. Golden Layout re-invokes panel
 * factories on every workspace apply and Reset Layout; a transcript owned by
 * the factory closure would be wiped each time the user reset the layout.
 * Module scope here plus the persistent root in index.js is what makes a
 * layout reset non-destructive.
 *
 * Message shape — { id, role, kind, text, streaming }:
 *   role       'user' | 'assistant'  actual conversation turns
 *              'notice'              non-model UI line (refusal, stop, tool)
 *              'error'               a send or a turn that failed
 *   kind       row sub-type, surfaced as data-ai-kind in the DOM:
 *              'message' for user/assistant rows, otherwise the reason
 *              ('refusal', 'cancelled', 'tool', or an AI error type such as
 *              'busy' / 'auth'). Lets a caller tell two notice rows apart
 *              without string-matching their prose.
 *   text       PLAIN TEXT, never HTML. index.js writes it with textContent —
 *              model output is untrusted and must never reach innerHTML.
 *   streaming  true while deltas are still landing on this message
 *
 * subscribe(cb) calls back with { type, message } after every mutation, where
 * type is 'added' | 'updated' | 'removed' | 'cleared' (message is null for
 * 'cleared'). The feed is incremental by design: a full repaint per delta
 * would fight the panel's autoscroll and burn a layout pass on every chunk.
 */

import { log } from '../../log.js'

const MESSAGE_ROLES = new Set(['user', 'assistant', 'notice', 'error'])
const DEFAULT_KIND = 'message'

let messages = []
let subscribers = []
let nextMessageId = 1

/**
 * Hand out a detached copy so a consumer can never mutate stored state by
 * holding on to a message it was handed.
 *
 * @param {object} message - stored message record
 * @returns {object} shallow copy
 */
function copyOf(message) {
  return { ...message }
}

/**
 * Fan a change out to every subscriber.
 *
 * @param {string} type - 'added' | 'updated' | 'removed' | 'cleared'
 * @param {object|null} message - the message the change is about
 * @returns {void}
 */
function notify(type, message) {
  const change = { type, message: message ? copyOf(message) : null }
  // Iterate a snapshot: a subscriber that unsubscribes from inside its own
  // callback would otherwise shift the array mid-loop and skip the next one.
  for (const subscriber of [...subscribers]) {
    try {
      subscriber(change)
    } catch (error) {
      // One broken renderer must not stop the others from painting, and it
      // must never take down the IPC handler that triggered the change.
      log.error('chat-state subscriber threw:', error)
    }
  }
}

/**
 * Append a message and announce it.
 *
 * @param {string} role - one of MESSAGE_ROLES
 * @param {string} text - plain text body
 * @param {object} [options]
 * @param {string} [options.kind='message'] - row sub-type
 * @param {boolean} [options.streaming=false] - true while deltas keep landing
 * @returns {object|null} copy of the stored message, or null when rejected
 */
function addMessage(role, text, { kind = DEFAULT_KIND, streaming = false } = {}) {
  if (!MESSAGE_ROLES.has(role)) {
    log.error(`chat-state: refusing unknown role "${role}"`)
    return null
  }
  const message = {
    id: `ai-message-${nextMessageId}`,
    role,
    kind: typeof kind === 'string' && kind ? kind : DEFAULT_KIND,
    text: typeof text === 'string' ? text : '',
    streaming: !!streaming
  }
  nextMessageId += 1
  messages.push(message)
  notify('added', message)
  return copyOf(message)
}

/**
 * Look up a stored message by id.
 *
 * @param {string} id - message id
 * @returns {object|undefined} the LIVE record (internal use only)
 */
function findMessage(id) {
  return messages.find(message => message.id === id)
}

/** @returns {number} how many messages the transcript currently holds */
export function count() {
  return messages.length
}

/** @returns {Array<object>} detached copies, in transcript order */
export function getMessages() {
  return messages.map(copyOf)
}

/**
 * Record what the user just sent.
 *
 * @param {string} text - the user's message
 * @returns {object|null} copy of the stored message
 */
export function addUserMessage(text) {
  return addMessage('user', text, { kind: 'message' })
}

/**
 * Open an empty assistant message that deltas will fill in.
 *
 * @returns {object|null} copy of the stored message (its id is the append handle)
 */
export function startAssistantMessage() {
  return addMessage('assistant', '', { kind: 'message', streaming: true })
}

/**
 * Add a non-model UI line — a refusal, a cancellation, a tool announcement.
 *
 * @param {string} text - plain text body
 * @param {string} kind - reason, e.g. 'refusal' | 'cancelled' | 'tool'
 * @returns {object|null} copy of the stored message
 */
export function addNotice(text, kind) {
  return addMessage('notice', text, { kind })
}

/**
 * Add a failure row.
 *
 * @param {string} text - already-resolved, user-facing failure text
 * @param {string} kind - AI error type, e.g. 'auth' | 'busy' | 'network'
 * @returns {object|null} copy of the stored message
 */
export function addError(text, kind) {
  return addMessage('error', text, { kind })
}

/**
 * Append a streamed chunk to an open message.
 *
 * @param {string} id - id from startAssistantMessage()
 * @param {string} chunk - next slice of model text
 * @returns {object|null} copy of the updated message, or null when the id is
 *          unknown (a delta for a message the panel already finalized)
 */
export function appendDelta(id, chunk) {
  const message = findMessage(id)
  if (!message) return null
  if (typeof chunk !== 'string' || !chunk) return copyOf(message)
  message.text += chunk
  notify('updated', message)
  return copyOf(message)
}

/**
 * Close an open message — no further deltas are expected.
 *
 * @param {string} id - message id
 * @returns {object|null} copy of the finalized message, or null when unknown
 */
export function finishMessage(id) {
  const message = findMessage(id)
  if (!message) return null
  if (message.streaming) {
    message.streaming = false
    notify('updated', message)
  }
  return copyOf(message)
}

/**
 * Drop one message — used for an assistant row a turn ended without filling
 * (a refusal streams no text, and an empty bubble reads as a rendering bug).
 *
 * @param {string} id - message id
 * @returns {boolean} true when a message was removed
 */
export function removeMessage(id) {
  const index = messages.findIndex(message => message.id === id)
  if (index === -1) return false
  const [removed] = messages.splice(index, 1)
  notify('removed', removed)
  return true
}

/**
 * Empty the transcript (New chat). Ids keep counting up so a stale row
 * reference from the outgoing transcript can never match a new message.
 *
 * @returns {void}
 */
export function clear() {
  messages = []
  notify('cleared', null)
}

/**
 * Subscribe to transcript changes.
 *
 * @param {Function} callback - called with { type, message }
 * @returns {Function} unsubscribe (idempotent)
 */
export function subscribe(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('chat-state subscribe: callback must be a function')
  }
  subscribers.push(callback)
  return () => {
    subscribers = subscribers.filter(entry => entry !== callback)
  }
}

// Single namespaced handle so the panel reads as `chatState.addUserMessage(…)`
// rather than eight loose imports — same shape as state/project-state.js.
export const chatState = Object.freeze({
  count,
  getMessages,
  addUserMessage,
  startAssistantMessage,
  addNotice,
  addError,
  appendDelta,
  finishMessage,
  removeMessage,
  clear,
  subscribe
})
