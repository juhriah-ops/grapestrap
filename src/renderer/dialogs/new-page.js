/**
 * GrapeStrap — New Page dialog
 *
 * PATH: src/renderer/dialogs/new-page.js
 * ROLE: Name + source-select dialog replacing the bare showTextPrompt in
 *       menu-router cmdNewPage. Validates inline (duplicate names — Wave 0
 *       bug #6 — and unsafe charsets) so invalid input never reaches
 *       projectState. The select is shared with the New Project dialog via
 *       template-select.js since Wave 4 (v5 Wave 4 row).
 * DEPENDS: dialogs (gstrap-modals layer, prompt CSS classes),
 *          ./template-select.js, i18n.js
 * CREATED: 2026-07-12
 * UPDATED: 2026-08-11 — starter-aware grouped select. When the calling
 *          project was created from a multi-page starter, the select grows
 *          two <optgroup>s (starter layouts, master templates) instead of
 *          the flat template list; the "layout:"/"tpl:" value prefixes tell
 *          submit() which of the three page sources the user picked.
 *          `starter: null` (blank/imported projects, or template/main-side
 *          lookup miss) renders EXACTLY the prior flat markup — byte-stable
 *          for the pre-existing e2e pin.
 *
 * showNewPageDialog({ templates, starter, validateName }) → Promise<
 *   { name, source: { kind: 'blank' }
 *            | { kind: 'template', templateName: string }
 *            | { kind: 'starter-layout', pageName: string } } | null >
 *   - templates:    [{ name }] — populates the select below "None" (and,
 *                   with a starter, below its layouts group too)
 *   - starter:      the enriched { id, label, pages } starter entry the
 *                   open project was created from, or null/undefined for a
 *                   blank/imported project (or a lookup miss upstream) —
 *                   falls back to the flat markup either way
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

// NAME_RE in panels/templates/manage.js (/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
// forbids ':' in page/template names, so these prefixes can never collide
// with a real template name reaching the flat (starter-null) branch below.
const LAYOUT_PREFIX = 'layout:'
const TEMPLATE_PREFIX = 'tpl:'

export function showNewPageDialog({ templates = [], starter = null, validateName = () => null } = {}) {
  if (activeDialog) activeDialog.dismiss(null)

  const host = document.getElementById('gstrap-modals')
  if (!host) return Promise.resolve(null)

  const hasStarterPages = !!starter?.pages?.length
  const selectHtml = hasStarterPages
    ? templateSelectHtml({
        labelText: t('dialog.new-page.template-label'),
        noneText:  t('dialog.new-page.template-none'),
        options:   [],
        groups:    buildGroups(starter, templates),
        dataAttr:  'data-np-template'
      })
    // Starter-less path: identical call/markup to before this dialog learned
    // about starters — the e2e "blank project → NO optgroups" pin depends on
    // this staying byte-for-byte what it was.
    : templateSelectHtml({
        labelText: t('dialog.new-page.template-label'),
        noneText:  t('dialog.new-page.template-none'),
        options:   templates.map(tp => ({ value: tp.name, label: tp.name })),
        dataAttr:  'data-np-template'
      })

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
        ${selectHtml}
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

    // Nice-touch prefill: picking a layout while the name field still holds
    // its untouched "about" default renames it to the layout's page name —
    // but only if that name is actually free (validateName), and only until
    // the user types for themselves. Programmatic `.value =` writes below
    // never fire 'input', so this can keep re-prefilling across repeated
    // layout picks right up until a real keystroke happens.
    let nameTouched = false

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
      dismiss({ name, source: parseSource(select.value) })
    }

    // Typing again clears the stale error and stops future auto-prefill.
    input.addEventListener('input', () => {
      errorEl.hidden = true
      nameTouched = true
    })

    if (hasStarterPages) {
      select.addEventListener('change', () => {
        if (nameTouched) return
        if (!select.value.startsWith(LAYOUT_PREFIX)) return
        const pageName = select.value.slice(LAYOUT_PREFIX.length)
        if (validateName(pageName) === null) input.value = pageName
      })
    }

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

/**
 * Build the <optgroup> list for a starter-aware select: the starter's own
 * layouts first, then master templates (only when the project has any).
 * Layout option values carry LAYOUT_PREFIX, template option values carry
 * TEMPLATE_PREFIX — parseSource() below reverses this.
 */
function buildGroups(starter, templates) {
  const groups = [{
    label: t('dialog.new-page.group-starter', {
      label: t(`starter.${starter.id}.label`, { defaultValue: starter.label })
    }),
    options: starter.pages.map(p => ({
      value: LAYOUT_PREFIX + p.name,
      label: t(`starter.${starter.id}.page.${p.name}`, { defaultValue: p.title })
    }))
  }]
  if (templates.length) {
    groups.push({
      label: t('dialog.new-page.group-templates'),
      options: templates.map(tp => ({ value: TEMPLATE_PREFIX + tp.name, label: tp.name }))
    })
  }
  return groups
}

/** Reverse buildGroups()'s value prefixes into the dialog's result shape. */
function parseSource(rawValue) {
  if (!rawValue) return { kind: 'blank' }
  if (rawValue.startsWith(LAYOUT_PREFIX)) {
    return { kind: 'starter-layout', pageName: rawValue.slice(LAYOUT_PREFIX.length) }
  }
  if (rawValue.startsWith(TEMPLATE_PREFIX)) {
    return { kind: 'template', templateName: rawValue.slice(TEMPLATE_PREFIX.length) }
  }
  // Starter-null flat markup: template options carry the bare template name.
  return { kind: 'template', templateName: rawValue }
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
function escAttr(s) { return escHtml(s) }
