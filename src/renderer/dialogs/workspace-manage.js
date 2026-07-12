/**
 * GrapeStrap — Workspace layouts: Manage dialog
 *
 * PATH: src/renderer/dialogs/workspace-manage.js
 * ROLE: List saved workspace layouts with per-row Apply / Rename / Delete.
 *       Pure UI — clones the welcome/recovery modal pattern
 *       (.gstrap-modal-overlay + [data-*] action hooks in #gstrap-modals);
 *       every operation is a caller-supplied callback so this stays a dumb
 *       collector (house pattern: new-page.js) and never imports workspaces.js
 *       (which imports THIS module — callbacks break the cycle).
 * DEPENDS: i18n.js (all strings via t() — Wave-1-onward rule)
 * CREATED: 2026-07-12
 *
 * showWorkspaceManageDialog({ getNames, onApply, onRename, onDelete })
 *   - getNames:  () → string[] — re-read after every mutation so the list
 *                tracks the caller's cache
 *   - onApply:   (name) → Promise — dialog closes after a successful apply
 *                so the user sees the result
 *   - onRename:  (name) → Promise<string|null> — caller owns the prompt +
 *                validation; non-null means renamed
 *   - onDelete:  (name) → Promise
 * Resolves (void) on Close / Escape. Row buttons carry their target name in
 * data-ws-* attributes (state in data-*, purpose-named classes only).
 */

import { t } from '../i18n.js'

export function showWorkspaceManageDialog({
  getNames = () => [],
  onApply = async () => {},
  onRename = async () => null,
  onDelete = async () => {}
} = {}) {
  const host = document.getElementById('gstrap-modals') || document.body

  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'gstrap-modal-overlay'
    host.appendChild(overlay)

    function paint() {
      const names = getNames()
      overlay.innerHTML = `
        <div class="gstrap-modal" role="dialog" aria-labelledby="ws-manage-title">
          <h2 id="ws-manage-title">${esc(t('workspace.dialog.manage-title'))}</h2>
          ${names.length === 0
            ? `<p class="gstrap-ws-empty">${esc(t('workspace.dialog.manage-empty'))}</p>`
            : `<ul class="gstrap-ws-list">
                ${names.map(name => `
                  <li class="gstrap-ws-row">
                    <span class="gstrap-ws-name" title="${esc(name)}">${esc(name)}</span>
                    <span class="gstrap-ws-actions">
                      <button class="gstrap-btn" data-ws-apply="${esc(name)}">${esc(t('workspace.dialog.manage-apply'))}</button>
                      <button class="gstrap-btn" data-ws-rename="${esc(name)}">${esc(t('workspace.dialog.manage-rename'))}</button>
                      <button class="gstrap-btn" data-ws-delete="${esc(name)}">${esc(t('workspace.dialog.manage-delete'))}</button>
                    </span>
                  </li>
                `).join('')}
              </ul>`}
          <div class="gstrap-modal-actions">
            <button class="gstrap-btn gstrap-btn-primary" data-ws-close>${esc(t('workspace.dialog.manage-close'))}</button>
          </div>
        </div>
      `
    }

    function close() {
      overlay.remove()
      document.removeEventListener('keydown', onKeydown)
      resolve()
    }

    function onKeydown(evt) {
      if (evt.key === 'Escape') { evt.preventDefault(); close() }
    }
    document.addEventListener('keydown', onKeydown)

    overlay.addEventListener('click', async evt => {
      if (evt.target.closest('[data-ws-close]')) return close()

      const applyBtn = evt.target.closest('[data-ws-apply]')
      if (applyBtn) {
        const res = await onApply(applyBtn.dataset.wsApply)
        // Close on success so the applied layout is immediately visible;
        // fail-open errors already toasted by the caller — keep the list up.
        if (res?.ok !== false) close()
        return
      }

      const renameBtn = evt.target.closest('[data-ws-rename]')
      if (renameBtn) {
        await onRename(renameBtn.dataset.wsRename)
        paint()   // repaint whether renamed or cancelled — cheap + always true
        return
      }

      const deleteBtn = evt.target.closest('[data-ws-delete]')
      if (deleteBtn) {
        await onDelete(deleteBtn.dataset.wsDelete)
        paint()
      }
    })

    paint()
  })
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}
