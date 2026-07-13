// =============================================================
// PATH: src/renderer/dialogs/new-project.js
// ROLE: New Project dialog — name + starter select, replacing the bare
//       showTextPrompt in menu-router cmdNewProject. Mirrors new-page.js
//       (same overlay/card/keyboard contract, data-npr-* state hooks) and
//       shares the select markup via dialogs/template-select.js. Starter
//       list arrives from main (IPC project:starters) via the caller;
//       "Blank" is prepended here exactly like New Page prepends "None".
//       Name validation is minimal (non-empty) — main slugs the folder name
//       exactly as it always has for showTextPrompt input.
// DEPENDS: dialogs (gstrap-modals layer, prompt CSS classes),
//          ./template-select.js, i18n.js
// CREATED: 2026-07-12 (Wave 4)
// =============================================================

import { t } from '../i18n.js'
import { templateSelectHtml } from './template-select.js'

let activeDialog = null

/**
 * showNewProjectDialog({ starters }) → Promise<{ name, templateId } | null>
 *   - starters: [{ id, label }] from window.grapestrap.project.starters().
 *     Empty/missing list degrades to a Blank-only select (fail-open).
 *   - templateId is 'blank' when the user keeps the default first option.
 * Resolves null on Esc / Cancel / backdrop click.
 */
export function showNewProjectDialog({ starters = [] } = {}) {
  if (activeDialog) activeDialog.dismiss(null)

  const host = document.getElementById('gstrap-modals')
  if (!host) return Promise.resolve(null)

  const options = starters.map(s => ({
    value: s.id,
    // UI strings go through t(); registry label is the fallback so an
    // unregistered starter id still renders something sensible.
    label: t(`starter.${s.id}.label`, { defaultValue: s.label })
  }))

  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'gstrap-prompt-overlay'
    overlay.innerHTML = `
      <div class="gstrap-prompt-card" role="dialog" aria-modal="true">
        <div class="gstrap-prompt-title">${escHtml(t('dialog.new-project.title'))}</div>
        <label class="gstrap-prompt-label">${escHtml(t('dialog.new-project.name-label'))}</label>
        <input class="gstrap-prompt-input" type="text" data-npr-name
               spellcheck="false" autocomplete="off"
               value="My Project" placeholder="${escAttr(t('dialog.new-project.name-placeholder'))}">
        ${templateSelectHtml({
          labelText: t('dialog.new-project.starter-label'),
          noneText:  t('dialog.new-project.starter-blank'),
          noneValue: 'blank',
          options,
          dataAttr:  'data-npr-starter'
        })}
        <div class="gstrap-prompt-error" data-npr-error hidden></div>
        <div class="gstrap-prompt-actions">
          <button class="gstrap-btn"                    data-npr-cancel>${escHtml(t('dialog.new-project.cancel'))}</button>
          <button class="gstrap-btn gstrap-btn-primary" data-npr-ok>${escHtml(t('dialog.new-project.create'))}</button>
        </div>
      </div>
    `
    host.appendChild(overlay)
    const input   = overlay.querySelector('[data-npr-name]')
    const select  = overlay.querySelector('[data-npr-starter]')
    const errorEl = overlay.querySelector('[data-npr-error]')
    input.focus()
    input.select()

    function dismiss(value) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
      activeDialog = null
      resolve(value)
    }

    function submit() {
      const name = input.value.trim()
      if (!name) {
        errorEl.textContent = t('dialog.new-project.name-required')
        errorEl.hidden = false
        input.focus()
        return
      }
      dismiss({ name, templateId: select.value || 'blank' })
    }

    // Typing again clears the stale error.
    input.addEventListener('input', () => { errorEl.hidden = true })

    overlay.addEventListener('click', evt => {
      if (evt.target === overlay) return dismiss(null)
      if (evt.target.closest('[data-npr-cancel]')) return dismiss(null)
      if (evt.target.closest('[data-npr-ok]')) return submit()
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
