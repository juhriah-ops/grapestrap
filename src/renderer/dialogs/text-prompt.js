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
 */

let activeDialog = null

export function showTextPrompt({ title = 'Input', label = '', initialValue = '', placeholder = '', okLabel = 'OK' } = {}) {
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
        <div class="gstrap-prompt-actions">
          <button class="gstrap-btn"               data-action="cancel">Cancel</button>
          <button class="gstrap-btn gstrap-btn-primary" data-action="ok">${escHtml(okLabel)}</button>
        </div>
      </div>
    `
    host.appendChild(overlay)
    const input = overlay.querySelector('.gstrap-prompt-input')
    input.focus()
    input.select()

    function dismiss(value) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
      activeDialog = null
      resolve(value)
    }

    overlay.addEventListener('click', evt => {
      if (evt.target === overlay) return dismiss(null)
      const action = evt.target.closest('[data-action]')?.dataset?.action
      if (action === 'cancel') dismiss(null)
      else if (action === 'ok') dismiss(input.value.trim() || null)
    })
    input.addEventListener('keydown', evt => {
      if (evt.key === 'Escape') { evt.preventDefault(); dismiss(null) }
      else if (evt.key === 'Enter') { evt.preventDefault(); dismiss(input.value.trim() || null) }
    })

    activeDialog = { dismiss }
  })
}

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
function escAttr(s) { return escHtml(s) }
