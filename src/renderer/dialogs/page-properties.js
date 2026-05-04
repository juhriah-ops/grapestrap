/**
 * GrapeStrap — Page Properties dialog
 *
 * Modal triggered by File → Page Properties. Three tabs:
 *
 *   - **General** — page title (defaults to page name on load), page
 *     description. These map to `<title>` and `<meta name=description>`
 *     in the exported HTML.
 *
 *   - **Favicon** — picks from project images (assets/images/) or shows
 *     the current setting. Stored at project level by default
 *     (`manifest.metadata.favicon`); a per-page override is possible via
 *     `head.favicon`. Uses the same Asset Manager cache as the Style
 *     Manager bg-image picker, so a freshly-dropped icon shows up
 *     without restart.
 *
 *   - **Meta** — key/value list for custom `<meta name=... content=...>`
 *     entries (keywords, robots, OG, twitter:card, etc.). Add / remove
 *     rows. Saved to page.head.customMeta.
 *
 * Save commits the dialog state into projectState (page + manifest), marks
 * dirty, and emits 'project:dirty-changed'. The Save flow on the next
 * Ctrl+S persists everything.
 */

import { eventBus } from '../state/event-bus.js'
import { projectState } from '../state/project-state.js'
import { pageState } from '../state/page-state.js'

let overlay = null
let activeTab = 'general'
let workingPage = null
let workingMeta = null

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'favicon', label: 'Favicon' },
  { id: 'meta',    label: 'Meta'    }
]

export function openPagePropertiesDialog() {
  if (overlay) return
  if (!projectState.current) {
    eventBus.emit('toast', { type: 'warning', message: 'Open a project first.' })
    return
  }
  const tab = pageState.active()
  if (!tab) {
    eventBus.emit('toast', { type: 'warning', message: 'Open a page tab first.' })
    return
  }
  if (tab.kind === 'library') {
    eventBus.emit('toast', { type: 'warning', message: 'Library items don\'t carry head metadata. Switch to a page tab.' })
    return
  }
  const page = projectState.current.pages.find(p => p.name === tab.pageName)
  if (!page) return

  // Snapshot what we'll edit. Commit happens on Save; Cancel discards.
  workingPage = {
    title: page.head?.title || page.name,
    description: page.head?.description || '',
    favicon: page.head?.favicon || '',
    customMeta: (page.head?.customMeta || []).map(m => ({ ...m }))
  }
  workingMeta = {
    favicon: projectState.current.manifest?.metadata?.favicon || ''
  }

  const host = document.getElementById('gstrap-modals')
  if (!host) return
  overlay = document.createElement('div')
  overlay.className = 'gstrap-prefs-overlay'
  host.appendChild(overlay)
  paint()

  overlay.addEventListener('click', evt => {
    if (evt.target === overlay) close()
    const tabBtn = evt.target.closest('[data-pp-tab]')
    if (tabBtn) { activeTab = tabBtn.dataset.ppTab; paint(); return }
    const action = evt.target.closest('[data-pp-action]')
    if (action) handleAction(action.dataset.ppAction, action.dataset.ppArg)
  })
  overlay.addEventListener('input', evt => {
    const field = evt.target.closest('[data-pp-field]')
    if (field) onFieldInput(field.dataset.ppField, field.value, field.dataset.ppIndex)
  })
  document.addEventListener('keydown', onKeyDown, true)
}

function close() {
  if (!overlay) return
  document.removeEventListener('keydown', onKeyDown, true)
  overlay.parentNode?.removeChild(overlay)
  overlay = null
  workingPage = null
  workingMeta = null
}

function onKeyDown(evt) {
  if (!overlay) return
  if (evt.key === 'Escape') {
    evt.preventDefault(); evt.stopImmediatePropagation()
    close()
  }
}

function paint() {
  if (!overlay) return
  overlay.innerHTML = `
    <div class="gstrap-prefs-card" role="dialog" aria-modal="true">
      <div class="gstrap-prefs-header">
        <span class="gstrap-prefs-title">Page Properties</span>
        <button class="gstrap-prefs-close" data-pp-action="close" title="Close">✕</button>
      </div>
      <div class="gstrap-prefs-body">
        <div class="gstrap-prefs-tabs">
          ${TABS.map(t => `
            <button class="gstrap-prefs-tab ${t.id === activeTab ? 'is-active' : ''}"
                    data-pp-tab="${t.id}">${t.label}</button>
          `).join('')}
        </div>
        <div class="gstrap-prefs-pane">
          ${activeTab === 'general' ? paneGeneral() :
            activeTab === 'favicon' ? paneFavicon() :
            paneMeta()}
        </div>
      </div>
      <div class="gstrap-pp-footer">
        <button class="gstrap-prefs-btn" data-pp-action="cancel">Cancel</button>
        <button class="gstrap-prefs-btn gstrap-pp-primary" data-pp-action="save">Save</button>
      </div>
    </div>
  `
}

function paneGeneral() {
  return `
    <div class="gstrap-pp-row">
      <label class="gstrap-pp-label">Page title</label>
      <input type="text" class="gstrap-pp-input" data-pp-field="title"
             value="${escAttr(workingPage.title)}"
             placeholder="${escAttr(pageState.active()?.pageName || '')}">
      <span class="gstrap-pp-hint">Becomes <code>&lt;title&gt;</code> in the exported HTML.</span>
    </div>
    <div class="gstrap-pp-row">
      <label class="gstrap-pp-label">Description</label>
      <textarea class="gstrap-pp-input gstrap-pp-textarea" data-pp-field="description"
                rows="3" placeholder="A short summary used by search engines + social cards.">${escHtml(workingPage.description)}</textarea>
      <span class="gstrap-pp-hint">Becomes <code>&lt;meta name="description"&gt;</code>.</span>
    </div>
  `
}

function paneFavicon() {
  const cache = window.__gstrap_assets || { images: [] }
  const images = (cache.images || []).map(name => `assets/images/${name}`)
  const icoCandidates = images.filter(p => /\.(ico|png|svg|webp)$/i.test(p))
  const projectFavicon = workingMeta.favicon
  const pageFavicon    = workingPage.favicon
  return `
    <div class="gstrap-pp-row">
      <label class="gstrap-pp-label">Project favicon</label>
      <div class="gstrap-pp-favicon">
        ${projectFavicon
          ? `<div class="gstrap-pp-fav-current">
              ${imagePreview(projectFavicon)}
              <code>${escHtml(projectFavicon)}</code>
              <button class="gstrap-prefs-btn" data-pp-action="clear-project-favicon">Clear</button>
             </div>`
          : `<div class="gstrap-pp-fav-empty">No favicon set. Drop an icon into the Assets panel, then pick it below.</div>`}
      </div>
      <span class="gstrap-pp-hint">Applies to every page. Per-page override below.</span>
    </div>

    <div class="gstrap-pp-row">
      <label class="gstrap-pp-label">Pick from project images</label>
      ${icoCandidates.length === 0
        ? `<div class="gstrap-pp-fav-empty">Drop a .ico, .png, .svg, or .webp file into the Assets panel and reopen this dialog.</div>`
        : `<div class="gstrap-pp-fav-grid">
            ${icoCandidates.map(p => `
              <button class="gstrap-pp-fav-tile ${projectFavicon === p ? 'is-active' : ''}"
                      data-pp-action="set-project-favicon" data-pp-arg="${escAttr(p)}" title="${escAttr(p)}">
                ${imagePreview(p)}
                <span class="gstrap-pp-fav-name">${escHtml(basename(p))}</span>
              </button>
            `).join('')}
          </div>`}
    </div>

    <div class="gstrap-pp-row">
      <label class="gstrap-pp-label">This page only</label>
      <input type="text" class="gstrap-pp-input" data-pp-field="favicon"
             value="${escAttr(pageFavicon)}"
             placeholder="(inherits project favicon)">
      <span class="gstrap-pp-hint">Path relative to the site root. Leave blank to inherit.</span>
    </div>
  `
}

function paneMeta() {
  return `
    <div class="gstrap-pp-row">
      <label class="gstrap-pp-label">Custom meta tags</label>
      <table class="gstrap-pp-meta-table">
        <thead><tr><th>Name</th><th>Content</th><th></th></tr></thead>
        <tbody>
          ${(workingPage.customMeta || []).map((m, i) => `
            <tr>
              <td><input type="text" class="gstrap-pp-input" data-pp-field="meta.name" data-pp-index="${i}"
                         value="${escAttr(m.name || '')}" placeholder="keywords"></td>
              <td><input type="text" class="gstrap-pp-input" data-pp-field="meta.content" data-pp-index="${i}"
                         value="${escAttr(m.content || '')}" placeholder="bootstrap, demo"></td>
              <td><button class="gstrap-prefs-btn" data-pp-action="meta-remove" data-pp-arg="${i}">×</button></td>
            </tr>
          `).join('')}
          ${workingPage.customMeta.length === 0 ? `
            <tr><td colspan="3" class="gstrap-pp-fav-empty">No custom meta tags. Click "Add" to add one.</td></tr>
          ` : ''}
        </tbody>
      </table>
      <button class="gstrap-prefs-btn" data-pp-action="meta-add">+ Add meta tag</button>
      <span class="gstrap-pp-hint">Common: <code>keywords</code>, <code>robots</code>, <code>og:title</code>, <code>twitter:card</code>.</span>
    </div>
  `
}

function imagePreview(relPath) {
  const projectDir = projectState.current?.projectDir
  if (!projectDir) return ''
  const url = `file://${projectDir}/site/${relPath}`
  return `<img src="${escAttr(url)}" alt="" loading="lazy">`
}

function basename(p) {
  return String(p).split('/').filter(Boolean).pop() || p
}

function onFieldInput(field, value, index) {
  if (field === 'title')       workingPage.title = value
  else if (field === 'description') workingPage.description = value
  else if (field === 'favicon')     workingPage.favicon = value.trim()
  else if (field === 'meta.name'    && index != null) workingPage.customMeta[Number(index)].name    = value
  else if (field === 'meta.content' && index != null) workingPage.customMeta[Number(index)].content = value
}

function handleAction(action, arg) {
  switch (action) {
    case 'close':
    case 'cancel':
      close(); return
    case 'save':
      saveAndClose(); return
    case 'set-project-favicon':
      workingMeta.favicon = arg
      paint(); return
    case 'clear-project-favicon':
      workingMeta.favicon = ''
      paint(); return
    case 'meta-add':
      workingPage.customMeta.push({ name: '', content: '' })
      paint(); return
    case 'meta-remove':
      workingPage.customMeta.splice(Number(arg), 1)
      paint(); return
  }
}

function saveAndClose() {
  const tab = pageState.active()
  const page = projectState.current.pages.find(p => p.name === tab.pageName)
  if (!page) { close(); return }
  if (!page.head) page.head = {}
  page.head.title       = workingPage.title
  page.head.description = workingPage.description
  page.head.customMeta  = workingPage.customMeta.filter(m => m.name && m.content)
  if (workingPage.favicon) page.head.favicon = workingPage.favicon
  else delete page.head.favicon

  if (!projectState.current.manifest.metadata) projectState.current.manifest.metadata = {}
  projectState.current.manifest.metadata.favicon = workingMeta.favicon || undefined
  if (!workingMeta.favicon) delete projectState.current.manifest.metadata.favicon

  projectState.markPageDirty(page.name)
  eventBus.emit('project:dirty-changed')
  eventBus.emit('toast', { type: 'success', message: 'Page properties updated. Save the project to persist.' })
  close()
}

function escAttr(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;') }
function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]) }
