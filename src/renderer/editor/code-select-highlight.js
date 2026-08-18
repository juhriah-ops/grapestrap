/**
 * GrapeStrap — Design-selection → Code-view highlight
 *
 * In Split view, selecting an element on the canvas highlights that
 * element's ENTIRE block in the html code pane and scrolls it into view —
 * the Dreamweaver split-view contract.
 *
 * Mapping strategy: the code pane is the canvas serialization run through
 * formatHtml(), which restructures whitespace BETWEEN tags but emits every
 * opening tag byte-for-byte (`node.raw`). So the component's opening tag —
 * the first `<…>` of comp.toHTML() — is a reliable text anchor:
 *
 *   1. Count how many components BEFORE this one (pre-order over the
 *      GrapesJS wrapper = document order) serialize to the same opening
 *      tag; the target is the (n+1)-th occurrence of that tag text in the
 *      code model. Repeated identical sections resolve to the right copy.
 *   2. From the anchor, scan forward balancing `<tag …>` against `</tag>`
 *      to find the block's end (void/self-closed tags end at the anchor).
 *
 * Highlight is a Monaco decoration (className gstrap-code-sel-highlight,
 * styles/panels.css) — never a Monaco selection, so focus stays on the
 * canvas and the user's caret is left alone. Cleared on deselect, tab
 * switch, leaving Split, and project close; recomputed after every
 * canvas→code sync so edits don't leave the band on stale text.
 *
 * UPDATED: 2026-08-18 — WP-B2 (F3b Reveal in Code View). The range math
 * behind the decoration is now an exported pure function,
 * componentCodeRange(comp, model, gjs) — highlight() just calls it, no
 * behavior change. New export revealComponentInCode(component) drives the
 * DOM-tab/canvas context-menu action of the same name
 * (shortcuts/component-actions.js): it flips a design-view tab to Split if
 * needed, then sets a REAL Monaco selection + reveals + focuses. That is a
 * deliberate exception to the "decoration, never selection" rule above — that
 * rule is about this module's own PASSIVE canvas-selection follow, not about
 * an explicit user navigation, which is allowed to move the code-pane caret.
 * Read-only with respect to both models, so it needs no undo-contract
 * handling.
 *
 * UPDATED: 2026-08-18 — revealComponentInCode() now retries a miss after the
 * next canvas→code sync instead of no-opping. Revealing from a tab that was
 * ALREADY in Split computed the range against whatever the html model held at
 * click time, which is empty right after a tab opens and stale for 300ms
 * after any canvas edit (canvas-sync.js's debounce) — the user got no
 * selection and no explanation.
 */

import { eventBus } from '../state/event-bus.js'
import { pageState } from '../state/page-state.js'
import { getMonacoPair } from '../panels/canvas/index.js'
import { getEditor } from './grapesjs-init.js'

// Race guard for revealComponentInCode(): how long to wait for a design→code
// sync to land — after flipping a design-view tab into Split, or after a first
// attempt found the html model stale — before giving up and computing the
// range against whatever model exists anyway. Comfortably clears
// canvas-sync.js's 300ms debounce. See that function's doc comment.
const REVEAL_SYNC_FALLBACK_MS = 500

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
])

let collection = null
let wired = false

export function wireCodeSelectHighlight() {
  if (wired) return
  wired = true
  eventBus.on('canvas:selected', comp => highlight(comp))
  eventBus.on('canvas:deselected', clear)
  eventBus.on('tab:closed', clear)
  eventBus.on('project:closed', clear)
  eventBus.on('viewmode:changed', ({ mode }) => {
    if (mode !== 'split') clear()
  })
  // Canvas→code sync rewrites the model (tab focus, view-mode switch, live
  // design edits) — remap the current selection onto the fresh text.
  eventBus.on('sync:canvas-to-code', () => {
    const sel = getEditor()?.getSelected?.()
    if (sel) highlight(sel)
    else clear()
  })
}

function clear() {
  collection?.clear()
  collection = null
}

function highlight(comp) {
  const tab = pageState.active()
  if (!comp || !tab || tab.viewMode !== 'split' || tab.kind === 'file') return clear()
  const ed = getMonacoPair()?.htmlEditor
  const gjs = getEditor()
  const model = ed?.getModel()
  if (!ed || !gjs || !model) return

  const range = componentCodeRange(comp, model, gjs)
  if (!range) return clear()

  clear()
  collection = ed.createDecorationsCollection([{
    range,
    options: { className: 'gstrap-code-sel-highlight', isWholeLine: false }
  }])
  ed.revealRangeInCenterIfOutsideViewport(range)
}

/**
 * Compute the Monaco range covering a component's serialized block in the
 * given html model — the mapping strategy documented at the top of this
 * file (opening-tag anchor + nth-occurrence + balanced-tag scan). Pure: reads
 * only its arguments, no module state, no side effects. Shared by highlight()
 * (the passive canvas-selection follow) and revealComponentInCode() (the
 * explicit "Reveal in Code View" navigation).
 *
 * @param {object} comp - GrapesJS component to locate
 * @param {object} model - Monaco text model for the html code pane
 * @param {object} gjs - The GrapesJS editor instance (for gjs.getWrapper())
 * @returns {{startLineNumber:number,startColumn:number,endLineNumber:number,
 *           endColumn:number}|null} null when `comp` has no opening tag, is
 *           no longer in the component tree, or its tag text isn't found in
 *           the model (e.g. the model is stale relative to the canvas).
 */
export function componentCodeRange(comp, model, gjs) {
  if (!comp || !model || !gjs) return null

  const openTag = openingTagOf(comp.toHTML?.() || '')
  if (!openTag) return null

  // Occurrences of this exact opening tag among components that precede the
  // target in document order.
  const nth = precedingTwins(gjs.getWrapper(), comp, openTag)
  if (nth < 0) return null   // component no longer in the tree

  const value = model.getValue()
  let offset = -1
  let from = 0
  for (let i = 0; i <= nth; i++) {
    offset = value.indexOf(openTag, from)
    if (offset < 0) return null
    from = offset + 1
  }
  const end = blockEnd(value, offset, openTag)
  return {
    startLineNumber: model.getPositionAt(offset).lineNumber,
    startColumn: model.getPositionAt(offset).column,
    endLineNumber: model.getPositionAt(end).lineNumber,
    endColumn: model.getPositionAt(end).column
  }
}

/**
 * "Reveal in Code View" — explicit user navigation from a component's
 * context menu (shortcuts/component-actions.js) to its block in the html
 * code pane. Unlike highlight() above, this sets a REAL Monaco selection:
 * it is a deliberate jump, not a passive follow, so moving the code-pane
 * caret is correct here.
 *
 * The design→code sync is live-debounced (300ms, canvas-sync.js), which is
 * what both branches below have to work around:
 *
 *   - A design-view tab has no current code model to aim at until the flip's
 *     own sync lands, so the selection waits for it.
 *   - A tab already showing code is USUALLY current, so it selects straight
 *     away and stays instant — but "usually" isn't "always": an edit inside
 *     the last 300ms, or a code pane that has not been filled yet, leaves the
 *     model stale (or empty), and componentCodeRange() then resolves nothing
 *     or the wrong nth twin. A miss there retries after the next sync rather
 *     than failing silently.
 *
 * In both cases the wait is the one-shot 'sync:canvas-to-code' subscription,
 * with the REVEAL_SYNC_FALLBACK_MS timer as the race guard for "no sync was
 * pending after all" — whichever fires first wins and cancels the other.
 *
 * Read-only with respect to both the GrapesJS and Monaco models: it never
 * writes, so there is no undo-contract concern and no replay fence needed.
 *
 * @param {object} component - GrapesJS component to reveal
 * @returns {void}
 */
export function revealComponentInCode(component) {
  const tab = pageState.active()
  if (!component || !tab || tab.kind === 'file') return

  if (tab.viewMode !== 'design') {
    // One retry only: if the model is still missing the component after the
    // next sync, it is not going to be there, and a retry loop would keep
    // stealing the code pane's caret long after the user moved on.
    if (!selectInCode(component)) afterNextCodeSync(() => selectInCode(component))
    return
  }

  afterNextCodeSync(() => selectInCode(component))
  pageState.setViewMode(tab.pageName, 'split')
}

/**
 * Run `action` once the next canvas→code sync has written the html model, or
 * after REVEAL_SYNC_FALLBACK_MS if no sync arrives.
 *
 * @param {Function} action - Called exactly once, whichever way it resolves
 * @returns {void}
 */
function afterNextCodeSync(action) {
  let settled = false
  let fallbackTimer = null
  const unsubscribe = eventBus.once('sync:canvas-to-code', () => {
    if (settled) return
    settled = true
    clearTimeout(fallbackTimer)
    action()
  })
  fallbackTimer = setTimeout(() => {
    if (settled) return
    settled = true
    unsubscribe()
    action()
  }, REVEAL_SYNC_FALLBACK_MS)
}

/**
 * Set a real selection on the html Monaco editor covering `component`'s
 * serialized block, center it in the viewport, and focus the editor.
 *
 * @param {object} component - GrapesJS component to select in the code pane
 * @returns {boolean} false when nothing was selected — no Monaco pair yet, no
 *          GrapesJS editor, or no range for this component in the current
 *          model text (a stale/empty model, or a component removed between
 *          the menu click and this running). Callers use it to decide whether
 *          the attempt is worth repeating.
 */
function selectInCode(component) {
  const ed = getMonacoPair()?.htmlEditor
  const gjs = getEditor()
  const model = ed?.getModel()
  if (!ed || !gjs || !model) return false
  const range = componentCodeRange(component, model, gjs)
  if (!range) return false
  ed.setSelection(range)
  ed.revealRangeInCenter(range)
  ed.focus()
  return true
}

/** First complete `<…>` of a serialized component — its text anchor. */
function openingTagOf(outerHtml) {
  const m = /^<(?:"[^"]*"|'[^']*'|[^>"'])*>/.exec(outerHtml)
  return m ? m[0] : null
}

/**
 * Pre-order walk counting components before `target` whose serialization
 * starts with the same opening tag. Returns -1 if target isn't in the tree.
 */
function precedingTwins(root, target, openTag) {
  let count = 0
  let found = false
  const visit = node => {
    if (found) return
    if (node === target) { found = true; return }
    if (openingTagOf(node.toHTML?.() || '') === openTag) count++
    const kids = node.components?.()
    if (kids?.models) for (const k of kids.models) visit(k)
  }
  // The wrapper itself is selectable (body); check it before its children.
  if (root === target) return 0
  const kids = root.components?.()
  if (kids?.models) for (const k of kids.models) visit(k)
  return found ? count : -1
}

/** Offset just past the matching close tag (or past a void/self-closed anchor). */
function blockEnd(text, startOffset, openTag) {
  const tagM = /^<\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(openTag)
  const tag = tagM ? tagM[1].toLowerCase() : ''
  const anchorEnd = startOffset + openTag.length
  if (!tag || VOID_TAGS.has(tag) || /\/>$/.test(openTag)) return anchorEnd
  const re = new RegExp(`<${tag}(?=[\\s/>])[^>]*>|</${tag}\\s*>`, 'gi')
  re.lastIndex = startOffset
  let depth = 0
  let m
  while ((m = re.exec(text))) {
    if (m[0][1] === '/') {
      depth--
      if (depth === 0) return m.index + m[0].length
    } else if (!m[0].endsWith('/>')) {
      depth++
    }
  }
  return anchorEnd   // unbalanced markup — highlight at least the open tag
}
