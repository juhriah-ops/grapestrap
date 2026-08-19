/**
 * GrapeStrap — DOM Tree panel
 *
 * Mirrors the canvas's component tree as an indented list. Click a row to
 * select that component on the canvas; canvas selections highlight the
 * matching row in the tree. Two-way sync with no debouncing on the
 * canvas → tree path because re-renders are cheap for typical pages.
 *
 * v0.0.2 first cut: read-only tree, click-to-select, selection follow.
 * v0.0.2 follow-ups: drag-to-reorder, right-click context menu (wrap,
 * delete, duplicate, edit tag), collapse-individual-nodes via twisty.
 *
 * Why we walk GrapesJS components and not the iframe DOM directly: the
 * iframe DOM contains GrapesJS's own marker elements and ghosts that we
 * don't want to expose. The component tree is the user's mental model.
 *
 * UPDATED: 2026-08-18 — row indent no longer templates an inline
 *          `style="padding-left:…"` string into the row's HTML (house rule:
 *          no inline styles). Depth ships as a `data-depth` attribute and
 *          applyIndent() sets `--gstrap-dom-indent` via `.style.setProperty()`
 *          on the real DOM nodes after each repaint — the same idiom
 *          panels/style-manager/custom-color.js uses for its swatch chip —
 *          consumed by a `padding-left: var(--gstrap-dom-indent)` rule in
 *          styles/dom-tree.css. Rendering is pixel-identical.
 */

import { eventBus } from '../../state/event-bus.js'
import { getEditor } from '../../editor/grapesjs-init.js'
import { t } from '../../i18n.js'

// Row indent geometry: DOM_TREE_INDENT_BASE_PX is depth-0's left padding;
// each deeper level adds DOM_TREE_INDENT_STEP_PX on top of that.
const DOM_TREE_INDENT_BASE_PX = 8
const DOM_TREE_INDENT_STEP_PX = 14

let hostEl = null
let selectedId = null
let refreshScheduled = false
let eventsWired = false

export function renderDomTree(host) {
  hostEl = host
  host.classList.add('gstrap-dom-host')
  paint()
  wireDomTreeEvents()

  host.addEventListener('click', evt => {
    const row = evt.target.closest('[data-cid]')
    if (!row) return
    const editor = getEditor()
    if (!editor) return
    const found = findById(editor.getWrapper(), row.dataset.cid)
    if (found) editor.select(found)
  })

  // Right-click → select the row's component then emit the same context-menu
  // event the canvas iframe handler emits. The renderer-level listener in
  // main.js opens the menu so canvas + tree share one open path.
  host.addEventListener('contextmenu', evt => {
    const row = evt.target.closest('[data-cid]')
    if (!row) return
    evt.preventDefault()
    const editor = getEditor()
    if (!editor) return
    const found = findById(editor.getWrapper(), row.dataset.cid)
    if (found) editor.select(found)
    eventBus.emit('canvas:context-menu', {
      x: evt.clientX, y: evt.clientY, component: found
    })
  })
}

// Wire-once (Wave 3 idempotency — GL loadLayout re-invokes the factory).
// paint()/applyHighlight() already read the module hostEl, which every
// render run reassigns, so the handlers always target the live host.
function wireDomTreeEvents() {
  if (eventsWired) return
  eventsWired = true
  eventBus.on('canvas:ready',           () => paint())
  eventBus.on('canvas:content-changed', () => schedulePaint())
  eventBus.on('canvas:selected', component => {
    selectedId = component?.getId?.() || null
    applyHighlight()
  })
  eventBus.on('canvas:deselected', () => {
    selectedId = null
    applyHighlight()
  })
  eventBus.on('project:closed', () => paint())
}

// Coalesce bursts of canvas:content-changed (e.g. dropping a section that
// adds 30 children) into one repaint per microtask boundary.
function schedulePaint() {
  if (refreshScheduled) return
  refreshScheduled = true
  queueMicrotask(() => { refreshScheduled = false; paint() })
}

function paint() {
  if (!hostEl) return
  const editor = getEditor()
  if (!editor) {
    hostEl.innerHTML = `<div class="gstrap-dom-empty">${esc(t('dom.canvas-not-ready'))}</div>`
    return
  }
  const wrapper = editor.getWrapper()
  const children = wrapper ? wrapper.components() : []
  if (!children || children.length === 0) {
    hostEl.innerHTML = `<div class="gstrap-dom-empty">${esc(t('dom.empty-page'))}</div>`
    return
  }
  const rows = []
  for (const child of children) walk(child, 0, rows)
  hostEl.innerHTML = `<ul class="gstrap-dom-tree">${rows.join('')}</ul>`
  applyIndent()
  applyHighlight()
}

function walk(component, depth, out) {
  const tag = (component.get('tagName') || 'div').toLowerCase()
  // Skip GrapesJS textnode placeholders that don't represent user content.
  if (component.get('type') === 'textnode') return

  const cid = component.getId()
  const label = formatLabel(component, tag)
  const children = component.components() || []
  const hasChildren = children.length > 0

  // Depth is carried as a plain data-* attribute here, not baked into a
  // `style="padding-left:…"` string — that would be the same inline-style
  // violation applyIndent() below exists to avoid. applyIndent() reads this
  // once the row is a real DOM node and sets the indent as a CSS custom
  // property instead.
  out.push(
    `<li class="gstrap-dom-row${hasChildren ? '' : ' is-leaf'}"`
    + ` data-cid="${esc(cid)}" data-depth="${depth}">`
    + `<span class="gstrap-dom-twist">${hasChildren ? '▾' : '·'}</span>`
    + label
    + `</li>`
  )
  for (const c of children) walk(c, depth + 1, out)
}

// Row indent is a runtime value (tree depth × step) with no fixed set of
// classes to enumerate, so it can't be a `:class`-style toggle — it has to be
// a computed value. The house rule for that case (see project CLAUDE.md: "a
// runtime-computed value → set a CSS custom property on a parent class, not
// inline on the element") is exactly what style-manager/custom-color.js does
// for its swatch chip (`swatch.style.setProperty('--swatch', …)`): call
// `.style.setProperty()` on the live element, and let a stylesheet rule
// (`.gstrap-dom-row { padding-left: var(--gstrap-dom-indent) }` in
// styles/dom-tree.css) consume it. That is NOT the same as templating a
// `style="…"` string into the row's HTML — this runs once per repaint,
// after paint() has already replaced hostEl.innerHTML wholesale, so every
// row it touches is a freshly-inserted node with nothing to clean up.
function applyIndent() {
  if (!hostEl) return
  const rows = hostEl.querySelectorAll('.gstrap-dom-row[data-depth]')
  for (const row of rows) {
    const depth = Number(row.dataset.depth) || 0
    const indentPx = depth * DOM_TREE_INDENT_STEP_PX + DOM_TREE_INDENT_BASE_PX
    row.style.setProperty('--gstrap-dom-indent', `${indentPx}px`)
  }
}

function formatLabel(component, tag) {
  const attrs = component.getAttributes?.() || {}
  const classes = component.getClasses?.() || []
  const elId = attrs.id

  const parts = [`<span class="gstrap-dom-tag">${esc(tag)}</span>`]
  if (elId) parts.push(`<span class="gstrap-dom-id">#${esc(elId)}</span>`)
  const flatClasses = classes
    .map(c => typeof c === 'string' ? c : (c?.get?.('name') || ''))
    .filter(Boolean)
  for (const cls of flatClasses.slice(0, 3)) {
    parts.push(`<span class="gstrap-dom-class">.${esc(cls)}</span>`)
  }
  if (flatClasses.length > 3) {
    parts.push(`<span class="gstrap-dom-more">+${flatClasses.length - 3}</span>`)
  }
  return parts.join('')
}

function findById(root, cid) {
  if (!root) return null
  if (root.getId?.() === cid) return root
  const kids = root.components?.() || []
  for (const child of kids) {
    const found = findById(child, cid)
    if (found) return found
  }
  return null
}

function applyHighlight() {
  if (!hostEl) return
  const prev = hostEl.querySelector('.is-selected')
  if (prev) prev.classList.remove('is-selected')
  if (!selectedId) return
  const el = hostEl.querySelector(`[data-cid="${cssEscape(selectedId)}"]`)
  if (el) {
    el.classList.add('is-selected')
    el.scrollIntoView({ block: 'nearest' })
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
function cssEscape(s) {
  // Component IDs are GrapesJS-generated and safe, but defend anyway.
  return String(s).replace(/(["\\])/g, '\\$1')
}
