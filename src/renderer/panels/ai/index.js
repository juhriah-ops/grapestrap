/**
 * GrapeStrap — AI agent panel
 *
 * PATH: src/renderer/panels/ai/index.js
 * ROLE: Golden Layout panel factory for the v0.2 AI chat — transcript,
 *       composer, streaming render, and the window.__gstrap.ai test surface
 * DEPENDS: panels/ai/chat-state.js, i18n.js, log.js, preload bridge (window.grapestrap.ai)
 * CREATED: 2026-08-30
 *
 * Idempotency contract (Wave 3 house rule, same shape as panels/custom-css
 * and panels/canvas): GL's loadLayout — workspace apply, Reset Layout —
 * re-invokes this factory against a brand-new host element. The chat DOM is
 * built exactly ONCE inside a module-held persistent subtree that later runs
 * simply re-parent, and every subscription (chat-state, ai:delta, ai:turn,
 * ai:tool-call) is behind a wire-once guard. Without both, a Reset Layout
 * would wipe the conversation and stack a duplicate IPC listener per reset.
 *
 * SECURITY: every model-, user-, and main-supplied string in this panel is
 * written with textContent. innerHTML is used once, for a STATIC shell with
 * no interpolation — labels are filled in afterwards. Model output is
 * untrusted input; treat any innerHTML here as a defect.
 *
 * i18n: strings go through the house t() only — there is deliberately no
 * local English fallback table. initI18n() completes before initGoldenLayout()
 * in boot(), so the catalog is live by this panel's first paint, and a second
 * copy of the English strings would silently drift from lang-en/messages.json.
 * A key the catalog is missing renders as the key, which is the house
 * contract and is loud enough to catch in review.
 *
 * State lives in data-* attributes and pre-defined classes, never inline
 * styles: data-ai-state="idle|running" and data-ai-linked="true|false" on
 * the host, data-ai-role / data-ai-kind on each row. styles/ai-panel.css
 * owns every rule that reads them.
 */

import { t } from '../../i18n.js'
import { log } from '../../log.js'
import { chatState } from './chat-state.js'

// How close to the bottom the transcript must already be for a new message to
// pull the view down with it. Above that, the user is reading back and the
// scroll position is left alone.
const NEAR_BOTTOM_THRESHOLD_PX = 48

// ai:turn states that end a turn. 'running' is the only other state main
// emits; anything else is a contract drift and gets logged, not acted on.
const TERMINAL_TURN_STATES = new Set(['done', 'cancelled', 'error'])

// Row modifier class per transcript role. Closed set — a role outside it is a
// chat-state bug, not a styling decision.
const ROLE_ROW_CLASSES = {
  user: 'gstrap-ai-msg-user',
  assistant: 'gstrap-ai-msg-assistant',
  notice: 'gstrap-ai-msg-notice',
  error: 'gstrap-ai-msg-error'
}

// Static shell. No interpolation: every label is set with textContent by
// applyStaticLabels() once the elements exist.
const SHELL_HTML = `
  <div class="gstrap-ai-transcript" data-region="ai-transcript">
    <div class="gstrap-ai-empty" data-ai-kind="ready">
      <div class="gstrap-ai-empty-title"></div>
      <div class="gstrap-ai-empty-body"></div>
    </div>
    <div class="gstrap-ai-msg gstrap-ai-msg-notice" data-ai-kind="thinking" hidden></div>
  </div>
  <div class="gstrap-ai-composer">
    <textarea class="gstrap-ai-input" data-region="ai-input" rows="3"></textarea>
    <div class="gstrap-ai-composer-actions">
      <button type="button" class="gstrap-ai-send"  data-ai-action="send"></button>
      <button type="button" class="gstrap-ai-stop"  data-ai-action="stop" hidden></button>
      <button type="button" class="gstrap-ai-reset" data-ai-action="reset"></button>
    </div>
  </div>
`

// ─── Module state (survives factory re-runs) ───────────────────────────────

let persistentRoot = null
let hostElement = null
let transcriptElement = null
let emptyElement = null
let emptyTitleElement = null
let emptyBodyElement = null
let thinkingElement = null
let inputElement = null
let sendButton = null
let stopButton = null
let resetButton = null

// message id → its row element. A map rather than a data-ai-id query: row
// lookup happens once per streamed chunk, and it keeps generated ids out of
// a selector string entirely.
const rowElementsById = new Map()

let eventsWired = false
// Fail OPEN until ai:status answers: a panel that starts locked would stay
// locked on any box where the status probe is slow or throws.
let isLinked = true
let isTurnRunning = false
let activeTurnId = null
let streamingMessageId = null
let autoscrollScheduled = false

/**
 * Golden Layout panel factory. Receives the container's DOM element, matching
 * every other PANEL_FACTORIES entry (golden-layout-config.js registers them as
 * `container => render(container.element)`).
 *
 * @param {HTMLElement} host - the GL .lm_content element for this panel
 * @returns {void}
 */
export function renderAiPanel(host) {
  hostElement = host
  host.classList.add('gstrap-ai-host')

  if (persistentRoot) {
    // GL re-invoked us (workspace apply / Reset Layout): re-parent the living
    // chat subtree. The transcript, scroll position, and in-flight turn all
    // come along untouched; only the host attributes need re-stamping because
    // the host element itself is new.
    host.appendChild(persistentRoot)
    applyHostState()
    // Re-probe on every mount. The key can have been added in Preferences
    // since the last mount, and without this the panel would stay latched in
    // its not-linked empty state until the app restarted.
    refreshLinkedState()
    scheduleAutoscroll()
    return
  }

  persistentRoot = document.createElement('div')
  persistentRoot.className = 'gstrap-persistent-root'
  persistentRoot.innerHTML = SHELL_HTML
  host.appendChild(persistentRoot)

  cacheElements()
  applyStaticLabels()
  applyEmptyState()
  wireAiPanel()
  // Paints nothing on a cold start; it is the safety net for the case where
  // the shell is rebuilt while the module-scope transcript already holds
  // messages, so the DOM can never disagree with the model.
  repaintTranscript()
  applyHostState()
  applyControlState()

  // Fire-and-forget: the composer is usable while this resolves (fail-open),
  // and the result only changes which empty state is shown.
  refreshLinkedState()
}

/**
 * Resolve the shell's elements into module bindings. Runs once — the shell is
 * never rebuilt, so these can never go stale on a detached node.
 *
 * @returns {void}
 */
function cacheElements() {
  transcriptElement = persistentRoot.querySelector('.gstrap-ai-transcript')
  emptyElement = persistentRoot.querySelector('.gstrap-ai-empty')
  emptyTitleElement = persistentRoot.querySelector('.gstrap-ai-empty-title')
  emptyBodyElement = persistentRoot.querySelector('.gstrap-ai-empty-body')
  thinkingElement = persistentRoot.querySelector('[data-ai-kind="thinking"]')
  inputElement = persistentRoot.querySelector('.gstrap-ai-input')
  sendButton = persistentRoot.querySelector('.gstrap-ai-send')
  stopButton = persistentRoot.querySelector('.gstrap-ai-stop')
  resetButton = persistentRoot.querySelector('.gstrap-ai-reset')
}

/**
 * Fill in the labels that never change after the first paint.
 *
 * @returns {void}
 */
function applyStaticLabels() {
  inputElement.placeholder = t('ai.placeholder')
  sendButton.textContent = t('ai.send')
  stopButton.textContent = t('ai.stop')
  resetButton.textContent = t('ai.reset')
  thinkingElement.textContent = t('ai.state.thinking')
}

/**
 * Turn a turn/send error payload into a line the user can act on.
 *
 * Prefers ai.error.<type> so a translator controls the wording; an error type
 * with no key of its own (main also emits 'invalid' and 'unknown-call') falls
 * through to main's own message, which is the only thing left that says
 * anything specific about what went wrong.
 *
 * @param {{type?: string, message?: string}} [error] - error from ai:turn or ai.send
 * @returns {string} user-facing text
 */
function errorRowText(error) {
  const type = typeof error?.type === 'string' ? error.type : ''
  if (type) {
    const key = `ai.error.${type}`
    // t() returns the key verbatim when the catalog has no entry — that is
    // the miss signal, and the cue to use main's message instead.
    const resolved = t(key)
    if (resolved && resolved !== key) return resolved
  }
  return error?.message || t('ai.error.api')
}

// ─── Rendering ─────────────────────────────────────────────────────────────

/**
 * Build one transcript row.
 *
 * @param {{id: string, role: string, kind: string, text: string, streaming: boolean}} message
 * @returns {HTMLElement} the row (not yet attached)
 */
function buildRow(message) {
  const row = document.createElement('div')
  row.className = 'gstrap-ai-msg'
  const roleClass = ROLE_ROW_CLASSES[message.role]
  if (roleClass) row.classList.add(roleClass)
  // A tool announcement is a notice that reads differently — it gets its own
  // class on top of the notice layout rather than a fifth role class.
  if (message.kind === 'tool') row.classList.add('gstrap-ai-toolrow')
  row.dataset.aiId = message.id
  row.dataset.aiRole = message.role
  row.dataset.aiKind = message.kind
  if (message.streaming) row.dataset.aiStreaming = 'true'
  // textContent, never innerHTML — this is model/user text.
  row.textContent = message.text
  return row
}

/**
 * Append a row, keeping the thinking indicator pinned to the bottom of the
 * transcript (it is a transient UI element, not a transcript entry, so it
 * lives outside chat-state and is simply re-appended after each insert).
 *
 * @param {object} message - the added message
 * @returns {void}
 */
function appendRow(message) {
  const row = buildRow(message)
  rowElementsById.set(message.id, row)
  transcriptElement.appendChild(row)
  transcriptElement.appendChild(thinkingElement)
}

/**
 * Push a message's current text into its existing row.
 *
 * @param {object} message - the updated message
 * @returns {void}
 */
function updateRow(message) {
  const row = rowElementsById.get(message.id)
  if (!row) return
  row.textContent = message.text
  if (message.streaming) row.dataset.aiStreaming = 'true'
  else delete row.dataset.aiStreaming
}

/**
 * Drop a message's row.
 *
 * @param {object} message - the removed message
 * @returns {void}
 */
function removeRow(message) {
  const row = rowElementsById.get(message.id)
  if (!row) return
  row.remove()
  rowElementsById.delete(message.id)
}

/**
 * Rebuild every row from the model. Only the 'cleared' path needs it — every
 * other change is applied incrementally so a stream doesn't repaint the whole
 * transcript per chunk.
 *
 * Sweeps the DOM by attribute rather than trusting the map, so a rebuilt
 * shell (map still holding detached nodes) cannot leave orphan rows behind.
 *
 * @returns {void}
 */
function repaintTranscript() {
  for (const row of transcriptElement.querySelectorAll('[data-ai-id]')) row.remove()
  rowElementsById.clear()
  for (const message of chatState.getMessages()) appendRow(message)
  transcriptElement.appendChild(thinkingElement)
}

/**
 * Apply one chat-state change to the DOM, then decide about scrolling.
 *
 * The "was the user already at the bottom" reading is taken BEFORE the DOM
 * mutation — afterwards the new content has already changed scrollHeight and
 * every append would look like a scroll-back.
 *
 * @param {{type: string, message: object|null}} change - chat-state payload
 * @returns {void}
 */
function handleTranscriptChange(change) {
  if (!transcriptElement) return
  const shouldStickToBottom = isNearBottom()

  if (change.type === 'cleared') repaintTranscript()
  else if (change.type === 'added') appendRow(change.message)
  else if (change.type === 'updated') updateRow(change.message)
  else if (change.type === 'removed') removeRow(change.message)

  applyControlState()
  if (shouldStickToBottom) scheduleAutoscroll()
}

/**
 * @returns {boolean} true when the transcript is scrolled to (or near) the end,
 *          and also when it does not overflow at all
 */
function isNearBottom() {
  if (!transcriptElement) return true
  const distanceFromBottom =
    transcriptElement.scrollHeight - transcriptElement.scrollTop - transcriptElement.clientHeight
  return distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX
}

/**
 * Coalesce autoscrolls into one per frame. A stream can deliver several
 * deltas inside a single frame; scrolling per delta would force that many
 * layout flushes for one visible result.
 *
 * @returns {void}
 */
function scheduleAutoscroll() {
  if (autoscrollScheduled) return
  autoscrollScheduled = true
  requestAnimationFrame(() => {
    autoscrollScheduled = false
    if (transcriptElement) transcriptElement.scrollTop = transcriptElement.scrollHeight
  })
}

// ─── Panel state ───────────────────────────────────────────────────────────

/**
 * Stamp the host's state attributes. Called on every factory run because the
 * host element is replaced by GL each time; ai-panel.css reads these.
 *
 * @returns {void}
 */
function applyHostState() {
  if (!hostElement) return
  hostElement.dataset.aiState = isTurnRunning ? 'running' : 'idle'
  hostElement.dataset.aiLinked = isLinked ? 'true' : 'false'
}

/**
 * Reconcile every control with the current turn/link state.
 *
 * @returns {void}
 */
function applyControlState() {
  if (!inputElement) return
  const hasMessages = chatState.count() > 0

  inputElement.disabled = !isLinked
  sendButton.disabled = isTurnRunning || !isLinked
  stopButton.hidden = !isTurnRunning
  // Reset clears main's history too — blocked mid-turn so a reset can't race
  // the terminal event of a turn that is still writing into the transcript.
  resetButton.disabled = isTurnRunning

  emptyElement.hidden = hasMessages
  // "Thinking" only covers the gap between the send and the first delta; once
  // text is landing, the streaming row is the progress indicator.
  thinkingElement.hidden = !(isTurnRunning && streamingMessageId === null)
}

/**
 * Point the empty state at the right guidance for the current link state.
 *
 * @returns {void}
 */
function applyEmptyState() {
  if (!emptyElement) return
  if (isLinked) {
    emptyElement.dataset.aiKind = 'ready'
    emptyTitleElement.textContent = t('ai.empty.ready')
    emptyBodyElement.textContent = ''
  } else {
    emptyElement.dataset.aiKind = 'not-linked'
    emptyTitleElement.textContent = t('ai.empty.notLinked.title')
    emptyBodyElement.textContent = t('ai.empty.notLinked.body')
  }
}

/**
 * Record whether a turn is in flight and refresh everything that depends on it.
 *
 * @param {boolean} running - true while a turn is streaming
 * @returns {void}
 */
function setTurnRunning(running) {
  isTurnRunning = !!running
  applyHostState()
  applyControlState()
}

/**
 * Record whether the configured provider has a usable credential.
 *
 * @param {boolean} linked - true when ai:status reports hasKey
 * @returns {void}
 */
function setLinked(linked) {
  isLinked = !!linked
  applyHostState()
  applyEmptyState()
  applyControlState()
}

// ─── Bridge ────────────────────────────────────────────────────────────────

/**
 * @returns {object|null} the preload AI bridge, or null when it is missing
 *          (an older preload, or the panel loaded outside the app shell)
 */
function getAiBridge() {
  return window.grapestrap?.ai || null
}

/**
 * Ask main whether the configured provider is usable.
 *
 * Called on every mount and again after any auth failure, so a key added in
 * Preferences mid-session unlatches the not-linked empty state.
 *
 * @returns {Promise<void>} always resolves — a failed probe degrades to linked
 */
async function refreshLinkedState() {
  const bridge = getAiBridge()
  if (!bridge) {
    setLinked(false)
    return
  }
  try {
    const status = await bridge.status()
    setLinked(status?.ok !== false && status?.hasKey !== false)
  } catch (error) {
    // Fail open. Locking the composer because a status probe threw would hide
    // the real error behind an empty state the user cannot get past.
    log.warn(`ai panel: status probe failed — ${error?.message || error}`)
    setLinked(true)
  }
}

/**
 * Decide whether an ai:delta / ai:turn / ai:tool-call payload belongs to the
 * turn this panel is showing.
 *
 * The first event of a turn can beat ai.send()'s own reply back to the
 * renderer — main emits 'running' from inside the invoke handler, before it
 * returns — so while a send of ours is in flight and nothing is adopted yet,
 * the first turn id seen is ours by construction (main is single-flight).
 *
 * @param {string} turnId - turn id from the payload
 * @returns {boolean} true when the event should be rendered
 */
function adoptTurn(turnId) {
  if (typeof turnId !== 'string' || !turnId) return false
  if (activeTurnId === null) {
    if (!isTurnRunning) return false
    activeTurnId = turnId
    return true
  }
  return turnId === activeTurnId
}

/**
 * Stream a text chunk into the assistant's reply, opening the reply row on
 * the first chunk that carries text.
 *
 * @param {{turnId: string, text: string}} payload - ai:delta payload
 * @returns {void}
 */
function handleDelta(payload) {
  if (!adoptTurn(payload?.turnId)) return
  const chunk = typeof payload?.text === 'string' ? payload.text : ''
  if (!chunk) return
  if (streamingMessageId === null) {
    streamingMessageId = chatState.startAssistantMessage()?.id ?? null
    if (streamingMessageId === null) return
  }
  chatState.appendDelta(streamingMessageId, chunk)
}

/**
 * Apply a turn lifecycle event. Every terminal state closes the streaming row
 * and releases the panel back to idle — including the ones that carry no text.
 *
 * @param {{turnId: string, state: string, stopReason?: string, error?: object}} payload
 * @returns {void}
 */
function handleTurn(payload) {
  const state = payload?.state
  if (!adoptTurn(payload?.turnId)) return
  if (state === 'running') return
  if (!TERMINAL_TURN_STATES.has(state)) {
    // Checked BEFORE anything is finalized: a state we don't recognize is not
    // proof the turn ended, and closing the streaming row on it would cut a
    // live reply short.
    log.warn(`ai panel: ignoring unknown turn state "${state}"`)
    return
  }

  finishStreamingMessage()

  if (state === 'done') {
    // A refusal is a COMPLETED turn that streams no text, not an error. With
    // nothing to show, say so explicitly rather than leave the send looking
    // like it silently did nothing.
    if (payload?.stopReason === 'refusal') {
      chatState.addNotice(t('ai.refusal'), 'refusal')
    }
  } else if (state === 'cancelled') {
    chatState.addNotice(t('ai.notice.cancelled'), 'cancelled')
  } else {
    chatState.addError(errorRowText(payload?.error), payload?.error?.type || 'api')
    // The credential just failed or was revoked — re-read status so the panel
    // switches to its not-linked guidance instead of inviting another doomed
    // send.
    if (payload?.error?.type === 'auth') refreshLinkedState()
  }

  releaseTurn()
}

/**
 * Show that the model asked for a tool.
 *
 * DISPLAY ONLY — answering the call (grapestrap.ai.toolResult) belongs to the
 * Phase C renderer-side tool executor. This row exists so the request is
 * visible in the transcript instead of looking like a stall.
 *
 * @param {{turnId: string, name: string}} payload - ai:tool-call payload
 * @returns {void}
 */
function handleToolCall(payload) {
  if (!adoptTurn(payload?.turnId)) return
  const name = typeof payload?.name === 'string' ? payload.name : ''
  if (!name) return
  chatState.addNotice(name, 'tool')
}

/**
 * Close the streaming assistant row, dropping it when the turn ended before
 * any text arrived (an empty bubble reads as a rendering bug).
 *
 * @returns {void}
 */
function finishStreamingMessage() {
  if (streamingMessageId === null) return
  const message = chatState.finishMessage(streamingMessageId)
  if (message && !message.text) chatState.removeMessage(streamingMessageId)
  streamingMessageId = null
}

/**
 * Hand the panel back to idle: no adopted turn, nothing streaming, controls
 * live again. Single exit point so every path out of a turn leaves the same
 * state behind.
 *
 * @returns {void}
 */
function releaseTurn() {
  // Idempotent: a no-op when handleTurn already finalized the reply, and the
  // safety net on the paths (a failed invoke, a cancel main had nothing to
  // abort) where no terminal event is ever coming to do it.
  finishStreamingMessage()
  activeTurnId = null
  setTurnRunning(false)
}

// ─── Composer actions ──────────────────────────────────────────────────────

/**
 * Send whatever is in the composer.
 *
 * Never rejects: every failure lands in the transcript as an error row, since
 * a rejected promise from a click handler would be invisible to the user.
 *
 * @returns {Promise<object|null>} the ai.send result, or null when nothing
 *          was sent / the invoke itself failed
 */
async function submitComposer() {
  const bridge = getAiBridge()
  const text = (inputElement?.value || '').trim()
  // isLinked is deliberately NOT checked here: the controls already enforce
  // it, and the test surface must still be able to drive a send while the
  // status probe is in flight.
  if (!text || isTurnRunning || !bridge) return null

  inputElement.value = ''
  chatState.addUserMessage(text)
  activeTurnId = null
  streamingMessageId = null
  setTurnRunning(true)

  let result = null
  try {
    result = await bridge.send(text)
  } catch (error) {
    // The invoke itself failed, so no terminal ai:turn is coming for this
    // send — the panel has to close the turn out on its own or it stays
    // stuck in 'running' forever.
    log.warn(`ai panel: ai.send invoke failed — ${error?.message || error}`)
    chatState.addError(error?.message || t('ai.error.api'), 'api')
    releaseTurn()
    return null
  }

  if (!result?.ok) {
    // Rejected before a turn existed (busy, empty, no target). The user row
    // stays in the transcript on purpose — it is what they typed — and the
    // error row underneath says why it went nowhere.
    chatState.addError(errorRowText(result?.error), result?.error?.type || 'api')
    releaseTurn()
    return result
  }

  // Only arm the id if this send's turn is still the live one. A very short
  // turn can reach its terminal ai:turn before the invoke reply lands here;
  // re-arming then would leave a finished turn id adopted and make the panel
  // ignore the NEXT turn's events.
  if (isTurnRunning && activeTurnId === null) activeTurnId = result.turnId
  return result
}

/**
 * Ask main to abort the running turn.
 *
 * @returns {Promise<void>} always resolves
 */
async function stopTurn() {
  const bridge = getAiBridge()
  if (!bridge || !isTurnRunning) return

  let result = null
  try {
    result = await bridge.cancel()
  } catch (error) {
    log.warn(`ai panel: ai.cancel invoke failed — ${error?.message || error}`)
    // No terminal event is coming for a cancel that never reached main.
    releaseTurn()
    return
  }

  // cancelTurn() answers { ok: true, turnId: null } when main had nothing to
  // abort — and in that case it emits NO ai:turn event at all. Believing the
  // event would arrive leaves the panel stuck in 'running' with Send and
  // Reset disabled for the rest of the session, so desync is settled here.
  if (!result?.turnId) {
    releaseTurn()
    return
  }
  // Main is aborting a real turn: let its terminal 'cancelled' event do the
  // state flip, so the partial reply is finalized exactly once.
}

/**
 * Clear the conversation on both sides — main's history and this transcript.
 *
 * @returns {Promise<void>} always resolves
 */
async function resetConversation() {
  const bridge = getAiBridge()
  if (isTurnRunning) return
  try {
    await bridge?.reset()
  } catch (error) {
    // Clear the local transcript regardless: leaving the old conversation on
    // screen after the user asked for a new chat is the worse failure.
    log.warn(`ai panel: ai.reset invoke failed — ${error?.message || error}`)
  }
  activeTurnId = null
  streamingMessageId = null
  chatState.clear()
}

// ─── Wiring (once) ─────────────────────────────────────────────────────────

/**
 * Wire DOM events, the chat-state feed, the IPC subscriptions, and the test
 * surface. Wire-once (house pattern: wireCanvasEvents / wireCssPanelEvents) —
 * GL re-invokes the factory, and a second ai:delta subscription would render
 * every chunk twice.
 *
 * @returns {void}
 */
function wireAiPanel() {
  if (eventsWired) return
  eventsWired = true

  persistentRoot.addEventListener('click', event => {
    const button = event.target.closest('[data-ai-action]')
    if (!button || button.disabled) return
    const action = button.dataset.aiAction
    if (action === 'send') submitComposer()
    else if (action === 'stop') stopTurn()
    else if (action === 'reset') resetConversation()
  })

  inputElement.addEventListener('keydown', event => {
    // Enter sends, Shift+Enter breaks the line. isComposing guards IME
    // candidate selection, which also arrives as a bare Enter.
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    event.preventDefault()
    submitComposer()
  })

  chatState.subscribe(handleTranscriptChange)

  const bridge = getAiBridge()
  if (bridge) {
    bridge.onDelta(handleDelta)
    bridge.onTurn(handleTurn)
    bridge.onToolCall(handleToolCall)
  } else {
    log.warn('ai panel: preload AI bridge missing — panel renders read-only')
  }

  installTestSurface()
}

/**
 * Publish the e2e/devtools handle.
 *
 * Attached HERE rather than at module scope because renderer/main.js assigns
 * window.__gstrap wholesale at module-eval time — which happens BEFORE boot()
 * reaches initGoldenLayout() and this factory first runs. A module-scope
 * assignment would be overwritten; merging from inside the factory is the
 * same idiom panels/asset-manager uses for its window cache.
 *
 * @returns {void}
 */
function installTestSurface() {
  window.__gstrap = window.__gstrap || {}
  window.__gstrap.ai = {
    getTranscript: () => chatState.getMessages().map(({ role, text, kind }) => ({ role, text, kind })),
    isRunning: () => isTurnRunning,
    sendText: text => {
      inputElement.value = typeof text === 'string' ? text : ''
      return submitComposer()
    }
  }
}
