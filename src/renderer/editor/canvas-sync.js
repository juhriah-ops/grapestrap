/**
 * GrapeStrap — Canvas / Code sync (LOCKED POLICY)
 *
 * Code-authoritative-when-active, per the Dreamweaver model. v3 of the build plan
 * proposed bidirectional 300ms-debounced sync — that path has eaten months of
 * every editor that tried it. We commit to:
 *
 *   - Design → Code:  live-debounced (300ms). Continuous flow.
 *   - Code → Design:  ON SWITCH ONLY. Edits in Code do NOT propagate live.
 *                     When the user switches to Design view (or focuses the
 *                     Design pane in Split mode), the component tree is rebuilt
 *                     from the current HTML.
 *
 * Tradeoff acknowledged: Code→Design switch loses canvas selection. Documented in
 * the welcome dialog and FAQ. v0.0.2 may add a "remember last selection" heuristic
 * by selector, but it's deliberately not in v0.0.1.
 *
 * In Split view, the side most recently focused is authoritative. The other side
 * updates on focus loss.
 *
 * UPDATED: 2026-08-11 — Workstream A chunk A5 (code-view position fixes):
 * rebuildCanvasFromCode() now warns via toast when extractPageFromFullHtml
 * reports strayContentMoved, takes an optional tabOverride (see its own
 * doc comment — needed by panels/canvas/index.js#swapToTab, which must
 * rebuild the OUTGOING tab's canvas from Monaco after pageState has already
 * flipped to the INCOMING tab), and the split-view Monaco blur now triggers
 * a rebuild too (bindSync's onDidBlurEditorWidget hook below).
 *
 * UPDATED: 2026-08-17 — split-view undo repair. Two changes here, both aimed
 * at the same user report ("undo needs improving, most issues are on the
 * splitview screen"):
 *
 *  1. Design→Code writes no longer use `codeEditor.setValue()`. Monaco's
 *     `setValue` runs `_commandManager.clear()` — it DESTROYS the model's undo
 *     stack, and resets caret and scroll. In Split view this sync fires on
 *     every canvas edit, so every canvas edit was wiping whatever the user had
 *     typed in the code pane out of undo history and throwing the caret back
 *     to line 1 (measured: caret line 31 → 1). Writes now go through a
 *     prefix/suffix-trimmed `pushEditOperations` (shared/text-diff.js).
 *
 *     DELIBERATE CHOICE — do sync-generated states belong on Monaco's undo
 *     stack? They are ON it, but the user can never reach them. They must be
 *     tracked (an untracked `model.applyEdits` writes behind the undo stack's
 *     back and leaves every older entry's offsets stale, so a later Ctrl+Z
 *     splices garbage), and they must be unreachable (undoing a generated
 *     rewrite would revert the code pane while the canvas keeps the change —
 *     an unrecoverable desync). editor/edit-origin.js holds the FLOOR that
 *     enforces the second half: a code-pane undo only unwinds edits the user
 *     made on top of the last generated rewrite. Net effect for the user: a
 *     code-pane Ctrl+Z reverts THEIR typing, is not erased by canvas activity,
 *     and never walks back through a wall of generated rewrites.
 *
 *  2. The split-view blur rebuild is now conditional. It used to fire on EVERY
 *     blur, and rebuildCanvasFromCode ends in `um.clear()` — so merely clicking
 *     from the code pane onto the canvas, typing nothing, destroyed the whole
 *     canvas undo stack (measured: 2 entries → 0, and Ctrl+Z afterwards did
 *     nothing at all). The rebuild now runs only when the code buffer actually
 *     differs from what the last sync put there. The code→design VIEW-SWITCH
 *     path is deliberately left alone — its clear-on-rebuild is a pinned
 *     product decision (tests/e2e/templates.spec.js "undo contract").
 */

import { eventBus } from '../state/event-bus.js'
import { getEditor } from './grapesjs-init.js'
import { formatHtml } from './format-html.js'
import { projectState } from '../state/project-state.js'
import { pageState } from '../state/page-state.js'
import { composeFullPageHtml, extractPageFromFullHtml, isFullHtmlDocument, stripBodyWrapper } from '../../shared/page-html.js'
import { computeMinimalTextEdit } from '../../shared/text-diff.js'
import { setCodeFloor, stampUserEdit } from './edit-origin.js'
import { t } from '../i18n.js'
import { log } from '../log.js'

let codeEditor = null
let cssEditor = null
let activeSide = 'design'    // 'design' | 'code'
let canvasUpdateTimer = null
let suppressCanvasToCode = false
let suppressCodeToCanvas = false

// The exact HTML the last generated write put into the code pane (or that the
// last rebuild consumed out of it). `null` means "unknown" — always rebuild
// rather than risk skipping a real edit. Compared against the live buffer to
// tell a genuine code edit from an untouched pane; see the blur hook.
let lastSyncedCodeText = null

// Set by panels/canvas/index.js immediately before it loads a different tab's
// content into the shared canvas. The next generated write then goes through
// setValue rather than a minimal edit, deliberately clearing Monaco's history:
// one Monaco pair is shared by every tab, so carrying the outgoing tab's undo
// entries into the incoming tab would let Ctrl+Z paste the previous page's
// markup into this one. (Before this module stopped calling setValue on every
// sync, that clear happened by accident on every single sync.)
let codeHistoryResetPending = false

const DEBOUNCE_MS = 300

export function bindSync({ htmlMonaco, cssMonaco }) {
  codeEditor = htmlMonaco
  cssEditor = cssMonaco

  // Design → Code: debounce GrapesJS updates and push to Monaco
  const editor = getEditor()
  if (editor) {
    editor.on('update', queueCanvasToCode)
    editor.on('component:add', queueCanvasToCode)
    editor.on('component:remove', queueCanvasToCode)
    editor.on('component:update', queueCanvasToCode)
  }

  // Track which pane has focus
  htmlMonaco?.onDidFocusEditorWidget(() => { activeSide = 'code'  })
  cssMonaco?.onDidFocusEditorWidget(()  => { activeSide = 'code'  })
  // Split view: the side most recently focused is authoritative (module
  // header policy). Losing focus on the HTML Monaco while in Split mode is
  // the moment the design pane needs to catch up to whatever was just typed
  // — gated strictly to 'split' because Code-only mode already has its own
  // rebuild trigger (view-mode switch back to Design; onViewModeChange
  // below), and rebuilding on every blur in Code-only mode would be wasted
  // work with no visible design pane to show it in.
  htmlMonaco?.onDidBlurEditorWidget(() => {
    if (pageState.active()?.viewMode !== 'split') return
    // Only rebuild if the user actually changed something. rebuildCanvasFromCode
    // ends with UndoManager.clear(), so an unconditional rebuild meant that
    // clicking from the code pane back to the canvas — reading, not editing —
    // threw away every canvas undo step the user had. Measured 2026-08-17:
    // stack length 2 → 0 on a focus/blur round trip with nothing typed.
    if (lastSyncedCodeText !== null && htmlMonaco.getValue() === lastSyncedCodeText) return
    rebuildCanvasFromCode()
  })

  // Code-pane user edits stamp this tab's undo routing origin. Generated
  // writes are excluded via suppressCodeToCanvas (set only while THIS module
  // is writing), and undo/redo replays via the event's own flags — neither is
  // a user edit, and treating them as one would misroute the next Ctrl+Z and
  // clear the redo trail mid-sequence.
  htmlMonaco?.onDidChangeModelContent(event => {
    if (suppressCodeToCanvas) return
    if (event?.isUndoing || event?.isRedoing) return
    const tab = pageState.active()
    if (tab) stampUserEdit(tab.pageName, 'code')
  })
  // Canvas focus is detected via GrapesJS frame focus events
  if (editor) {
    editor.on('canvas:frame:load', () => {
      const frame = editor.Canvas.getFrameEl()
      frame?.contentWindow?.addEventListener('focus', () => { activeSide = 'design' })
    })
  }
}

function queueCanvasToCode() {
  // Only suppress when we're explicitly in the middle of a code-to-canvas
  // rebuild — otherwise, every canvas change should propagate to Monaco
  // per the locked sync policy ("Design → Code: live-debounced. Continuous
  // flow."). Earlier versions also gated on activeSide === 'code' but that
  // was wrong: activeSide latches to 'code' the moment Monaco gains focus
  // and only resets when the canvas iframe contentWindow regains focus,
  // which doesn't happen on view-mode toggle. The result was that any
  // user who ever clicked into the Code view permanently broke
  // canvas-to-code sync until they restarted — reproduced 2026-05-03 by
  // user on nola1 ("code view is no longer working" on a new project).
  // Nothing actually depends on activeSide blocking sync: typing in
  // Monaco doesn't fire GrapesJS component events, so the gate never
  // saved a real edit; rebuildCanvasFromCode's own suppressCanvasToCode
  // already covers the only way Code-side typing could appear in canvas
  // events.
  if (suppressCanvasToCode) return
  clearTimeout(canvasUpdateTimer)
  canvasUpdateTimer = setTimeout(syncCanvasToCode, DEBOUNCE_MS)
}

function syncCanvasToCode() {
  const editor = getEditor()
  if (!editor || !codeEditor) return
  // For page tabs we compose the FULL HTML document (head + body + framework
  // links) so the Code view is a faithful mirror of what's saved on disk —
  // user sees the BS / FA / icons references directly. Library-item tabs
  // stay body-only since they're fragments by design (composed into pages
  // via wrapper div, never standalone). Pretty-print on the way out so the
  // Code view stays readable.
  const tab = pageState.active()
  // stripBodyWrapper: getHtml() wraps in <body>; fragments are body-inner.
  const body = formatHtml(stripBodyWrapper(editor.getHtml()))
  let html = body
  // Only true PAGE tabs compose the full document; library AND template tabs
  // are body-only fragments by design (project-manager.js save comment).
  if ((tab?.kind ?? 'page') === 'page' && projectState.current) {
    const page = projectState.current.pages?.find(p => p.name === tab?.pageName)
    if (page) html = composeFullPageHtml(body, page, projectState.current.manifest || {})
  }
  const css = editor.getCss()
  suppressCodeToCanvas = true
  // A pending reset means the shared code pane is about to show a DIFFERENT
  // tab's document — take the destructive path on purpose, once.
  const hardReset = codeHistoryResetPending
  codeHistoryResetPending = false
  writeIntoCodePane(codeEditor, html, hardReset)
  if (cssEditor) writeIntoCodePane(cssEditor, css, hardReset)
  suppressCodeToCanvas = false

  lastSyncedCodeText = html
  // Re-floor AFTER the write: from here on, "the model differs from this
  // version" is exactly "the user has typed something the sync didn't".
  const tab2 = pageState.active()
  if (tab2) setCodeFloor(tab2.pageName, codeEditor.getModel?.()?.getAlternativeVersionId?.() ?? null)

  eventBus.emit('sync:canvas-to-code', { html, css })
}

/**
 * Push generated content into a Monaco editor without destroying the user's
 * undo history, caret or scroll position.
 *
 * @param {object} editorInstance - A Monaco editor (html or css pane).
 * @param {string} nextText - The content the canvas says the pane should show.
 * @param {boolean} hardReset - True only on a tab swap: use setValue so the
 *        outgoing tab's undo entries are dropped rather than carried over.
 * @returns {void}
 *
 * Throws nothing: a model can be disposed between the debounce firing and this
 * running (tab closed, project closed), in which case there is nothing to
 * write and silently skipping is the correct behaviour — the next sync for the
 * live model will carry the content.
 */
function writeIntoCodePane(editorInstance, nextText, hardReset) {
  const model = editorInstance?.getModel?.()
  if (!model) return
  if (hardReset) {
    if (model.getValue() !== nextText) model.setValue(nextText)
    return
  }
  const edit = computeMinimalTextEdit(model.getValue(), nextText)
  // null = already identical. Skipping matters beyond efficiency: an empty
  // edit still pushes an undo stop, which would pile up no-op steps on the
  // stack every time the debounce fired after a non-content change.
  if (!edit) return
  const range = {
    startLineNumber: model.getPositionAt(edit.startOffset).lineNumber,
    startColumn: model.getPositionAt(edit.startOffset).column,
    endLineNumber: model.getPositionAt(edit.endOffset).lineNumber,
    endColumn: model.getPositionAt(edit.endOffset).column
  }
  // pushEditOperations (not applyEdits): the edit MUST be recorded on the undo
  // stack. applyEdits writes behind the stack's back, leaving every older
  // entry's offsets pointing into text that moved — a later Ctrl+Z would then
  // splice at the wrong place and corrupt the buffer. Recorded-but-unreachable
  // is the contract; edit-origin.js's floor keeps the user off these entries.
  model.pushEditOperations([], [{ range, text: edit.text }], () => null)
}

/**
 * Called when the user switches view mode TO design (from code or split→design),
 * or when the design pane regains focus in split view. Rebuilds the GrapesJS
 * component tree from the current Monaco HTML/CSS.
 *
 * NOTE: this loses GrapesJS selection state. Acceptable for v0.0.1.
 *
 * @param {object} [tabOverride] - The pageState tab this rebuild is FOR.
 *        Defaults to pageState.active() — correct for every existing call
 *        site (view-mode switch, split blur, save-flush), where the active
 *        tab genuinely is the one whose Monaco buffer is being rebuilt.
 *        panels/canvas/index.js#swapToTab is the one exception: it must
 *        rebuild the OUTGOING tab's canvas, but by the time its 'tab:focused'
 *        handler runs, pageState.active() already points at the INCOMING tab
 *        (pageState.open/focus flip activeIndex before emitting — the same
 *        seam panels/templates/lock.js's component:add comment documents).
 *        Without the override, the outgoing tab's parsed <head> would get
 *        merged onto the wrong (incoming) page.
 */
export function rebuildCanvasFromCode(tabOverride) {
  if (suppressCodeToCanvas) return
  const editor = getEditor()
  if (!editor || !codeEditor) return

  const raw = codeEditor.getValue()
  const css = cssEditor ? cssEditor.getValue() : ''

  // The canvas is about to BE this text, so it is no longer an unsynced code
  // edit — record it as the baseline the split-view blur hook compares against
  // and re-floor the code pane's undo routing on it.
  lastSyncedCodeText = raw
  const flooredTab = tabOverride ?? pageState.active()
  if (flooredTab) {
    setCodeFloor(flooredTab.pageName, codeEditor.getModel?.()?.getAlternativeVersionId?.() ?? null)
  }

  // For pages, the Code view holds the full HTML doc (alpha.7+). Extract the
  // body for setComponents and the head fields back into the manifest so
  // Page Properties + the next compose stay in sync with what the user
  // typed. Library tabs stay body-only.
  let bodyForCanvas = raw
  const tab = tabOverride ?? pageState.active()
  if ((tab?.kind ?? 'page') === 'page' && isFullHtmlDocument(raw)) {
    const { body, head, strayContentMoved } = extractPageFromFullHtml(raw)
    bodyForCanvas = body
    if (strayContentMoved) {
      // The user's raw Code-view text had markup between </head> and <body>
      // — extractPageFromFullHtml already relocated it to the top of body
      // (shared/page-html.js); surface that so it doesn't look like it just
      // silently vanished.
      eventBus.emit('toast', { type: 'warning', message: t('codeview.toast.stray-content') })
    }
    if (projectState.current) {
      const page = projectState.current.pages?.find(p => p.name === tab?.pageName)
      if (page) {
        page.head = { ...(page.head || {}), ...head }
        projectState.markPageDirty?.(page.name)
        eventBus.emit('page:head-changed', { page })
      }
    }
  }

  // Fence the rebuild out of undo history and clear it — the same treatment
  // as the 2026-07-12 swapToTab fix (canvas/index.js). Contract: canvas undo
  // history is per VIEW-session; undo must never restore a tree the
  // authoritative Monaco buffer no longer describes. The sync:code-to-canvas
  // emit stays INSIDE the stopped window so template-lock re-application
  // (panels/templates/lock.js) is never recorded either.
  // Spec: tests/e2e/templates.spec.js "undo contract".
  const um = editor.UndoManager
  suppressCanvasToCode = true
  um?.stop()
  try {
    editor.setComponents(bodyForCanvas)
    editor.setStyle(css)
    eventBus.emit('sync:code-to-canvas', { html: bodyForCanvas, css })
    log.debug('rebuilt canvas from code')
  } finally {
    um?.start()
    um?.clear()
    // Re-enable after one tick so GrapesJS update events from setComponents
    // don't immediately trigger a back-sync.
    setTimeout(() => { suppressCanvasToCode = false }, 0)
  }
}

/**
 * Synchronously clear the canvas→code suppression flag rebuildCanvasFromCode
 * sets while it runs, instead of waiting for its own one-tick timeout.
 *
 * Needed by panels/canvas/index.js#swapToTab: it calls
 * rebuildCanvasFromCode(outgoingTab) for an OUTGOING code/split tab, then
 * SYNCHRONOUSLY loads the INCOMING tab's html into the very same canvas
 * (loadHtmlIntoCanvas). Left on the normal one-tick timer, that load's
 * component events would be silently swallowed by the still-pending
 * suppression — Monaco would stay stale for the incoming tab until its next
 * real edit. Exported narrowly for that one caller; every other
 * rebuildCanvasFromCode() call site (view-mode switch, split blur, save
 * flush) has nothing synchronous after it that needs the flag released early.
 */
export function resumeCanvasToCodeSync() {
  suppressCanvasToCode = false
}

/**
 * Is this module currently pushing a code→canvas rebuild through GrapesJS?
 *
 * panels/canvas/index.js needs it to tell a rebuild's component:add storm from
 * a genuine user canvas edit when stamping undo-routing origin. Its existing
 * `loadingTabName` fence covers programmatic tab LOADS but not rebuilds, which
 * come from this module.
 *
 * @returns {boolean}
 */
export function isRebuildingFromCode() {
  return suppressCanvasToCode
}

/**
 * Tell the next generated write to clear the code pane's undo history instead
 * of preserving it.
 *
 * Called by panels/canvas/index.js#swapToTab. One Monaco pair serves every tab
 * (page-state.js documents a per-tab `monacoState`, but nothing has ever
 * implemented it), so without this the incoming tab inherits the outgoing
 * tab's undo entries and Ctrl+Z would splice the previous page's markup into
 * this one. Pinned by tests/e2e/undo-redo.spec.js "undo does not leak content
 * across page tabs" and its split-view sibling.
 *
 * @returns {void}
 */
export function requestCodeHistoryReset() {
  codeHistoryResetPending = true
  // Force the blur hook to rebuild rather than compare against the outgoing
  // tab's text, until the next sync establishes a baseline for the new tab.
  lastSyncedCodeText = null
}

/**
 * Called by view-modes.js when switching the active view mode for a tab.
 * The actual show/hide of canvas vs Monaco DOM is the caller's job; this just
 * triggers the rebuild on the right transition.
 */
export function onViewModeChange(prev, next) {
  if (next === 'design' && prev === 'code') {
    rebuildCanvasFromCode()
  }
  // Split mode: focus tracking handles the rest
}

export function setActiveSide(side) {
  activeSide = side
}

export function getActiveSide() {
  return activeSide
}

/**
 * Non-destructive read of the Code-view Monaco buffer (full HTML document
 * for page tabs, body fragment for library tabs — same shape the save flush
 * sees). Used by the crash-recovery snapshot loop, which must capture
 * Code-view edits without triggering a canvas rebuild. Returns null before
 * bindSync() has run.
 */
export function getCodeEditorValue() {
  return codeEditor ? codeEditor.getValue() : null
}
