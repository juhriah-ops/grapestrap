/**
 * GrapeStrap — Master Templates: management commands
 *
 * PATH: src/renderer/panels/templates/manage.js
 * ROLE: createTemplate / deleteTemplate / createPage (from template or blank)
 *       / detachActivePage / make+remove editable region — every state
 *       mutation the templates feature performs, in one module. UI surfaces
 *       (file-manager section, new-page dialog, context menu) call in here.
 * DEPENDS: state/project-state.js, state/page-state.js, state/event-bus.js,
 *          editor/grapesjs-init.js, dialogs/text-prompt.js, i18n.js,
 *          ./propagate.js, ./lock.js
 * CREATED: 2026-07-12
 *
 * Every entry point validates its input and returns null/false on refusal
 * (with a toast) — callers never need their own guards. Name rules for pages
 * AND templates: /^[A-Za-z0-9][A-Za-z0-9_-]*$/ (also closes the page.file
 * path-traversal the old raw prompt allowed), unique across pages, templates,
 * and library-item ids — tab keys share one namespace (page-state.js matches
 * pageName only; see PLAN.md Known Limitations).
 */

import { projectState } from '../../state/project-state.js'
import { pageState } from '../../state/page-state.js'
import { eventBus } from '../../state/event-bus.js'
import { getEditor, getCanvasHtml } from '../../editor/grapesjs-init.js'
import { showTextPrompt } from '../../dialogs/text-prompt.js'
import { t } from '../../i18n.js'
import {
  REGION_ATTR, REGION_LABEL_ATTR,
  composeFromTemplate, extractRegions, templateRegionsMeta
} from './propagate.js'
import { unlockAll, withUndoPaused, isRegionEl, findRegionId } from './lock.js'

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

// Blank chrome a fresh template starts from — one region, obvious hooks.
const DEFAULT_TEMPLATE_HTML = `<header class="container py-3"><h2>Site header</h2></header>
<main class="container py-5" data-grpstr-region="content"><p>Editable region: content</p></main>
<footer class="container py-3"><p>Site footer</p></footer>
`

function toastWarn(message)  { eventBus.emit('toast', { type: 'warning', message }) }
function toastError(message) { eventBus.emit('toast', { type: 'error',   message }) }

function requireProject() {
  if (!projectState.current) {
    toastWarn(t('tpl.toast.no-project'))
    return false
  }
  return true
}

/**
 * Validate a page/template name against charset + the shared tab-key
 * namespace. Returns null when valid, else a user-facing message. Exported
 * for the New Page dialog's inline validation.
 */
export function validateNewName(name) {
  if (!name || !NAME_RE.test(name)) return t('tpl.error.bad-name')
  const cur = projectState.current
  if (!cur) return t('tpl.toast.no-project')
  if (cur.pages?.some(p => p.name === name))          return t('tpl.error.name-taken-page')
  if (cur.templates?.some(tp => tp.name === name))    return t('tpl.error.name-taken-template')
  if (cur.libraryItems?.some(li => li.id === name))   return t('tpl.error.name-taken-library')
  return null
}

/**
 * Create a template and open it for editing. `html` defaults to the blank
 * starter chrome. Returns the template entry, or null on refusal.
 */
export function createTemplate(name, html = DEFAULT_TEMPLATE_HTML) {
  if (!requireProject()) return null
  const invalid = validateNewName(name)
  if (invalid) { toastError(invalid); return null }
  const tpl = {
    name,
    file: `templates/${name}.gstrap-tpl`,
    html,
    regions: templateRegionsMeta(html)
  }
  const cur = projectState.current
  cur.templates = cur.templates || []
  cur.templates.push(tpl)
  projectState.markTemplateDirty(name)
  eventBus.emit('templates:changed')
  pageState.open(name, { kind: 'template', label: name })
  return tpl
}

/**
 * Delete a template. Refuses while any page references it (mirrors the
 * library-items delete guard) — detach the pages first. True on success.
 */
export function deleteTemplate(name) {
  if (!requireProject()) return false
  const cur = projectState.current
  const i = (cur.templates || []).findIndex(tp => tp.name === name)
  if (i < 0) return false
  const inUse = (cur.pages || []).filter(p => p.templateName === name).length
  if (inUse > 0) {
    toastWarn(t('tpl.toast.in-use', { count: inUse }))
    return false
  }
  cur.templates.splice(i, 1)
  pageState.close(name)                    // close the editor tab if open
  projectState.markTemplateDirty(name)     // manifest entry removal must save
  eventBus.emit('templates:changed')
  return true
  // NOTE: the .gstrap-tpl file stays on disk (save writes, never deletes —
  // same as deleted pages today, Wave 0 finding #1). Export never reads it.
}

/**
 * Create a page — composed from `templateName`'s chrome when given, else the
 * classic blank main. Opens the new tab. Returns the page entry or null.
 * This is the collision-checked replacement for the body of cmdNewPage
 * (Wave 0 bug #6: duplicates used to be accepted).
 */
export function createPage(name, templateName = null) {
  if (!requireProject()) return null
  const invalid = validateNewName(name)
  if (invalid) { toastError(invalid); return null }

  let html, regions = {}
  if (templateName) {
    const tpl = projectState.getTemplate(templateName)
    if (!tpl) { toastError(t('tpl.error.no-such-template', { name: templateName })); return null }
    html = composeFromTemplate(tpl.html || '', {})   // template defaults fill regions
    regions = extractRegions(html).regions
  } else {
    html = `<main class="container py-5"><h1>${escapeHtml(name)}</h1></main>\n`
  }

  const page = {
    name,
    file: `pages/${name}.html`,
    templateName: templateName || null,
    regions,
    head: { title: name, description: '' },
    html
  }
  projectState.current.pages.push(page)
  projectState.markPageDirty(name)
  pageState.open(name)
  eventBus.emit('project:dirty-changed')
  return page
}

/**
 * Detach the ACTIVE page from its template: strip region markers from the
 * live component tree, clear every lock, null the reference. The rendered
 * HTML stays in place as a free copy (v4 §14). True on success.
 *
 * Runs on the live tree (not the html string) because the canvas is already
 * showing this page — mutating components in place avoids a reload flash and
 * keeps selection. Attr strips run inside withUndoPaused so undo can't
 * half-resurrect the attachment (templateName would stay null — inconsistent).
 */
export function detachActivePage() {
  if (!requireProject()) return false
  const tab = pageState.active()
  if (!tab || (tab.kind || 'page') !== 'page') return false
  const page = projectState.getPage(tab.pageName)
  if (!page?.templateName) return false
  const editor = getEditor()
  if (!editor) return false

  withUndoPaused(editor, () => {
    walkAll(editor.getWrapper(), c => {
      const attrs = c.getAttributes?.() || {}
      if (attrs[REGION_ATTR] !== undefined) {
        c.removeAttributes([REGION_ATTR, REGION_LABEL_ATTR])
      }
    })
  })
  // Order matters: null the reference BEFORE unlockAll so any component:add
  // fired by attribute churn can't re-lock through the activeTemplateName gate.
  page.templateName = null
  page.regions = {}
  unlockAll(editor)
  page.html = getCanvasHtml()
  projectState.markPageDirty(page.name)
  eventBus.emit('canvas:content-changed')
  eventBus.emit('toast', { type: 'success', message: t('tpl.toast.detached') })
  return true
}

/**
 * Template-editing mode: mark the selected component as an editable region.
 * Prompts for the id; refuses nesting (selection inside a region OR
 * containing one — F4) and duplicate ids (F5).
 */
export async function makeEditableRegion(component) {
  if (!requireProject() || !component) return false
  const editor = getEditor()
  if (!component.parent?.()) { toastWarn(t('tpl.error.region-on-root')); return false }
  if (findRegionId(component, { includeSelf: true })) {
    toastWarn(t('tpl.error.region-nested'))
    return false
  }
  if (containsRegion(component)) {
    toastWarn(t('tpl.error.region-contains'))
    return false
  }
  const id = await showTextPrompt({
    title: t('tpl.dialog.make-region-title'),
    label: t('tpl.dialog.make-region-label'),
    initialValue: 'content',
    okLabel: t('tpl.dialog.make-region-ok')
  })
  if (!id) return false
  if (!NAME_RE.test(id)) { toastError(t('tpl.error.bad-name')); return false }
  if (regionIdExistsInCanvas(editor, id)) {
    toastError(t('tpl.error.region-duplicate', { id }))
    return false
  }
  component.addAttributes({ [REGION_ATTR]: id })
  eventBus.emit('canvas:content-changed')
  return true
}

/** Template-editing mode: demote a region element back to plain chrome. */
export function removeEditableRegion(component) {
  if (!component || !isRegionEl(component)) return false
  component.removeAttributes([REGION_ATTR, REGION_LABEL_ATTR])
  eventBus.emit('canvas:content-changed')
  return true
}

// ── Helpers ────────────────────────────────────────────────────────────────

function regionIdExistsInCanvas(editor, id) {
  let found = false
  walkAll(editor?.getWrapper?.(), c => {
    if ((c.getAttributes?.() || {})[REGION_ATTR] === id) found = true
  })
  return found
}

function containsRegion(component) {
  let found = false
  const kids = component.components?.() || []
  kids.forEach(k => { walkAll(k, c => { if (isRegionEl(c)) found = true }) })
  return found
}

function walkAll(component, fn) {
  if (!component) return
  fn(component)
  const kids = component.components?.() || []
  kids.forEach(k => walkAll(k, fn))
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
