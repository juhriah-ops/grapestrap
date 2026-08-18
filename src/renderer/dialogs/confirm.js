// =============================================================
// PATH: src/renderer/dialogs/confirm.js
// ROLE: Generic yes/no confirmation modal — title + message + OK/Cancel,
//       resolving a boolean. First consumer is the Bootstrap-version compat
//       gate (editor/insert-section.js, panels/library-items/index.js), which
//       needs a real "insert anyway / cancel" prompt rather than the blocked
//       window.confirm() (see plugin-host/trust-prompt.js's still-open
//       "v0.0.2 swaps in a real dialog" comment — this discharges that
//       promise for any future caller that wants it; not adopted there this
//       round, per the plan's explicit "note only, don't touch it").
// DEPENDS: i18n.js, styles/modals.css (.gstrap-prompt-* shell, shared with
//          dialogs/text-prompt.js and dialogs/edit-link.js)
// CREATED: 2026-08-18
//
// Modeled on dialogs/text-prompt.js / dialogs/edit-link.js: one active
// dialog at a time, resolves a Promise, Esc / Cancel / backdrop click
// resolve false, Enter / OK resolve true. Unlike those two, there is no
// input to type into, so Esc/Enter are handled at the overlay level (not
// scoped to one field) and a small focus trap keeps Tab cycling between the
// two buttons instead of escaping to whatever sits behind the overlay.
// =============================================================

import { t } from '../i18n.js'

let activeDialog = null

/**
 * Open a yes/no confirmation dialog.
 *
 * @param {object} opts
 * @param {string} [opts.title] - Dialog title. Defaults to a generic label.
 * @param {string} opts.message - Body text explaining what's being confirmed.
 * @param {string} [opts.okLabel] - Defaults to a generic "OK".
 * @param {string} [opts.cancelLabel] - Defaults to the shared Cancel label.
 * @returns {Promise<boolean>} true on OK / Enter; false on Cancel / Esc /
 *          backdrop click. Resolves false immediately when the modal host
 *          is missing (renderer mid-teardown), never throws.
 */
export function showConfirm({
  title = t('confirm.default-title'),
  message = '',
  okLabel = t('confirm.default-ok'),
  cancelLabel = t('action.cancel')
} = {}) {
  if (activeDialog) activeDialog.dismiss(false)

  const host = document.getElementById('gstrap-modals')
  if (!host) return Promise.resolve(false)

  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'gstrap-prompt-overlay'
    overlay.innerHTML = `
      <div class="gstrap-prompt-card" role="alertdialog" aria-modal="true">
        <div class="gstrap-prompt-title">${escHtml(title)}</div>
        <p class="gstrap-prompt-message">${escHtml(message)}</p>
        <div class="gstrap-prompt-actions">
          <button class="gstrap-btn"                    data-confirm-cancel>${escHtml(cancelLabel)}</button>
          <button class="gstrap-btn gstrap-btn-primary" data-confirm-ok>${escHtml(okLabel)}</button>
        </div>
      </div>
    `
    host.appendChild(overlay)
    const cancelBtn = overlay.querySelector('[data-confirm-cancel]')
    const okBtn = overlay.querySelector('[data-confirm-ok]')
    // OK is the primed action (Enter triggers it too), so it gets initial
    // focus — same convention as a native confirm dialog's default button.
    okBtn.focus()

    function dismiss(value) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
      activeDialog = null
      resolve(value)
    }

    overlay.addEventListener('click', evt => {
      if (evt.target === overlay) return dismiss(false)
      if (evt.target.closest('[data-confirm-cancel]')) return dismiss(false)
      if (evt.target.closest('[data-confirm-ok]')) return dismiss(true)
    })
    overlay.addEventListener('keydown', evt => {
      if (evt.key === 'Escape') { evt.preventDefault(); dismiss(false) }
      else if (evt.key === 'Enter') { evt.preventDefault(); dismiss(true) }
      else if (evt.key === 'Tab') trapFocus(evt, cancelBtn, okBtn)
    })

    activeDialog = { dismiss }
  })
}

/**
 * Keep Tab/Shift+Tab cycling between the two dialog buttons instead of
 * leaving the overlay — there is nothing else in the card to land on.
 *
 * @param {KeyboardEvent} evt
 * @param {HTMLElement} first - First focusable in the card (Cancel)
 * @param {HTMLElement} last - Last focusable in the card (OK)
 * @returns {void}
 */
function trapFocus(evt, first, last) {
  if (evt.shiftKey && document.activeElement === first) {
    evt.preventDefault()
    last.focus()
  } else if (!evt.shiftKey && document.activeElement === last) {
    evt.preventDefault()
    first.focus()
  }
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
