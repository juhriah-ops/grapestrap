/**
 * GrapeStrap — New Page dialog
 *
 * PATH: src/renderer/dialogs/new-page.js
 * ROLE: Name + template-select dialog replacing the bare showTextPrompt in
 *       menu-router cmdNewPage. Validates inline (duplicate names — Wave 0
 *       bug #6 — and unsafe charsets) so invalid input never reaches
 *       projectState. The template select is shared with the New Project
 *       dialog via template-select.js since Wave 4 (v5 Wave 4 row).
 * DEPENDS: dialogs (gstrap-modals layer, prompt CSS classes),
 *          ./template-select.js, i18n.js
 * CREATED: 2026-07-12
 *
 * showNewPageDialog({ templates, validateName }) → Promise<
 *   { name, templateName } | null >
 *   - templates:    [{ name }] — populates the select below a "None" option
 *   - validateName: (name) → string | null — a message blocks submission and
 *     renders in the dialog's error line; null accepts. The caller owns the
 *     rules (menu-router passes templates/manage.js validateNewName) so this
 *     dialog stays a dumb collector like text-prompt.js.
 *
 * Resolves null on Esc / Cancel / backdrop click. Reuses the gstrap-prompt-*
 * styling classes; the two new hooks (data-np-*) carry state per house rules
 * (state in data-* attributes, purpose-named classes only).
 */

import { t } from '../i18n.js'
import { templateSelectHtml } from './template-select.js'

let activeDialog = null

export function showNewPageDialog({ templates = [], validateName = () => null } = {}) {
  if (activeDialog) activeDialog.dismiss(null)

  const host = document.getElementById('gstrap-modals')
  if (!host) return Promise.resolve(null)

  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'gstrap-prompt-overlay'
    overlay.innerHTML = `
      <div class="gstrap-prompt-card" role="dialog" aria-modal="true">
        <div class="gstrap-prompt-title">${escHtml(t('dialog.new-page.title'))}</div>
        <label class="gstrap-prompt-label">${escHtml(t('dialog.new-page.name-label'))}</label>
        <input class="gstrap-prompt-input" type="text" data-np-name
               spellcheck="false" autocomplete="off"
               value="about" placeholder="${escAttr(t('dialog.new-page.name-placeholder'))}">
        ${templateSelectHtml({
          labelText: t('dialog.new-page.template-label'),
          noneText:  t('dialog.new-page.template-none'),
          options:   templates.map(tp => ({ value: tp.name, label: tp.name })),
          dataAttr:  'data-np-template'
        })}
        <div class="gstrap-prompt-error" data-np-error hidden></div>
        <div class="gstrap-prompt-actions">
          <button class="gstrap-btn"                    data-np-cancel>${escHtml(t('dialog.new-page.cancel'))}</button>
          <button class="gstrap-btn gstrap-btn-primary" data-np-ok>${escHtml(t('dialog.new-page.create'))}</button>
        </div>
      </div>
    `
    host.appendChild(overlay)
    const input    = overlay.querySelector('[data-np-name]')
    const select   = overlay.querySelector('[data-np-template]')
    const errorEl  = overlay.querySelector('[data-np-error]')
    input.focus()
    input.select()

    function dismiss(value) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
      activeDialog = null
      resolve(value)
    }

    function submit() {
      const name = input.value.trim()
      const problem = name ? validateName(name) : t('dialog.new-page.name-required')
      if (problem) {
        errorEl.textContent = problem
        errorEl.hidden = false
        input.focus()
        return
      }
      dismiss({ name, templateName: select.value || null })
    }

    // Typing again clears the stale error.
    input.addEventListener('input', () => { errorEl.hidden = true })

    overlay.addEventListener('click', evt => {
      if (evt.target === overlay) return dismiss(null)
      if (evt.target.closest('[data-np-cancel]')) return dismiss(null)
      if (evt.target.closest('[data-np-ok]')) return submit()
    })
    overlay.addEventListener('keydown', evt => {
      if (evt.key === 'Escape') { evt.preventDefault(); dismiss(null) }
      else if (evt.key === 'Enter' && evt.target !== select) { evt.preventDefault(); submit() }
    })

    activeDialog = { dismiss }
  })
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
function escAttr(s) { return escHtml(s) }
