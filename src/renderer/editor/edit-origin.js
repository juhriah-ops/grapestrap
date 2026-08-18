/**
 * GrapeStrap — Per-tab edit origin + undo routing state
 *
 * PATH: src/renderer/editor/edit-origin.js
 * ROLE: Answers "which undo stack does Ctrl+Z belong to right now?" for Split
 *       view, where the canvas and the code pane are both on screen and focus
 *       is the WRONG signal.
 * DEPENDS: nothing (plain module state; callers pass the tab key)
 * CREATED: 2026-08-17
 *
 * Why this exists (diagnosed 2026-08-17, split-view undo characterization):
 *
 *   Routing used to be focus-only (shortcuts/menu-router.js). In Split view a
 *   user drags a block onto the canvas, clicks into the code pane to read the
 *   markup it produced, presses Ctrl+Z — and NOTHING happens, because focus
 *   says "code" while the only real history lives on the canvas stack
 *   (scenario S10). The mirror case is just as bad: the code pane is focused,
 *   its own stack has been emptied, and undo silently dead-ends instead of
 *   falling through to the stack that does have work (S2).
 *
 * The model:
 *
 *   - Each tab records the origin of the most recent USER edit ('design' or
 *     'code'). Sync-generated writes and undo/redo replays never stamp — only
 *     things the human did.
 *   - The code pane additionally carries a FLOOR: the Monaco model's
 *     alternativeVersionId as of the last sync-generated rewrite. Monaco's
 *     alternativeVersionId returns to a previous value when you undo back to
 *     that state, so `current !== floor` is an exact test for "there are user
 *     code edits stacked on top of the last generated rewrite".
 *
 *     The floor is what keeps a code-pane Ctrl+Z from ever unwinding INTO the
 *     generated rewrites the design→code sync pushes. Those entries have to
 *     exist on Monaco's stack (an untracked `model.applyEdits` would leave
 *     every older entry's offsets stale and corrupt a later undo), but the
 *     user must never land on one: undoing a generated rewrite would revert
 *     the code pane's text while the canvas kept the change — a desync with
 *     no way back. Above the floor = the user's own edits. At the floor = the
 *     code pane has nothing of its own left, so routing moves to the canvas.
 *
 *   - `undoTrail` records where each undo was actually routed, so redo mirrors
 *     it exactly (LIFO). Without it, redo re-runs the routing decision against
 *     state the undo just changed and can bounce to the other pane mid-sequence.
 *
 * Everything is keyed by tab (pageName). A tab swap resets its record —
 * canvas/index.js shares ONE Monaco pair and ONE GrapesJS editor across all
 * tabs, so stale routing state from the outgoing tab would aim Ctrl+Z at
 * history that no longer belongs to what is on screen.
 */

/** @typedef {'design'|'code'} EditOrigin */

const records = new Map()

// Set while an undo/redo replay is running. GrapesJS component events and
// Monaco content events both fire during a replay and would otherwise be
// mistaken for fresh user edits — which would clear the redo trail and strand
// the user mid-sequence.
let replayDepth = 0

function recordFor(tabKey) {
  if (!tabKey) return null
  let record = records.get(tabKey)
  if (!record) {
    record = { origin: null, at: 0, codeFloorVersionId: null, undoTrail: [] }
    records.set(tabKey, record)
  }
  return record
}

/**
 * Stamp a genuine user edit against a tab. Called from the two places that
 * already know an edit is real rather than programmatic: the canvas panel's
 * `canvas:content-changed` handler (which owns the loading/file-tab fences)
 * and canvas-sync's Monaco content listener.
 *
 * @param {string} tabKey - Tab identity (pageState tab.pageName).
 * @param {EditOrigin} origin - Which pane the user edited.
 * @returns {void}
 */
export function stampUserEdit(tabKey, origin) {
  if (isReplaying()) return
  const record = recordFor(tabKey)
  if (!record) return
  record.origin = origin
  record.at = Date.now()
  // A new edit invalidates any pending redo, so the trail that mirrored it
  // is meaningless now. Standard undo-stack semantics; keeping it would let
  // a later redo replay against a branch the user already abandoned.
  record.undoTrail.length = 0
}

/**
 * Record the Monaco alternativeVersionId that represents "code pane holds
 * exactly what the last generated rewrite produced, and nothing of the
 * user's on top". Passing null clears the floor (used when no model exists).
 *
 * @param {string} tabKey
 * @param {number|null} versionId
 * @returns {void}
 */
export function setCodeFloor(tabKey, versionId) {
  const record = recordFor(tabKey)
  if (!record) return
  record.codeFloorVersionId = versionId
}

/**
 * Does the code pane hold user edits stacked above the last generated rewrite?
 *
 * @param {string} tabKey
 * @param {number|null} currentVersionId - model.getAlternativeVersionId()
 * @returns {boolean} false when the model is at (or has no) floor.
 */
export function codeHasUserEdits(tabKey, currentVersionId) {
  const record = records.get(tabKey)
  if (!record || currentVersionId == null) return false
  // No floor recorded yet means nothing has been generated into this buffer,
  // so anything Monaco can undo is the user's own.
  if (record.codeFloorVersionId == null) return true
  return currentVersionId !== record.codeFloorVersionId
}

/**
 * The pane that produced the most recent user edit, or null if this tab has
 * seen none.
 *
 * @param {string} tabKey
 * @returns {EditOrigin|null}
 */
export function lastEditOrigin(tabKey) {
  return records.get(tabKey)?.origin ?? null
}

/**
 * Remember where an undo was routed so the matching redo can mirror it.
 *
 * @param {string} tabKey
 * @param {EditOrigin} target
 * @returns {void}
 */
export function pushUndoTarget(tabKey, target) {
  const record = recordFor(tabKey)
  if (!record) return
  record.undoTrail.push(target)
}

/**
 * Pop the pane the most recent unmatched undo was routed to.
 *
 * @param {string} tabKey
 * @returns {EditOrigin|null} null when no undo is waiting to be redone.
 */
export function popUndoTarget(tabKey) {
  const record = records.get(tabKey)
  if (!record || record.undoTrail.length === 0) return null
  return record.undoTrail.pop()
}

/**
 * Run an undo/redo replay with user-edit stamping suppressed.
 *
 * Re-entrant (depth-counted) because a routed undo can cascade: a canvas undo
 * mutates components, which fires the design→code sync, which writes Monaco.
 * The fence is released on a macrotask rather than synchronously — GrapesJS
 * emits some of its component events asynchronously, and the design→code sync
 * is debounced, so a synchronous release would let the tail of the replay
 * stamp itself as a user edit.
 *
 * @param {Function} run - The replay to perform.
 * @returns {*} Whatever `run` returns.
 */
export function withReplayFence(run) {
  replayDepth++
  try {
    return run()
  } finally {
    setTimeout(() => {
      replayDepth = Math.max(0, replayDepth - 1)
    }, 0)
  }
}

/**
 * Is an undo/redo replay in flight? Read by the stamping call sites.
 *
 * @returns {boolean}
 */
export function isReplaying() {
  return replayDepth > 0
}

/**
 * Drop a tab's routing state — on tab swap (the shared Monaco pair and shared
 * GrapesJS editor are about to hold different content) and on tab close.
 *
 * @param {string} tabKey
 * @returns {void}
 */
export function resetTabOrigin(tabKey) {
  records.delete(tabKey)
}

/** Drop every tab's routing state (project close). @returns {void} */
export function resetAllOrigins() {
  records.clear()
}
