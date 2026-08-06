/**
 * GrapeStrap — Project Settings dialog
 *
 * Modal triggered by File → Project Settings. Single pane:
 *
 *   - **Project name** — editable display name (manifest.metadata.name).
 *     Shown in the status bar, recent-projects list, and window chrome.
 *     Deliberately does NOT rename the .gstrap manifest file or the project
 *     directory on disk — that's a file operation the user does in their
 *     file manager; the display name is presentation-only.
 *
 *   - **Info** — read-only facts about the open project: manifest path,
 *     project directory, global stylesheet path, created / last-saved
 *     timestamps, and page/template/library counts.
 *
 * The manifest's exportMinify / exportBundleBootstrap / exportIncludeComments
 * preferences are intentionally NOT surfaced yet: nothing consumes them at
 * export time, and showing dead switches would be worse than showing none.
 * Surface them here once the exporter honours them.
 *
 * Save commits into projectState + markManifestDirty(); the next Ctrl+S
 * persists. Same overlay/commit pattern as page-properties.js.
 */

import { eventBus } from '../state/event-bus.js'
import { projectState } from '../state/project-state.js'
import { t } from '../i18n.js'

let overlay = null
let workingName = ''

export function openProjectSettingsDialog() {
  if (overlay) return
  if (!projectState.current) {
    eventBus.emit('toast', { type: 'warning', message: t('toast.open-project-first') })
    return
  }
  workingName = projectState.current.manifest?.metadata?.name || ''

  const host = document.getElementById('gstrap-modals')
  if (!host) return
  overlay = document.createElement('div')
  overlay.className = 'gstrap-prefs-overlay'
  host.appendChild(overlay)
  paint()

  overlay.addEventListener('click', evt => {
    if (evt.target === overlay) close()
    const action = evt.target.closest('[data-ps-action]')
    if (action) handleAction(action.dataset.psAction)
  })
  overlay.addEventListener('input', evt => {
    const field = evt.target.closest('[data-ps-field]')
    if (field?.dataset.psField === 'name') workingName = field.value
  })
  document.addEventListener('keydown', onKeyDown, true)
}

function close() {
  if (!overlay) return
  document.removeEventListener('keydown', onKeyDown, true)
  overlay.parentNode?.removeChild(overlay)
  overlay = null
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
  const p = projectState.current
  const meta = p.manifest?.metadata || {}
  const infoRows = [
    ['ps.info.manifest',    p.manifestPath || ''],
    ['ps.info.project-dir', p.projectDir || ''],
    ['ps.info.global-css',  p.manifest?.globalCSS || ''],
    ['ps.info.created',     fmtDate(meta.created)],
    ['ps.info.last-saved',  fmtDate(meta.lastSavedAt)],
    ['ps.info.contents',    t('ps.info.contents-value', {
      pages: (p.pages || []).length,
      templates: (p.templates || []).length,
      library: (p.libraryItems || []).length
    })]
  ]
  overlay.innerHTML = `
    <div class="gstrap-prefs-card gstrap-ps-card" role="dialog" aria-modal="true">
      <div class="gstrap-prefs-header">
        <span class="gstrap-prefs-title">${escHtml(t('ps.title'))}</span>
        <button class="gstrap-prefs-close" data-ps-action="close" title="${escAttr(t('action.close'))}">✕</button>
      </div>
      <div class="gstrap-prefs-body gstrap-ps-body">
        <div class="gstrap-pp-row">
          <label class="gstrap-pp-label">${escHtml(t('ps.name'))}</label>
          <input type="text" class="gstrap-pp-input" data-ps-field="name"
                 value="${escAttr(workingName)}">
          <span class="gstrap-pp-hint">${escHtml(t('ps.name-hint'))}</span>
        </div>
        <div class="gstrap-pp-row">
          <label class="gstrap-pp-label">${escHtml(t('ps.info'))}</label>
          <table class="gstrap-ps-info">
            <tbody>
              ${infoRows.map(([key, value]) => `
                <tr>
                  <th>${escHtml(t(key))}</th>
                  <td><code>${escHtml(value)}</code></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="gstrap-pp-footer">
        <button class="gstrap-prefs-btn" data-ps-action="cancel">${escHtml(t('action.cancel'))}</button>
        <button class="gstrap-prefs-btn gstrap-pp-primary" data-ps-action="save">${escHtml(t('action.save'))}</button>
      </div>
    </div>
  `
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleString()
}

function handleAction(action) {
  switch (action) {
    case 'close':
    case 'cancel':
      close(); return
    case 'save':
      saveAndClose(); return
  }
}

function saveAndClose() {
  const name = workingName.trim()
  if (!name) {
    eventBus.emit('toast', { type: 'warning', message: t('ps.toast.name-required') })
    return
  }
  if (!projectState.current.manifest.metadata) projectState.current.manifest.metadata = {}
  projectState.current.manifest.metadata.name = name
  // markManifestDirty emits project:dirty-changed, which repaints the status
  // bar — the visible home of the project name — with the new value.
  projectState.markManifestDirty()
  eventBus.emit('toast', { type: 'success', message: t('ps.toast.updated') })
  close()
}

function escAttr(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;') }
function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]) }
