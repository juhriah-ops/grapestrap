/**
 * GrapeStrap — Asset Manager panel
 *
 * Lives as a third tab in the left-column GL stack (next to Project +
 * Library). Lists files inside the project's `assets/{images,fonts,videos}/`
 * directories. Source-of-truth is the filesystem — every paint re-reads via
 * the main-process `file:list-assets` IPC. We don't cache; the file watcher
 * already broadcasts `file:added`/`file:deleted` to keep the UI in sync.
 *
 * Three sections:
 *   - **Images** — image previews (rendered as `<img>` against the project's
 *     `file://` path — see grapesjs-init.js for the canvas-iframe `<base>`
 *     trick that makes relative `assets/images/foo.png` resolve at preview
 *     time too).
 *   - **Fonts** / **Videos** — generic file tiles with the kind icon.
 *
 * Per-section toolbar:
 *   - **+ Add** — opens an OS file picker filtered to that kind, copies the
 *     selected files into `assets/<kind>/` via `copyAsset` IPC.
 *
 * Per-tile:
 *   - **Click an image** — inserts `<img src="assets/images/<name>" alt="">`
 *     into the canvas at the current selection point (anchor-aware, mirrors
 *     the Insert panel placement rules).
 *   - **× delete** — removes the file from disk.
 *
 * Drag-out to canvas in v0.0.3; click-insert is the v0.0.2 surface.
 */

import { projectState } from '../../state/project-state.js'
import { eventBus } from '../../state/event-bus.js'
import { getEditor } from '../../editor/grapesjs-init.js'

const KINDS = [
  { id: 'images', label: 'Images' },
  { id: 'fonts',  label: 'Fonts'  },
  { id: 'videos', label: 'Videos' }
]

const CONTAINER_TAGS = new Set([
  'div', 'section', 'main', 'article', 'aside',
  'header', 'footer', 'nav', 'form', 'ul', 'ol'
])

let host = null
let assetsByKind = { images: [], fonts: [], videos: [] }

export function renderAssetManager(target) {
  host = target
  host.classList.add('gstrap-am-host')
  paint()
  refreshList()

  eventBus.on('project:opened',  () => refreshList())
  eventBus.on('project:closed',  () => { assetsByKind = { images: [], fonts: [], videos: [] }; paint() })
  eventBus.on('assets:changed',  () => refreshList())

  // The chokidar-backed file watcher in main re-broadcasts add/delete events
  // for everything in the project. Filter to site/assets/* and trigger a
  // reload on those (the watcher reports paths relative to projectDir).
  window.grapestrap?.watcher?.onAdded?.(p => { if (p.startsWith('site/assets/')) refreshList() })
  window.grapestrap?.watcher?.onDeleted?.(p => { if (p.startsWith('site/assets/')) refreshList() })
}

async function refreshList() {
  if (!projectState.current) {
    assetsByKind = { images: [], fonts: [], videos: [] }
    paint()
    return
  }
  try {
    const list = await window.grapestrap.file.listAssets()
    assetsByKind = list || { images: [], fonts: [], videos: [] }
  } catch {
    assetsByKind = { images: [], fonts: [], videos: [] }
  }
  paint()
}

function paint() {
  if (!host) return
  if (!projectState.current) {
    host.innerHTML = `<div class="gstrap-am-empty">Open a project to manage its assets.</div>`
    return
  }
  host.innerHTML = `
    ${KINDS.map(k => `
      <section class="gstrap-am-section" data-kind="${k.id}">
        <div class="gstrap-am-section-head">
          <span class="gstrap-am-section-title">${k.label}</span>
          <button class="gstrap-am-add" data-add-kind="${k.id}" title="Add ${k.label.toLowerCase()}">+ Add</button>
        </div>
        <div class="gstrap-am-grid">
          ${(assetsByKind[k.id] || []).map(name => renderTile(k.id, name)).join('')}
          ${(assetsByKind[k.id] || []).length === 0
            ? `<div class="gstrap-am-empty-section">No ${k.label.toLowerCase()} yet.</div>`
            : ''}
        </div>
      </section>
    `).join('')}
  `
  wireEvents()
}

function renderTile(kind, name) {
  const projectDir = projectState.current?.projectDir || ''
  // Path stored in HTML stays relative-to-site (matches the deployable layout);
  // preview URL points at <projectDir>/site/assets/<kind>/<name> on disk.
  const relPath = `assets/${kind}/${name}`
  const absUrl = projectDir ? `file://${projectDir}/site/${relPath}` : relPath
  const isImage = kind === 'images'
  return `
    <div class="gstrap-am-tile" data-asset-kind="${kind}" data-asset-name="${escAttr(name)}"
         draggable="true" title="${escAttr(relPath)}">
      <div class="gstrap-am-tile-media">
        ${isImage
          ? `<img src="${escAttr(absUrl)}" alt="" loading="lazy">`
          : `<span class="gstrap-am-tile-glyph">${kind === 'fonts' ? 'A' : '▶'}</span>`}
      </div>
      <div class="gstrap-am-tile-name">${escHtml(name)}</div>
      <button class="gstrap-am-tile-x" data-asset-delete="${escAttr('site/' + relPath)}" title="Delete">×</button>
    </div>
  `
}

function wireEvents() {
  host.querySelectorAll('[data-add-kind]').forEach(btn => {
    btn.addEventListener('click', () => onAddClicked(btn.dataset.addKind))
  })
  host.querySelectorAll('[data-asset-delete]').forEach(btn => {
    btn.addEventListener('click', evt => {
      evt.stopPropagation()
      onDeleteClicked(btn.dataset.assetDelete)
    })
  })
  host.querySelectorAll('[data-asset-kind]').forEach(tile => {
    tile.addEventListener('click', () => onTileClicked(tile.dataset.assetKind, tile.dataset.assetName))
  })
}

async function onAddClicked(kind) {
  if (!projectState.current) {
    eventBus.emit('toast', { type: 'warning', message: 'Open or create a project first.' })
    return
  }
  try {
    const added = await window.grapestrap.file.importAsset(kind)
    if (added && added.length > 0) {
      eventBus.emit('assets:changed')
      eventBus.emit('toast', { type: 'success', message: `Added ${added.length} ${kind.replace(/s$/, '')}${added.length === 1 ? '' : 's'}` })
    }
  } catch (err) {
    eventBus.emit('toast', { type: 'error', message: `Asset import failed: ${err?.message || err}` })
  }
}

async function onDeleteClicked(relPath) {
  try {
    await window.grapestrap.file.delete(relPath)
    eventBus.emit('assets:changed')
  } catch (err) {
    eventBus.emit('toast', { type: 'error', message: `Delete failed: ${err?.message || err}` })
  }
}

function onTileClicked(kind, name) {
  if (kind !== 'images') return  // fonts/videos: drag-out workflow in v0.0.3
  const editor = getEditor()
  if (!editor) return
  const relPath = `assets/${kind}/${name}`
  const html = `<img src="${relPath}" alt="" class="img-fluid">`
  insertAtSelection(editor, html)
}

function insertAtSelection(editor, html) {
  const wrapper = editor.getWrapper()
  const anchor = editor.getSelected()
  let added
  if (!anchor || anchor === wrapper) {
    added = wrapper.append(html)
  } else {
    const tag = (anchor.get('tagName') || '').toLowerCase()
    if (CONTAINER_TAGS.has(tag)) {
      added = anchor.append(html)
    } else {
      const parent = anchor.parent?.() || wrapper
      const idx = parent.components().indexOf(anchor)
      added = parent.append(html, { at: idx + 1 })
    }
  }
  const first = Array.isArray(added) ? added[0] : added
  if (first) editor.select(first)
  eventBus.emit('canvas:content-changed')
}

function escAttr(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;') }
function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]) }
