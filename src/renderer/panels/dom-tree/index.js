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
 */

import { eventBus } from '../../state/event-bus.js'
import { getEditor } from '../../editor/grapesjs-init.js'

let hostEl = null
let selectedId = null
let refreshScheduled = false

export function renderDomTree(host) {
  hostEl = host
  host.classList.add('gstrap-dom-host')
  paint()

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

  host.addEventListener('click', evt => {
    const row = evt.target.closest('[data-cid]')
    if (!row) return
    const editor = getEditor()
    if (!editor) return
    const found = findById(editor.getWrapper(), row.dataset.cid)
    if (found) editor.select(found)
  })
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
    hostEl.innerHTML = `<div class="gstrap-dom-empty">Canvas not ready.</div>`
    return
  }
  const wrapper = editor.getWrapper()
  const children = wrapper ? wrapper.components() : []
  if (!children || children.length === 0) {
    hostEl.innerHTML = `<div class="gstrap-dom-empty">Empty page.</div>`
    return
  }
  const rows = []
  for (const child of children) walk(child, 0, rows)
  hostEl.innerHTML = `<ul class="gstrap-dom-tree">${rows.join('')}</ul>`
  applyHighlight()
}

function walk(component, depth, out) {
  const tag = (component.get('tagName') || 'div').toLowerCase()
  // Skip GrapesJS textnode placeholders that don't represent user content.
  if (component.get('type') === 'textnode') return

  const cid = component.getId()
  const indent = depth * 14 + 8
  const label = formatLabel(component, tag)
  const children = component.components() || []
  const hasChildren = children.length > 0

  out.push(
    `<li class="gstrap-dom-row${hasChildren ? '' : ' is-leaf'}"`
    + ` data-cid="${esc(cid)}" style="padding-left:${indent}px">`
    + `<span class="gstrap-dom-twist">${hasChildren ? '▾' : '·'}</span>`
    + label
    + `</li>`
  )
  for (const c of children) walk(c, depth + 1, out)
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
