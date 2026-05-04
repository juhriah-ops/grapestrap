/**
 * GrapeStrap — Library Items panel
 *
 * Lists all library items in the active project. From here the user can:
 *   - "+ New" — create an empty item, give it a name, opens it in a new
 *     canvas tab so they can build the content.
 *   - "+ From Selection" — wraps the currently-selected canvas component
 *     into a new library item; the original selection becomes a wrapped
 *     instance referencing the new item.
 *   - "Insert" on a row — inserts the item into the active page at the
 *     selection point (anchor-aware, mirrors the Insert panel placement
 *     rules).
 *   - Double-click a row — opens the item in a canvas tab.
 *   - Right-click a row — Rename / Delete.
 *
 * Page instances of an item are wrapped:
 *   <div data-grpstr-library="<id>" data-grpstr-library-name="<name>">…</div>
 * The wrapper's descendants are locked from selection/edit by `lock.js`.
 *
 * Edits to a library item propagate to every page on save and on tab
 * focus-out — see `propagate.js`.
 */

import { projectState } from '../../state/project-state.js'
import { pageState } from '../../state/page-state.js'
import { eventBus } from '../../state/event-bus.js'
import { getEditor, getCanvasHtml } from '../../editor/grapesjs-init.js'
import { showTextPrompt } from '../../dialogs/text-prompt.js'
import { wireLibraryLock } from './lock.js'
import { propagateLibraryItem } from './propagate.js'

let host = null

export function renderLibraryItems(target) {
  host = target
  host.classList.add('gstrap-lib-host')
  wireLibraryLock()
  paint()
  eventBus.on('project:opened',  () => paint())
  eventBus.on('project:closed',  () => paint())
  eventBus.on('library:changed', () => paint())
}

function paint() {
  if (!host) return
  const project = projectState.current
  if (!project) {
    host.innerHTML = `<div class="gstrap-lib-empty">Open a project to see its library.</div>`
    return
  }
  const items = project.libraryItems || []
  host.innerHTML = `
    <div class="gstrap-lib-toolbar">
      <button class="gstrap-lib-btn" data-lib-new>+ New</button>
      <button class="gstrap-lib-btn" data-lib-from-selection>+ From Selection</button>
    </div>
    ${items.length === 0
      ? `<div class="gstrap-lib-empty">No library items yet. Click "+ New" or wrap a selection.</div>`
      : `<ul class="gstrap-lib-list">
          ${items.map(it => `
            <li class="gstrap-lib-item" data-lib-id="${escAttr(it.id)}">
              <span class="gstrap-lib-name">${escHtml(it.name || it.id)}</span>
              <span class="gstrap-lib-actions">
                <button class="gstrap-lib-mini" data-lib-insert="${escAttr(it.id)}" title="Insert into page">↵</button>
                <button class="gstrap-lib-mini" data-lib-edit="${escAttr(it.id)}"   title="Open for editing">✎</button>
                <button class="gstrap-lib-mini" data-lib-rename="${escAttr(it.id)}" title="Rename">A</button>
                <button class="gstrap-lib-mini" data-lib-delete="${escAttr(it.id)}" title="Delete">✕</button>
              </span>
            </li>
          `).join('')}
        </ul>`
    }
  `
  wireEvents()
}

function wireEvents() {
  host.querySelector('[data-lib-new]')?.addEventListener('click', cmdNew)
  host.querySelector('[data-lib-from-selection]')?.addEventListener('click', cmdFromSelection)
  host.querySelectorAll('[data-lib-insert]').forEach(btn => {
    btn.addEventListener('click', () => cmdInsert(btn.dataset.libInsert))
  })
  host.querySelectorAll('[data-lib-edit]').forEach(btn => {
    btn.addEventListener('click', () => cmdEdit(btn.dataset.libEdit))
  })
  host.querySelectorAll('[data-lib-rename]').forEach(btn => {
    btn.addEventListener('click', () => cmdRename(btn.dataset.libRename))
  })
  host.querySelectorAll('[data-lib-delete]').forEach(btn => {
    btn.addEventListener('click', () => cmdDelete(btn.dataset.libDelete))
  })
  host.querySelectorAll('.gstrap-lib-item').forEach(li => {
    li.addEventListener('dblclick', () => cmdEdit(li.dataset.libId))
  })
}

async function cmdNew() {
  if (!requireProject()) return
  const name = await showTextPrompt({
    title: 'New library item',
    label: 'Library item name',
    initialValue: 'Footer',
    placeholder: 'e.g. Footer',
    okLabel: 'Create'
  })
  if (!name) return
  const item = makeItem(name, '<div class="container py-3"><p>New library item</p></div>')
  projectState.current.libraryItems.push(item)
  projectState.markLibraryDirty(item.id)
  eventBus.emit('library:changed')
  openLibraryTab(item)
}

async function cmdFromSelection() {
  if (!requireProject()) return
  const editor = getEditor()
  const sel = editor?.getSelected?.()
  if (!sel) {
    eventBus.emit('toast', { type: 'warning', message: 'Select an element first.' })
    return
  }
  const name = await showTextPrompt({
    title: 'Library item from selection',
    label: 'Library item name',
    initialValue: tagOf(sel) || 'item',
    okLabel: 'Create'
  })
  if (!name) return
  const innerHtml = sel.toHTML()
  const item = makeItem(name, innerHtml)
  projectState.current.libraryItems.push(item)
  projectState.markLibraryDirty(item.id)

  // Replace the original selection with a wrapped instance. The selection's
  // own html becomes the library item's inner; the wrapper is what stays in
  // the page tree.
  const parent = sel.parent?.()
  if (parent) {
    const idx = parent.components().indexOf(sel)
    parent.append(makeWrapperHtml(item, innerHtml), { at: idx })
    sel.remove()
  }
  eventBus.emit('library:changed')
  eventBus.emit('canvas:content-changed')
}

function cmdInsert(id) {
  if (!requireProject()) return
  const editor = getEditor()
  if (!editor) return
  const item = projectState.current.libraryItems.find(it => it.id === id)
  if (!item) return
  const html = makeWrapperHtml(item, item.html || '')
  const anchor = editor.getSelected?.()
  const wrapper = editor.getWrapper()
  let target, added
  if (!anchor || anchor === wrapper) {
    target = wrapper
    added = wrapper.append(html)
  } else {
    const tag = tagOf(anchor)
    if (CONTAINER_TAGS.has(tag)) {
      target = anchor
      added = anchor.append(html)
    } else {
      const parent = anchor.parent?.() || wrapper
      const idx = parent.components().indexOf(anchor)
      target = parent
      added = parent.append(html, { at: idx + 1 })
    }
  }
  const first = Array.isArray(added) ? added[0] : added
  if (first) editor.select(first)
  eventBus.emit('canvas:content-changed')
}

function cmdEdit(id) {
  if (!requireProject()) return
  const item = projectState.current.libraryItems.find(it => it.id === id)
  if (!item) return
  openLibraryTab(item)
}

async function cmdRename(id) {
  if (!requireProject()) return
  const item = projectState.current.libraryItems.find(it => it.id === id)
  if (!item) return
  const next = await showTextPrompt({
    title: 'Rename library item',
    label: 'New name',
    initialValue: item.name || item.id,
    okLabel: 'Rename'
  })
  if (!next || next === item.name) return
  item.name = next
  projectState.markLibraryDirty(item.id)
  eventBus.emit('library:changed')
}

function cmdDelete(id) {
  if (!requireProject()) return
  const items = projectState.current.libraryItems
  const i = items.findIndex(it => it.id === id)
  if (i < 0) return
  // If the item has instances on pages, propagating "" would empty them —
  // refuse and tell the user. Detaching first is the recommended path.
  const inUse = countInstances(id)
  if (inUse > 0) {
    eventBus.emit('toast', {
      type: 'warning',
      message: `Library item is used on ${inUse} page(s). Detach instances first.`
    })
    return
  }
  items.splice(i, 1)
  pageState.close(id)  // close the editor tab if open
  eventBus.emit('library:changed')
  eventBus.emit('project:dirty-changed')
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeItem(name, html) {
  const id = generateId(name)
  return { id, name, html, file: `library/${id}.html` }
}

function makeWrapperHtml(item, innerHtml) {
  return `<div data-grpstr-library="${escAttr(item.id)}" data-grpstr-library-name="${escAttr(item.name || item.id)}">${innerHtml || ''}</div>`
}

function generateId(name) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
  let id = slug
  const existing = new Set((projectState.current.libraryItems || []).map(it => it.id))
  let n = 1
  while (existing.has(id)) { id = `${slug}-${++n}` }
  return id
}

function openLibraryTab(item) {
  pageState.open(item.id, { kind: 'library', label: item.name || item.id })
}

function countInstances(id) {
  let count = 0
  const pages = projectState.current?.pages || []
  for (const p of pages) {
    const re = new RegExp(`data-grpstr-library="${id.replace(/[".\\]/g, '\\$&')}"`, 'g')
    const matches = (p.html || '').match(re)
    if (matches) count += matches.length
  }
  return count
}

function requireProject() {
  if (!projectState.current) {
    eventBus.emit('toast', { type: 'warning', message: 'Open or create a project first.' })
    return false
  }
  return true
}

function tagOf(component) {
  return (component.get?.('tagName') || '').toLowerCase()
}

const CONTAINER_TAGS = new Set([
  'div', 'section', 'article', 'main', 'aside',
  'header', 'footer', 'nav', 'form', 'ul', 'ol'
])

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c])
}
function escAttr(s) { return escHtml(s) }

// Public: called by the canvas swap-out and by Save to fan out edits.
export { propagateLibraryItem }
