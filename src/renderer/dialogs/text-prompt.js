/**
 * GrapeStrap — Text prompt dialog
 *
 * Replacement for `window.prompt()`, which is blocked in modern Electron
 * ("prompt() is and will not be supported.") and was the silent reason
 * File → New Project and File → New Page did nothing for the user. This
 * dialog covers the same ergonomics (label + initial value + OK/Cancel)
 * but renders into the gstrap-modals layer so it actually shows up.
 *
 * Returns a Promise<string | null>. Resolves null on Esc / Cancel /
 * backdrop click; resolves the trimmed input on Enter / OK.
 *
 * Optional `validate: (value) => string | null` (Wave 3, workspace save/
 * rename): a returned message blocks submission and renders in an inline
 * error line (same .gstrap-prompt-error contract as the new-page dialog);
 * null accepts. Callers that don't pass it get the original behavior.
 */

import { t } from '../i18n.js'

let activeDialog = null

export function showTextPrompt({ title = t('prompt.default-title'), label = '', initialValue = '', placeholder = '', okLabel = t('prompt.default-ok'), validate = null } = {}) {
  if (activeDialog) activeDialog.dismiss(null)

  const host = document.getElementById('gstrap-modals')
  if (!host) return Promise.resolve(null)

  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'gstrap-prompt-overlay'
    overlay.innerHTML = `
      <div class="gstrap-prompt-card" role="dialog" aria-modal="true">
        <div class="gstrap-prompt-title">${escHtml(title)}</div>
        ${label ? `<label class="gstrap-prompt-label">${escHtml(label)}</label>` : ''}
        <input class="gstrap-prompt-input" type="text"
               spellcheck="false" autocomplete="off"
               value="${escAttr(initialValue)}"
               placeholder="${escAttr(placeholder)}">
        <div class="gstrap-prompt-error" data-prompt-error hidden></div>
        <div class="gstrap-prompt-actions">
          <button class="gstrap-btn"               data-action="cancel">Cancel</button>
          <button class="gstrap-btn gstrap-btn-primary" data-action="ok">${escHtml(okLabel)}</button>
        </div>
      </div>
    `
    host.appendChild(overlay)
    const input = overlay.querySelector('.gstrap-prompt-input')
    const errorEl = overlay.querySelector('[data-prompt-error]')
    input.focus()
    input.select()

    function dismiss(value) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
      activeDialog = null
      resolve(value)
    }

    function submit() {
      const value = input.value.trim() || null
      if (value !== null && typeof validate === 'function') {
        const problem = validate(value)
        if (problem) {
          errorEl.textContent = problem
          errorEl.hidden = false
          input.focus()
          return
        }
      }
      dismiss(value)
    }

    // Typing again clears the stale error (same contract as new-page.js).
    input.addEventListener('input', () => { errorEl.hidden = true })

    overlay.addEventListener('click', evt => {
      if (evt.target === overlay) return dismiss(null)
      const action = evt.target.closest('[data-action]')?.dataset?.action
      if (action === 'cancel') dismiss(null)
      else if (action === 'ok') submit()
    })
    input.addEventListener('keydown', evt => {
      if (evt.key === 'Escape') { evt.preventDefault(); dismiss(null) }
      else if (evt.key === 'Enter') { evt.preventDefault(); submit() }
    })

    activeDialog = { dismiss }
  })
}

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
function escAttr(s) { return escHtml(s) }
