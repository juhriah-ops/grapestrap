/**
 * GrapeStrap — Per-component action helpers
 *
 * Single source of truth for "what can the user do to a selected component."
 * Used by:
 *   - the right-click context menu (canvas iframe + DOM tree rows)
 *   - menu actions wired in `menu-router.js` (Edit > Duplicate, Delete, …)
 *
 * Centralising avoids the bug class where the menu and the keyboard shortcut
 * fall out of sync (one duplicates via setComponents, the other via
 * GrapesJS .clone()) — both paths now go through these functions.
 */

import { eventBus } from '../state/event-bus.js'
import { getEditor } from '../editor/grapesjs-init.js'
import { showQuickTagDialog, formatComponentAsQuickTag } from '../dialogs/quick-tag.js'
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
  return [
    { label: t('ctx.edit-tag'),  accelerator: 'Ctrl+T',       action: () => editComponentTag(component),    disabled: !component || lockedEdit },
    { label: t('ctx.wrap-tag'),  accelerator: 'Ctrl+Shift+W', action: () => wrapComponentInTag(component), disabled: !component || isRoot || lockedEdit },
    { separator: true },
    { label: t('ctx.duplicate'), accelerator: 'Ctrl+D',       action: () => duplicateComponent(component), disabled: !component || isRoot || lockedCopy },
    { label: t('ctx.copy-html'), accelerator: 'Ctrl+C',       action: () => copyComponentHtml(component),  disabled: !component },
    { separator: true },
    { label: t('action.delete'), accelerator: 'Del',          action: () => deleteComponent(component),    disabled: !component || isRoot || lockedRemove, danger: true }
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
