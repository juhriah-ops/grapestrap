// =============================================================
// PATH: src/renderer/dialogs/new-project.js
// ROLE: New Project dialog — name + starter select + per-page checklist,
//       replacing the bare showTextPrompt in menu-router cmdNewProject.
//       Mirrors new-page.js (same overlay/card/keyboard contract, data-npr-*
//       state hooks) and shares the select markup via
//       dialogs/template-select.js. Starter list arrives from main (IPC
//       project:starters) via the caller, each entry carrying {id, label,
//       pages:[{name,title,description}]}; "Blank" is prepended here exactly
//       like New Page prepends "None". Name validation is minimal
//       (non-empty) — main slugs the folder name exactly as it always has
//       for showTextPrompt input.
// DEPENDS: dialogs (gstrap-modals layer, prompt CSS classes),
//          ./template-select.js, i18n.js
// CREATED: 2026-07-12 (Wave 4)
// UPDATED: 2026-08-11 — per-page checklist under the starter select. A
//          starter with 2+ pages reveals a checkbox list (all checked by
//          default, select-all toggle) that narrows project:new's
//          selectedPages; single-page starters (landing/portfolio) and Blank
//          render exactly as before — no checklist ever appears for them.
// =============================================================

import { t } from '../i18n.js'
import { templateSelectHtml } from './template-select.js'

let activeDialog = null

// A starter needs at least this many pages before the checklist is worth
// showing — a 1-page starter (landing, portfolio) has nothing to narrow.
const MIN_PAGES_FOR_CHECKLIST = 2

/**
 * showNewProjectDialog({ starters }) → Promise<
 *   { name, templateId, selectedPages?: string[] } | null >
 *   - starters: [{ id, label, pages:[{name,title,description}] }] from
 *     window.grapestrap.project.starters(). Empty/missing list degrades to a
 *     Blank-only select (fail-open).
 *   - templateId is 'blank' when the user keeps the default first option.
 *   - selectedPages is the checked page-name list, but ONLY when the
 *     checklist was visible (the chosen starter has 2+ pages) — omitted
 *     otherwise so callers can forward it straight through to
 *     project:new's fail-open selectedPages contract unchanged.
 * Resolves null on Esc / Cancel / backdrop click.
 */
export function showNewProjectDialog({ starters = [] } = {}) {
  if (activeDialog) activeDialog.dismiss(null)

  const host = document.getElementById('gstrap-modals')
  if (!host) return Promise.resolve(null)

  const startersById = new Map(starters.map(s => [s.id, s]))
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
        <div class="gstrap-prompt-checklist" data-npr-pages hidden></div>
        <div class="gstrap-prompt-error" data-npr-error hidden></div>
        <div class="gstrap-prompt-actions">
          <button class="gstrap-btn"                    data-npr-cancel>${escHtml(t('dialog.new-project.cancel'))}</button>
          <button class="gstrap-btn gstrap-btn-primary" data-npr-ok>${escHtml(t('dialog.new-project.create'))}</button>
        </div>
      </div>
    `
    host.appendChild(overlay)
    const input    = overlay.querySelector('[data-npr-name]')
    const select   = overlay.querySelector('[data-npr-starter]')
    const pagesBox = overlay.querySelector('[data-npr-pages]')
    const errorEl  = overlay.querySelector('[data-npr-error]')
    input.focus()
    input.select()

    // Rebuilds the checklist for whatever starter is currently selected.
    // Blank / a 1-page starter / an id missing from startersById (fail-open,
    // shouldn't happen since the select only offers what starters lists)
    // all resolve to "no checklist" — hide and empty it so a leftover list
    // from a previous selection can never linger into project:new.
    function syncChecklist() {
      const entry = startersById.get(select.value)
      if (!entry || (entry.pages || []).length < MIN_PAGES_FOR_CHECKLIST) {
        pagesBox.hidden = true
        pagesBox.innerHTML = ''
        return
      }
      pagesBox.innerHTML = checklistInnerHtml(entry)
      pagesBox.hidden = false
    }

    // Single delegated listener survives every syncChecklist() innerHTML
    // rebuild (it's bound to the container, not its children) — the
    // select-all box sets the whole group; any item box re-derives
    // select-all's checked state from whether every item is checked.
    pagesBox.addEventListener('change', evt => {
      errorEl.hidden = true
      if (evt.target.matches('[data-npr-pages-all]')) {
        const checked = evt.target.checked
        pagesBox.querySelectorAll('[data-npr-page]').forEach(cb => { cb.checked = checked })
        return
      }
      if (evt.target.matches('[data-npr-page]')) {
        const boxes = [...pagesBox.querySelectorAll('[data-npr-page]')]
        const allBox = pagesBox.querySelector('[data-npr-pages-all]')
        allBox.checked = boxes.every(cb => cb.checked)
      }
    })

    select.addEventListener('change', syncChecklist)

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
      let selectedPages
      if (!pagesBox.hidden) {
        selectedPages = [...pagesBox.querySelectorAll('[data-npr-page]:checked')]
          .map(cb => cb.dataset.nprPage)
        if (selectedPages.length === 0) {
          errorEl.textContent = t('dialog.new-project.pages-required')
          errorEl.hidden = false
          return
        }
      }
      dismiss({ name, templateId: select.value || 'blank', selectedPages })
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

/** Header row (select-all + section label) + one checklist-item row per page,
 *  all checked by default — narrowing is an opt-out action, not opt-in. */
function checklistInnerHtml(entry) {
  const items = (entry.pages || []).map(p => `
      <label class="gstrap-prompt-checklist-item">
        <input type="checkbox" data-npr-page="${escAttr(p.name)}" checked>
        ${escHtml(t(`starter.${entry.id}.page.${p.name}`, { defaultValue: p.title }))}
      </label>`).join('')
  return `
      <div class="gstrap-prompt-checklist-toggle">
        <span class="gstrap-prompt-label">${escHtml(t('dialog.new-project.pages-label'))}</span>
        <label>
          <input type="checkbox" data-npr-pages-all checked>
          ${escHtml(t('dialog.new-project.pages-select-all'))}
        </label>
      </div>${items}`
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
function escAttr(s) { return escHtml(s) }
