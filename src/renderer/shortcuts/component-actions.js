/**
 * GrapeStrap — Per-component action helpers
 *
 * PATH: src/renderer/shortcuts/component-actions.js
 * ROLE: Single source of truth for "what can the user do to a selected
 *       component." Used by the right-click context menu (canvas iframe +
 *       DOM tree rows, both funneled through the one `canvas:context-menu`
 *       listener in main.js) and by menu actions wired in `menu-router.js`
 *       (Edit > Duplicate, Delete, …). Centralising avoids the bug class
 *       where the menu and the keyboard shortcut fall out of sync (one
 *       duplicates via setComponents, the other via GrapesJS .clone()) —
 *       both paths now go through these functions.
 * DEPENDS: state/event-bus.js, editor/grapesjs-init.js, dialogs/quick-tag.js,
 *          shared/bs-docs.js, i18n.js
 * CREATED: 2026-05-02 (pre-breadcrumb; header added Workstream A chunk A4)
 * UPDATED: 2026-08-11 — added moveComponent/moveComponentToPageTop (chunk A4
 *          reorder affordances) + their context-menu items
 */

import { eventBus } from '../state/event-bus.js'
import { getEditor } from '../editor/grapesjs-init.js'
import { showQuickTagDialog, formatComponentAsQuickTag } from '../dialogs/quick-tag.js'
import { bsDocsForClasses } from '../../shared/bs-docs.js'
import { t } from '../i18n.js'

/**
 * Duplicate a component immediately after itself, select the copy, mark dirty.
 * Returns the new component (or null if duplication isn't possible — e.g. the
 * wrapper / body root, which has no parent and thus no insertion site).
 */
export function duplicateComponent(component) {
  if (!component) return null
  if (component.get?.('copyable') === false) return null   // template chrome / library lock
  const parent = component.parent?.()
  if (!parent) return null
  const idx = parent.components().indexOf(component)
  // GrapesJS .clone() returns a new component that's already attached at the
  // same parent's end — we move it to right after the source.
  const cloned = component.clone()
  if (!cloned) return null
  // .clone() on some GrapesJS versions returns the newly-attached node; on
  // others it returns a detached component we have to add ourselves. Handle
  // both: if the clone is already attached, move it to idx+1; otherwise add.
  const attached = parent.components().includes(cloned)
  if (attached) {
    const wasAt = parent.components().indexOf(cloned)
    if (wasAt !== idx + 1) {
      parent.components().remove(cloned, { silent: true })
      parent.append(cloned, { at: idx + 1 })
    }
  } else {
    parent.append(cloned, { at: idx + 1 })
  }
  const editor = getEditor()
  editor?.select?.(cloned)
  eventBus.emit('canvas:content-changed')
  return cloned
}

export function deleteComponent(component) {
  if (!component) return false
  if (component.get?.('removable') === false) return false  // template chrome / library lock
  const parent = component.parent?.()
  if (!parent) return false  // can't remove the wrapper
  component.remove()
  eventBus.emit('canvas:content-changed')
  return true
}

/**
 * Move a component one position within its current parent's child list.
 *
 * GrapesJS 0.21.13 has no `Component.move()` (verified against
 * node_modules/grapesjs/dist/index.d.ts — the Component class has no `move`
 * member; the only `move(x, y, end)` in the typings belongs to the drag
 * Sorter, an unrelated coordinate-based API) — so this uses the same
 * remove-then-append-at-index pattern duplicateComponent() already proves.
 * Removing `component` first shifts every later sibling's index down by one,
 * which is exactly what makes `idx + delta` (computed BEFORE the removal)
 * the correct post-removal insertion index for both directions — re-inserting
 * there always lands `component` swapped with the sibling that was at
 * `idx + delta`, never further.
 *
 * @param {object} component - GrapesJS component to reorder
 * @param {-1|1} delta - -1 moves up (earlier), +1 moves down (later)
 * @returns {boolean} true if moved; false on a bad delta, a root component,
 *          a locked component (removable === false — template chrome /
 *          library lock, same guard duplicateComponent/deleteComponent use),
 *          or a no-op at the parent's start/end (clamped, not wrapped)
 */
export function moveComponent(component, delta) {
  if (!component) return false
  if (delta !== -1 && delta !== 1) return false
  const parent = component.parent?.()
  if (!parent) return false                                  // can't reorder the wrapper/root
  if (component.get?.('removable') === false) return false    // template chrome / library lock
  const siblings = parent.components()
  const idx = siblings.indexOf(component)
  if (idx === -1) return false
  const targetIdx = idx + delta
  if (targetIdx < 0 || targetIdx >= siblings.length) return false   // clamp at ends — no wrap
  parent.components().remove(component, { silent: true })
  parent.append(component, { at: targetIdx })
  const editor = getEditor()
  editor?.select?.(component)
  eventBus.emit('canvas:content-changed')
  return true
}

/**
 * Reparent a component to the very top of the page (index 0 of the editor
 * wrapper), regardless of how deeply it was nested.
 *
 * @param {object} component - GrapesJS component to move
 * @returns {boolean} true if moved; false on a root component, a locked
 *          component (removable === false), a missing editor/wrapper, a
 *          droppable:false wrapper (a master-template PAGE — the wrapper is
 *          locked while template chrome propagates; see
 *          panels/templates/lock.js's relockTemplateChrome, not modified
 *          here), or a no-op (component is already the wrapper's first child)
 */
export function moveComponentToPageTop(component) {
  if (!component) return false
  const parent = component.parent?.()
  if (!parent) return false                                  // component IS the wrapper
  if (component.get?.('removable') === false) return false    // template chrome / library lock
  const editor = getEditor()
  const wrapper = editor?.getWrapper?.()
  if (!wrapper) return false
  if (wrapper.get?.('droppable') === false) return false       // master-template page — locked root
  if (parent === wrapper && wrapper.components().indexOf(component) === 0) return false  // already at top
  parent.components().remove(component, { silent: true })
  wrapper.append(component, { at: 0 })
  editor.select?.(component)
  eventBus.emit('canvas:content-changed')
  return true
}

export function copyComponentHtml(component) {
  if (!component) return ''
  const html = component.toHTML?.() || ''
  if (html && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(html).catch(() => {})
  }
  return html
}

export async function editComponentTag(component) {
  if (!component) return null
  if (component.get?.('editable') === false) return null    // locked
  const initialText = formatComponentAsQuickTag(component)
  const parsed = await showQuickTagDialog({ initialText, mode: 'edit' })
  if (!parsed) return null
  const innerHTML = component.getInnerHTML?.() || ''
  const newHtml = `<${parsed.tag}${attrsToHtml(parsed.attrs)}>${innerHTML}</${parsed.tag}>`
  const replaced = component.replaceWith(newHtml)
  const next = Array.isArray(replaced) ? replaced[0] : replaced
  if (next) getEditor()?.select?.(next)
  eventBus.emit('canvas:content-changed')
  return next
}

export async function wrapComponentInTag(component) {
  if (!component) return null
  if (component.get?.('editable') === false) return null    // locked
  const parsed = await showQuickTagDialog({ initialText: '<div>', mode: 'wrap' })
  if (!parsed) return null
  const outerHTML = component.toHTML?.() || ''
  const newHtml = `<${parsed.tag}${attrsToHtml(parsed.attrs)}>${outerHTML}</${parsed.tag}>`
  const replaced = component.replaceWith(newHtml)
  const next = Array.isArray(replaced) ? replaced[0] : replaced
  if (next) getEditor()?.select?.(next)
  eventBus.emit('canvas:content-changed')
  return next
}

/**
 * Build the right-click menu item set for a component. Keeping this in the
 * same module ensures keyboard accelerators on items match the menu-router
 * shortcuts. Items are returned as a plain array — the caller passes them to
 * showContextMenu(x, y, items).
 */
export function buildComponentMenuItems(component) {
  const isRoot = !component?.parent?.()
  const lockedEdit   = component?.get?.('editable')  === false
  const lockedCopy   = component?.get?.('copyable')  === false
  const lockedRemove = component?.get?.('removable') === false
  // Move-to-top has one extra guard: a master-template PAGE's wrapper is
  // droppable:false while its chrome propagates (panels/templates/lock.js) —
  // moving anything to page-root there would land it in chrome-space.
  const wrapperLocked = getEditor()?.getWrapper?.()?.get?.('droppable') === false
  return [
    { label: t('ctx.edit-tag'),  accelerator: 'Ctrl+T',       action: () => editComponentTag(component),    disabled: !component || lockedEdit },
    { label: t('ctx.wrap-tag'),  accelerator: 'Ctrl+Shift+W', action: () => wrapComponentInTag(component), disabled: !component || isRoot || lockedEdit },
    { separator: true },
    { label: t('ctx.duplicate'), accelerator: 'Ctrl+D',       action: () => duplicateComponent(component), disabled: !component || isRoot || lockedCopy },
    { label: t('ctx.copy-html'), accelerator: 'Ctrl+C',       action: () => copyComponentHtml(component),  disabled: !component },
    { separator: true },
    { label: t('ctx.move-up'),   action: () => moveComponent(component, -1),         disabled: !component || isRoot || lockedRemove },
    { label: t('ctx.move-down'), action: () => moveComponent(component, 1),          disabled: !component || isRoot || lockedRemove },
    { label: t('ctx.move-top'),  action: () => moveComponentToPageTop(component),    disabled: !component || isRoot || lockedRemove || wrapperLocked },
    { separator: true },
    { label: t('action.delete'), accelerator: 'Del',          action: () => deleteComponent(component),    disabled: !component || isRoot || lockedRemove, danger: true },
    ...bsDocsMenuItems(component?.getClasses?.() || [])
  ]
}

/**
 * "More info" tail for context menus: one deep-link per Bootstrap topic the
 * given classes belong to (col-md-6 → Columns, mt-3 → Spacing, …), capped
 * by shared/bs-docs.js. Empty when nothing matches — no separator noise.
 * Exported for the Properties-panel class chips, which build a menu for a
 * single class name.
 */
export function bsDocsMenuItems(classes) {
  const docs = bsDocsForClasses(classes)
  if (docs.length === 0) return []
  return [
    { separator: true },
    ...docs.map(d => ({
      label: t('ctx.bs-docs', { topic: d.topic }),
      action: () => window.grapestrap.shell.openExternal(d.url)
    }))
  ]
}

function attrsToHtml(attrs) {
  const parts = []
  for (const [k, v] of Object.entries(attrs)) {
    if (v === '') parts.push(k)
    else parts.push(`${k}="${escAttr(String(v))}"`)
  }
  return parts.length ? ' ' + parts.join(' ') : ''
}
function escAttr(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
