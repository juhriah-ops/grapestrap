/**
 * GrapeStrap — Library Items panel
 *
 * PATH: src/renderer/panels/library-items/index.js
 * ROLE: Left-column panel listing library items in the active project —
 *       create/insert/edit/rename/delete, and the propagate-on-save wiring.
 * DEPENDS: state/project-state.js, state/page-state.js, state/event-bus.js,
 *          editor/grapesjs-init.js, editor/placement.js, dialogs/text-prompt.js,
 *          ./lock.js, ./propagate.js, i18n.js
 * CREATED: 2026-05-04
 * UPDATED: 2026-08-11 — cmdInsert now goes through the shared
 *          resolvePlacement/insertAtPlacement (editor/placement.js) instead
 *          of a locally-duplicated CONTAINER_TAGS/append-at-anchor copy.
 * UPDATED: 2026-08-17 — panel also paints BUNDLED sections (read-only groups
 *          below the project's own items) from pluginRegistry.sections.
 *
 * Two kinds of content share this panel, and they behave differently:
 *
 *   1. PROJECT items (top) — the user's own, saved in the project. Inserting
 *      one drops a LINKED instance: wrapped, locked, propagated on save.
 *   2. BUNDLED sections (below, grouped by template name) — read-only defs
 *      registered by plugins via api.registerSection with a `group`. Inserting
 *      one drops a FREE editable copy (editor/insert-section.js) — no wrapper,
 *      no lock, no propagation. They are shipped starting shapes, not links.
 *
 * The two row types carry deliberately distinct classes and data attributes
 * (`.gstrap-lib-item`/`data-lib-insert` vs `.gstrap-lib-bundled-item`/
 * `data-lib-bundled-insert`) so neither selector set can ever pick up the
 * other's rows.
 *
 * Lists all library items in the active project. From here the user can:
 *   - "+ New" — create an empty item, give it a name, opens it in a new
 *     canvas tab so they can build the content.
 *   - "+ From Selection" — wraps the currently-selected canvas component
 *     into a new library item; the original selection becomes a wrapped
 *     instance referencing the new item.
 *   - "Insert" on a row — inserts the item into the active page at the
 *     selection point (anchor-aware, mirrors the Insert panel placement
 *     rules via editor/placement.js).
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
import { pluginRegistry } from '../../plugin-host/registry.js'
import { getEditor } from '../../editor/grapesjs-init.js'
import { resolvePlacement, insertAtPlacement, tagOf } from '../../editor/placement.js'
import { insertBundledSection } from '../../editor/insert-section.js'
import { showTextPrompt } from '../../dialogs/text-prompt.js'
import { wireLibraryLock } from './lock.js'
import { propagateLibraryItem } from './propagate.js'
import { t } from '../../i18n.js'
import { log } from '../../log.js'

// Row glyph for a bundled section that ships no `preview` SVG of its own.
const DEFAULT_SECTION_GLYPH = '▤'

let host = null
let eventsWired = false

export function renderLibraryItems(target) {
  host = target
  host.classList.add('gstrap-lib-host')
  wireLibraryLock()
  paint()
  wireLibraryPanelEvents()
}

// Wire-once (Wave 3 idempotency — GL loadLayout re-invokes the factory; the
// once-guard generalises the wireLibraryLock pattern above). paint() reads
// the module `host`, reassigned per render run.
function wireLibraryPanelEvents() {
  if (eventsWired) return
  eventsWired = true
  eventBus.on('project:opened',  () => paint())
  eventBus.on('project:closed',  () => paint())
  eventBus.on('library:changed', () => paint())
  // Bundled groups come from the plugin registry. Built-in plugins activate
  // before this panel first paints, but a user plugin registering sections
  // later (or a re-activation) must still show up without a restart.
  eventBus.on('plugin:section-registered', () => paint())
}

function paint() {
  if (!host) return
  const project = projectState.current
  if (!project) {
    host.innerHTML = `<div class="gstrap-lib-empty">${escHtml(t('lib.empty'))}</div>`
    return
  }
  const items = project.libraryItems || []
  // One scroll region for both halves: the project list and the bundled groups
  // scroll together, so a long list of own items never squeezes the groups
  // below it into an unreachable sliver.
  host.innerHTML = `
    <div class="gstrap-lib-toolbar">
      <button class="gstrap-lib-btn" data-lib-new>${escHtml(t('lib.new'))}</button>
      <button class="gstrap-lib-btn" data-lib-from-selection>${escHtml(t('lib.from-selection'))}</button>
    </div>
    <div class="gstrap-lib-scroll">
      ${items.length === 0
        ? `<div class="gstrap-lib-empty">${escHtml(t('lib.empty-list'))}</div>`
        : `<ul class="gstrap-lib-list">
            ${items.map(it => `
              <li class="gstrap-lib-item" data-lib-id="${escAttr(it.id)}">
                <span class="gstrap-lib-name">${escHtml(it.name || it.id)}</span>
                <span class="gstrap-lib-actions">
                  <button class="gstrap-lib-mini" data-lib-insert="${escAttr(it.id)}" title="${escAttr(t('lib.insert-title'))}">↵</button>
                  <button class="gstrap-lib-mini" data-lib-edit="${escAttr(it.id)}"   title="${escAttr(t('lib.edit-title'))}">✎</button>
                  <button class="gstrap-lib-mini" data-lib-rename="${escAttr(it.id)}" title="${escAttr(t('action.rename'))}">A</button>
                  <button class="gstrap-lib-mini" data-lib-delete="${escAttr(it.id)}" title="${escAttr(t('action.delete'))}">✕</button>
                </span>
              </li>
            `).join('')}
          </ul>`
      }
      ${renderBundledGroups()}
    </div>
  `
  wireEvents()
}

// ── Bundled sections (read-only groups) ────────────────────────────────────

/**
 * Markup for every bundled group, in first-appearance order. Empty string when
 * no plugin has registered a grouped section — the panel then looks exactly
 * as it did before this feature existed.
 * @returns {string} HTML
 */
function renderBundledGroups() {
  let html = ''
  for (const [groupName, sections] of groupBundledSections()) {
    html += `
      <div class="gstrap-lib-bundled-group">
        <div class="gstrap-lib-group-header">${escHtml(groupName)}</div>
        <ul class="gstrap-lib-bundled-list">
          ${sections.map(renderBundledRow).join('')}
        </ul>
      </div>
    `
  }
  return html
}

/**
 * Bundled sections keyed by their group header.
 * Only sections carrying a `group` belong in this panel — the generic
 * Insert-panel section defs deliberately have none.
 * @returns {Map<string, object[]>} Map iteration order = group first-appearance
 */
function groupBundledSections() {
  const groups = new Map()
  for (const section of pluginRegistry.sections || []) {
    if (!section?.group || !section?.id) continue
    if (!groups.has(section.group)) groups.set(section.group, [])
    groups.get(section.group).push(section)
  }
  return groups
}

/**
 * One bundled row: preview glyph, label, and a single insert button.
 * @param {object} section - A registerSection def carrying a `group`
 * @returns {string} HTML for one <li>
 */
function renderBundledRow(section) {
  // `preview` is inline SVG markup injected RAW, per the registerSection
  // contract (plugin-host/api.js) — it is bundled plugin data, never user
  // input. Label/description/id go through the escapers like everything else.
  const previewMarkup = section.preview || DEFAULT_SECTION_GLYPH
  const label = section.label || section.id
  return `
    <li class="gstrap-lib-bundled-item" data-lib-bundled-id="${escAttr(section.id)}"
        title="${escAttr(section.description || label)}">
      <span class="gstrap-lib-bundled-media">${previewMarkup}</span>
      <span class="gstrap-lib-name">${escHtml(label)}</span>
      <span class="gstrap-lib-actions">
        <button class="gstrap-lib-mini" data-lib-bundled-insert="${escAttr(section.id)}"
                title="${escAttr(t('lib.bundled-insert-title'))}">↵</button>
      </span>
    </li>
  `
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
  host.querySelectorAll('[data-lib-bundled-insert]').forEach(btn => {
    btn.addEventListener('click', () => cmdInsertBundled(btn.dataset.libBundledInsert))
  })
}

async function cmdNew() {
  if (!requireProject()) return
  const name = await showTextPrompt({
    title: t('lib.prompt.new-title'),
    label: t('lib.prompt.name-label'),
    initialValue: t('lib.prompt.default-name'),
    placeholder: t('lib.prompt.name-placeholder'),
    okLabel: t('action.create')
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
    eventBus.emit('toast', { type: 'warning', message: t('toast.select-element') })
    return
  }
  const name = await showTextPrompt({
    title: t('lib.prompt.from-selection-title'),
    label: t('lib.prompt.name-label'),
    initialValue: tagOf(sel) || 'item',
    okLabel: t('action.create')
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
  const placement = resolvePlacement(editor, editor.getSelected?.())
  const { added } = insertAtPlacement(editor, placement, html)
  const first = Array.isArray(added) ? added[0] : added
  if (first) editor.select(first)
  eventBus.emit('canvas:content-changed')
}

/**
 * Insert a bundled section as a free editable copy.
 *
 * Gated on an open project like every other command here (the section's CSS
 * chunks and images have nowhere to land without one). Async unlike cmdInsert:
 * assets are copied over IPC before the markup goes in.
 *
 * @param {string} id - The registered section id from the row's data attribute
 * @returns {Promise<void>}
 */
async function cmdInsertBundled(id) {
  if (!requireProject()) return
  const section = (pluginRegistry.sections || []).find(s => s.id === id)
  if (!section) return
  try {
    await insertBundledSection(section)
  } catch (err) {
    // Editor not up, or a section def missing content — never leave the click
    // silently doing nothing (the eventBus swallows handler throws).
    log.error(`bundled section insert "${id}" failed:`, err)
    eventBus.emit('toast', {
      type: 'error',
      message: t('lib.toast.bundled-insert-failed', { error: err?.message || err })
    })
  }
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
    title: t('lib.prompt.rename-title'),
    label: t('lib.prompt.rename-label'),
    initialValue: item.name || item.id,
    okLabel: t('action.rename')
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
      message: t('lib.toast.in-use', { count: inUse })
    })
    return
  }
  items.splice(i, 1)
  pageState.close(id)  // close the editor tab if open
  projectState.markLibraryDirty(id)
  eventBus.emit('library:changed')
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
    eventBus.emit('toast', { type: 'warning', message: t('toast.no-project') })
    return false
  }
  return true
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c])
}
function escAttr(s) { return escHtml(s) }

// Public: called by the canvas swap-out and by Save to fan out edits.
export { propagateLibraryItem }
