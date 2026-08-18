// =============================================================
// PATH: src/renderer/dialogs/edit-link.js
// ROLE: "Edit Link…" dialog for an <a> element — href, target and rel in one
//       modal, so the three attributes are gathered BEFORE anything touches
//       the model. That ordering is the point: the caller then writes all
//       three synchronously, which magic-fuses them into a single undo entry
//       (see the undo contract in shortcuts/table-actions.js).
// DEPENDS: i18n.js, styles/modals.css (.gstrap-prompt-* shell, shared with
//          dialogs/text-prompt.js and dialogs/new-page.js)
// CREATED: 2026-08-18
//
// Modeled on dialogs/text-prompt.js: one active dialog at a time, resolves a
// Promise, Esc / Cancel / backdrop click resolve null, Enter / OK submit.
// Enter inside the <select> is ignored the same way new-page.js ignores it,
// so keyboard option-picking does not close the dialog by accident.
// =============================================================

import { t } from '../i18n.js'

let activeDialog = null

const TARGET_OPTIONS = ['', '_self', '_blank', '_parent', '_top']

/**
 * Open the link editor.
 *
 * @param {object} [current] - The link's current attributes
 * @param {string} [current.href]
 * @param {string} [current.target]
 * @param {string} [current.rel]
 * @returns {Promise<{href: string, target: string, rel: string}|null>}
 *          Trimmed values on OK; null on cancel. An empty string is a real
 *          answer — it means "remove this attribute" to the caller — so the
 *          dialog never coerces empties to null the way showTextPrompt does.
 *          Resolves null immediately when the modal host is missing (the
 *          renderer is mid-teardown), never throws.
 */
export function showEditLinkDialog({ href = '', target = '', rel = '' } = {}) {
  if (activeDialog) activeDialog.dismiss(null)

  const host = document.getElementById('gstrap-modals')
  if (!host) return Promise.resolve(null)

  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'gstrap-prompt-overlay'
    overlay.innerHTML = `
      <div class="gstrap-prompt-card" role="dialog" aria-modal="true">
        <div class="gstrap-prompt-title">${escHtml(t('link.title'))}</div>
        <label class="gstrap-prompt-label">${escHtml(t('fields.href'))}</label>
        <input class="gstrap-prompt-input" type="text" data-link-href
               spellcheck="false" autocomplete="off"
               value="${escAttr(href)}"
               placeholder="${escAttr(t('link.href-placeholder'))}">
        <label class="gstrap-prompt-label">${escHtml(t('fields.target'))}</label>
        <select class="gstrap-prompt-input" data-link-target>
          ${TARGET_OPTIONS.map(value => `<option value="${escAttr(value)}"${
            value === target ? ' selected' : ''
          }>${escHtml(value || t('fields.target-default'))}</option>`).join('')}
        </select>
        <label class="gstrap-prompt-label">${escHtml(t('fields.rel'))}</label>
        <input class="gstrap-prompt-input" type="text" data-link-rel
               spellcheck="false" autocomplete="off"
               value="${escAttr(rel)}"
               placeholder="${escAttr(t('link.rel-placeholder'))}">
        <div class="gstrap-prompt-actions">
          <button class="gstrap-btn"                    data-link-cancel>${escHtml(t('action.cancel'))}</button>
          <button class="gstrap-btn gstrap-btn-primary" data-link-ok>${escHtml(t('link.ok'))}</button>
        </div>
      </div>
    `
    host.appendChild(overlay)
    const hrefInput   = overlay.querySelector('[data-link-href]')
    const targetInput = overlay.querySelector('[data-link-target]')
    const relInput    = overlay.querySelector('[data-link-rel]')
    hrefInput.focus()
    hrefInput.select()

    function dismiss(value) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
      activeDialog = null
      resolve(value)
    }

    function submit() {
      dismiss({
        href:   hrefInput.value.trim(),
        target: targetInput.value,
        rel:    relInput.value.trim()
      })
    }

    overlay.addEventListener('click', evt => {
      if (evt.target === overlay) return dismiss(null)
      if (evt.target.closest('[data-link-cancel]')) return dismiss(null)
      if (evt.target.closest('[data-link-ok]')) return submit()
    })
    overlay.addEventListener('keydown', evt => {
      if (evt.key === 'Escape') { evt.preventDefault(); dismiss(null) }
      else if (evt.key === 'Enter' && evt.target !== targetInput) { evt.preventDefault(); submit() }
    })

    activeDialog = { dismiss }
  })
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
function escAttr(s) { return escHtml(s) }
