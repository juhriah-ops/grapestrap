/**
 * GrapeStrap — Asset Manager panel
 *
 * PATH: src/renderer/panels/asset-manager/index.js
 * ROLE: Third tab in the left-column GL stack (next to Project + Library).
 *       Lists files inside the project's `assets/{images,fonts,videos}/`
 *       directories; click an image tile to insert it into the canvas.
 * DEPENDS: state/project-state.js, state/event-bus.js,
 *          editor/grapesjs-init.js, editor/placement.js, i18n.js
 * CREATED: 2026-05-04
 * UPDATED: 2026-08-11 — click-insert now goes through the shared
 *          resolvePlacement/insertAtPlacement (editor/placement.js) instead
 *          of a locally-duplicated CONTAINER_TAGS/append-at-anchor copy.
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
 *     the Insert panel placement rules via editor/placement.js).
 *   - **× delete** — removes the file from disk.
 *
 * Drag-out to canvas in v0.0.3; click-insert is the v0.0.2 surface.
 */

import { projectState } from '../../state/project-state.js'
import { eventBus } from '../../state/event-bus.js'
import { getEditor } from '../../editor/grapesjs-init.js'
import { resolvePlacement, insertAtPlacement } from '../../editor/placement.js'
import { t } from '../../i18n.js'

// Per-kind message keys (Wave 4 sweep). Titles/empties are per-kind keys, not
// one parameterised string — "Add images" was built by lowercasing the label,
// which doesn't survive translation. addedKey resolves via i18next plurals
// (_one/_other) so "Added 1 image" / "Added 2 images" stay byte-identical.
const KINDS = [
  { id: 'images', labelKey: 'am.images', addTitleKey: 'am.add-images-title', emptyKey: 'am.empty-images', addedKey: 'am.toast.added-image' },
  { id: 'fonts',  labelKey: 'am.fonts',  addTitleKey: 'am.add-fonts-title',  emptyKey: 'am.empty-fonts',  addedKey: 'am.toast.added-font'  },
  { id: 'videos', labelKey: 'am.videos', addTitleKey: 'am.add-videos-title', emptyKey: 'am.empty-videos', addedKey: 'am.toast.added-video' }
]

let host = null
let assetsByKind = { images: [], fonts: [], videos: [] }
let eventsWired = false

export function renderAssetManager(target) {
  host = target
  host.classList.add('gstrap-am-host')
  paint()
  refreshList()
  wireAssetEvents()

  // Drag-and-drop multi-file upload: drop OS files onto any of the three
  // section grids (or the host generally) and they're routed by extension.
  // Reading is renderer-side via File.arrayBuffer + write goes through the
  // file:write-asset-buffer IPC. Default browser drop behavior is to
  // navigate to the file URL; preventDefault stops that.
  host.addEventListener('dragover', evt => {
    if (!hasFiles(evt.dataTransfer)) return
    evt.preventDefault()
    evt.dataTransfer.dropEffect = 'copy'
    host.classList.add('is-drop-target')
  })
  host.addEventListener('dragleave', evt => {
    // Only clear when leaving the host entirely, not when crossing into a child.
    if (evt.target === host) host.classList.remove('is-drop-target')
  })
  host.addEventListener('drop', async evt => {
    if (!hasFiles(evt.dataTransfer)) return
    evt.preventDefault()
    host.classList.remove('is-drop-target')
    // The section the file was dropped on overrides extension-based routing.
    const dropSection = evt.target.closest?.('[data-kind]')?.dataset?.kind || null
    await handleDroppedFiles(evt.dataTransfer.files, dropSection)
  })
}

// Wire-once (Wave 3 idempotency — GL loadLayout re-invokes the factory).
// Covers BOTH the eventBus subs and the two watcher IPC subscriptions:
// grapestrap.watcher.onAdded/onDeleted are ipcRenderer.on under the hood and
// were never unsubscribed, so pre-fix every reset stacked another pair.
// Handlers read the module `host`/`assetsByKind`, reassigned per render run.
function wireAssetEvents() {
  if (eventsWired) return
  eventsWired = true

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
    publishCache()
    paint()
    return
  }
  try {
    const list = await window.grapestrap.file.listAssets()
    assetsByKind = list || { images: [], fonts: [], videos: [] }
  } catch {
    assetsByKind = { images: [], fonts: [], videos: [] }
  }
  publishCache()
  paint()
}

// Publish to a window-level cache so other surfaces (Style Manager →
// Background sub-panel's image picker) can read the asset list synchronously
// during render. The Asset Manager remains the source of truth — anyone
// reading from this cache should also subscribe to 'assets:changed' for
// updates.
function publishCache() {
  window.__gstrap_assets = assetsByKind
}

function paint() {
  if (!host) return
  if (!projectState.current) {
    host.innerHTML = `<div class="gstrap-am-empty">${escHtml(t('am.empty'))}</div>`
    return
  }
  host.innerHTML = `
    ${KINDS.map(k => `
      <section class="gstrap-am-section" data-kind="${k.id}">
        <div class="gstrap-am-section-head">
          <span class="gstrap-am-section-title">${escHtml(t(k.labelKey))}</span>
          <button class="gstrap-am-add" data-add-kind="${k.id}" title="${escAttr(t(k.addTitleKey))}">${escHtml(t('am.add'))}</button>
        </div>
        <div class="gstrap-am-grid">
          ${(assetsByKind[k.id] || []).map(name => renderTile(k.id, name)).join('')}
          ${(assetsByKind[k.id] || []).length === 0
            ? `<div class="gstrap-am-empty-section">${escHtml(t(k.emptyKey))}</div>`
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
      <button class="gstrap-am-tile-x" data-asset-delete="${escAttr('site/' + relPath)}" title="${escAttr(t('action.delete'))}">×</button>
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
    eventBus.emit('toast', { type: 'warning', message: t('toast.no-project') })
    return
  }
  try {
    const added = await window.grapestrap.file.importAsset(kind)
    if (added && added.length > 0) {
      eventBus.emit('assets:changed')
      const addedKey = KINDS.find(k => k.id === kind)?.addedKey || 'am.toast.added-image'
      eventBus.emit('toast', { type: 'success', message: t(addedKey, { count: added.length }) })
    }
  } catch (err) {
    eventBus.emit('toast', { type: 'error', message: t('am.toast.import-failed', { error: err?.message || err }) })
  }
}

async function handleDroppedFiles(fileList, forceKind) {
  if (!projectState.current) {
    eventBus.emit('toast', { type: 'warning', message: t('toast.no-project') })
    return
  }
  const files = Array.from(fileList || [])
  if (!files.length) return

  let okCount = 0
  const skipped = []
  for (const file of files) {
    const kind = forceKind || guessKindByName(file.name)
    if (!kind) { skipped.push(file.name); continue }
    try {
      const buf = await file.arrayBuffer()
      // contextBridge serializes structured data; pass a Uint8Array so the
      // main side can see the exact byte length without relying on Buffer
      // detection.
      await window.grapestrap.file.writeAssetBuffer(kind, file.name, new Uint8Array(buf))
      okCount++
    } catch (err) {
      skipped.push(`${file.name} (${err?.message || err})`)
    }
  }

  eventBus.emit('assets:changed')
  if (okCount) {
    eventBus.emit('toast', {
      type: 'success',
      message: t('am.toast.added-files', { count: okCount })
    })
  }
  if (skipped.length) {
    eventBus.emit('toast', {
      type: 'warning',
      message: t('am.toast.skipped-files', {
        count: skipped.length,
        names: `${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''}`
      })
    })
  }
}

function hasFiles(dt) {
  if (!dt) return false
  if (dt.types && dt.types.includes && dt.types.includes('Files')) return true
  // Some browsers expose only the items collection during dragover.
  return dt.items && Array.from(dt.items).some(i => i.kind === 'file')
}

function guessKindByName(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'ico'].includes(ext)) return 'images'
  if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) return 'fonts'
  if (['mp4', 'webm', 'mov', 'm4v', 'ogg'].includes(ext)) return 'videos'
  return null
}

async function onDeleteClicked(relPath) {
  try {
    await window.grapestrap.file.delete(relPath)
    eventBus.emit('assets:changed')
  } catch (err) {
    eventBus.emit('toast', { type: 'error', message: t('am.toast.delete-failed', { error: err?.message || err }) })
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
  const placement = resolvePlacement(editor, editor.getSelected())
  const { added } = insertAtPlacement(editor, placement, html)
  const first = Array.isArray(added) ? added[0] : added
  if (first) editor.select(first)
  eventBus.emit('canvas:content-changed')
}

function escAttr(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;') }
function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]) }
