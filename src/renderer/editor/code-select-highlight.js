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
 */

import { eventBus } from '../state/event-bus.js'
import { pageState } from '../state/page-state.js'
import { getMonacoPair } from '../panels/canvas/index.js'
import { getEditor } from './grapesjs-init.js'

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

  const openTag = openingTagOf(comp.toHTML?.() || '')
  if (!openTag) return clear()

  // Occurrences of this exact opening tag among components that precede the
  // target in document order.
  const nth = precedingTwins(gjs.getWrapper(), comp, openTag)
  if (nth < 0) return clear()   // component no longer in the tree

  const value = model.getValue()
  let offset = -1
  let from = 0
  for (let i = 0; i <= nth; i++) {
    offset = value.indexOf(openTag, from)
    if (offset < 0) return clear()
    from = offset + 1
  }
  const end = blockEnd(value, offset, openTag)
  const range = {
    startLineNumber: model.getPositionAt(offset).lineNumber,
    startColumn: model.getPositionAt(offset).column,
    endLineNumber: model.getPositionAt(end).lineNumber,
    endColumn: model.getPositionAt(end).column
  }
  clear()
  collection = ed.createDecorationsCollection([{
    range,
    options: { className: 'gstrap-code-sel-highlight', isWholeLine: false }
  }])
  ed.revealRangeInCenterIfOutsideViewport(range)
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
