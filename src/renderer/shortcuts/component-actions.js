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
 * DEPENDS: state/event-bus.js, state/page-state.js, editor/grapesjs-init.js,
 *          editor/code-select-highlight.js, dialogs/quick-tag.js,
 *          dialogs/edit-link.js, panels/element-fields.js,
 *          shortcuts/table-actions.js, shared/bs-docs.js, i18n.js
 * CREATED: 2026-05-02 (pre-breadcrumb; header added Workstream A chunk A4)
 * UPDATED: 2026-08-11 — added moveComponent/moveComponentToPageTop (chunk A4
 *          reorder affordances) + their context-menu items
 * UPDATED: 2026-08-18 — added selectParent/selectChild/selectableChildren +
 *          buildSelectHierarchyItems (WP-B1, F4 select parent/child) —
 *          selection is never a content change, so these never emit
 *          canvas:content-changed and never check the editable/removable
 *          locks that gate mutation elsewhere in this file
 * UPDATED: 2026-08-18 — editComponentLink() + the linkMenuItems and
 *          buildTableMenuItems tails on buildComponentMenuItems (WP-B3,
 *          F5 element editing)
 * UPDATED: 2026-08-18 — added the "Reveal in Code View" item (delegates to
 *          editor/code-select-highlight.js's revealComponentInCode(), disabled
 *          on file tabs) and buildGotoRuleItems()/gotoClassRule() (WP-B2, F3b
 *          jump-to-code / jump-to-class-rule). gotoClassRule() dynamic-imports
 *          panels/style-manager/css-jump.js — a sibling workstream's module —
 *          behind try/catch so a not-yet-landed or export-mismatched module
 *          degrades to the shared miss toast instead of throwing.
 */

import { eventBus } from '../state/event-bus.js'
import { getEditor } from '../editor/grapesjs-init.js'
import { pageState } from '../state/page-state.js'
import { revealComponentInCode } from '../editor/code-select-highlight.js'
import { showQuickTagDialog, formatComponentAsQuickTag } from '../dialogs/quick-tag.js'
import { showEditLinkDialog } from '../dialogs/edit-link.js'
import { setAttr } from '../panels/element-fields.js'
import { buildTableMenuItems } from './table-actions.js'
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

/**
 * Select a component's parent (the wrapper/body root is a valid target —
 * GrapesJS's own `core:component-exit` keyboard shortcut allows the same).
 * Selection is a view concern, not a content edit, so this never emits
 * canvas:content-changed and never checks the editable/removable locks.
 *
 * @param {object} component - GrapesJS component whose parent to select
 * @returns {object|null} the parent that was selected, or null if `component`
 *          is falsy or is already the root (no parent to select)
 */
export function selectParent(component) {
  if (!component) return null
  const parent = component.parent?.()
  if (!parent) return null
  getEditor()?.select?.(parent)
  return parent
}

/**
 * A component's selectable children: its direct Backbone child models minus
 * GrapesJS's internal `textnode` placeholders, which don't represent user
 * content (same skip the DOM tree panel applies — dom-tree/index.js:108).
 *
 * @param {object} component - GrapesJS component to read children from
 * @returns {object[]} child component models, in document order
 */
export function selectableChildren(component) {
  if (!component) return []
  const models = component.components?.()?.models || []
  return models.filter(child => child?.get?.('type') !== 'textnode')
}

/**
 * Select one of a component's children. `component` is accepted (unused
 * beyond documenting intent at call sites) to keep the call shape symmetric
 * with selectParent(component) — the actual selection only needs `child`.
 *
 * @param {object} component - the parent component (context only)
 * @param {object} child - GrapesJS component to select
 * @returns {object|null} `child` if selection was attempted, or null if
 *          `child` is falsy
 */
export function selectChild(component, child) {
  if (!child) return null
  getEditor()?.select?.(child)
  return child
}

/**
 * Short human-readable description of a component for menu labels:
 * "div.row" (tag + first class) or just "div" when it has no classes.
 *
 * @param {object} component - GrapesJS component to describe
 * @returns {string} the description, never empty (falls back to "div")
 */
export function describeComponent(component) {
  const tag = (component?.get?.('tagName') || 'div').toLowerCase()
  const classes = component?.getClasses?.() || []
  return classes.length ? `${tag}.${classes[0]}` : tag
}

// Child rows are capped so the flat (no-submenu) context menu widget never
// grows unusably tall on an element with dozens of children — the 7th row
// becomes a disabled "… N more" summary instead of scrolling forever.
const MAX_SELECT_CHILD_ITEMS = 6

/**
 * Build the "Select Parent" / "Select Child" hierarchy items for a
 * component's context menu: one leading separator, one Select Parent row
 * (disabled at the wrapper/body root), then zero or more Select Child rows.
 * No submenus — the context-menu widget is flat by design (keyboard nav +
 * e2e helpers depend on that) — so children beyond the cap collapse into one
 * disabled summary row rather than a nested menu.
 *
 * @param {object} component - GrapesJS component the menu was opened on
 * @returns {Array} menu item descriptors ({label, action, disabled?,
 *          separator?}); empty array if `component` is falsy
 */
export function buildSelectHierarchyItems(component) {
  if (!component) return []

  const parent = component.parent?.()
  const parentTag = (parent?.get?.('tagName') || 'body').toLowerCase()
  const items = [
    { separator: true },
    {
      label: t('ctx.select-parent', { tag: parentTag }),
      action: () => selectParent(component),
      disabled: !parent
    }
  ]

  const children = selectableChildren(component)
  if (children.length === 1) {
    const child = children[0]
    const tag = (child.get?.('tagName') || 'div').toLowerCase()
    items.push({
      label: t('ctx.select-child', { tag }),
      action: () => selectChild(component, child)
    })
  } else if (children.length >= 2) {
    const shown = children.slice(0, MAX_SELECT_CHILD_ITEMS)
    for (const child of shown) {
      items.push({
        label: t('ctx.select-child-n', { desc: describeComponent(child) }),
        action: () => selectChild(component, child)
      })
    }
    const remaining = children.length - shown.length
    if (remaining > 0) {
      items.push({
        label: t('ctx.select-child-more', { count: remaining }),
        action: () => {},
        disabled: true
      })
    }
  }

  return items
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
    { label: t('ctx.reveal-code'), action: () => revealComponentInCode(component), disabled: !component || pageState.active()?.kind === 'file' },
    { separator: true },
    { label: t('ctx.duplicate'), accelerator: 'Ctrl+D',       action: () => duplicateComponent(component), disabled: !component || isRoot || lockedCopy },
    { label: t('ctx.copy-html'), accelerator: 'Ctrl+C',       action: () => copyComponentHtml(component),  disabled: !component },
    { separator: true },
    { label: t('ctx.move-up'),   action: () => moveComponent(component, -1),         disabled: !component || isRoot || lockedRemove },
    { label: t('ctx.move-down'), action: () => moveComponent(component, 1),          disabled: !component || isRoot || lockedRemove },
    { label: t('ctx.move-top'),  action: () => moveComponentToPageTop(component),    disabled: !component || isRoot || lockedRemove || wrapperLocked },
    ...buildSelectHierarchyItems(component),
    ...buildGotoRuleItems(component),
    { separator: true },
    { label: t('action.delete'), accelerator: 'Del',          action: () => deleteComponent(component),    disabled: !component || isRoot || lockedRemove, danger: true },
    ...linkMenuItems(component),
    ...buildTableMenuItems(component),
    ...bsDocsMenuItems(component?.getClasses?.() || [])
  ]
}

// "Go to class rule" items are capped so a component with a long class list
// doesn't grow the flat (no-submenu) context menu unusably tall — same
// reasoning as MAX_SELECT_CHILD_ITEMS above.
const MAX_GOTO_RULE_ITEMS = 6

/**
 * Build the "Go to class rule" tail for a component's context menu: one item
 * per class on the component (capped), each jumping to that class's rule in
 * Custom CSS or Bootstrap CSS via the cross-workstream css-jump API.
 *
 * @param {object} component - The right-clicked component
 * @returns {Array<object>} A separator plus one item per class (capped at
 *          MAX_GOTO_RULE_ITEMS), or an EMPTY ARRAY when the component has no
 *          classes — callers spread this unconditionally, so a classless
 *          component must contribute no separator noise (same contract as
 *          bsDocsMenuItems/linkMenuItems/buildTableMenuItems).
 */
export function buildGotoRuleItems(component) {
  const classes = component?.getClasses?.() || []
  if (classes.length === 0) return []
  const shown = classes.slice(0, MAX_GOTO_RULE_ITEMS)
  return [
    { separator: true },
    ...shown.map(cls => ({
      label: t('ctx.goto-rule', { selector: '.' + cls }),
      action: () => gotoClassRule(cls)
    }))
  ]
}

/**
 * Jump to a class's CSS rule via the cross-workstream css-jump API
 * (panels/style-manager/css-jump.js). That module is owned by a sibling
 * workstream and may land after this one, or may not (yet) export
 * revealCssRule — a dynamic import behind try/catch means either failure
 * degrades to the shared miss toast (ctx.rule-not-found) instead of
 * throwing out of a menu-item click handler.
 *
 * @param {string} cls - Class name WITHOUT the leading dot
 * @returns {Promise<void>}
 */
async function gotoClassRule(cls) {
  try {
    const cssJump = await import('../panels/style-manager/css-jump.js')
    const result = await cssJump.revealCssRule?.({ selector: '.' + cls })
    if (!result?.found) eventBus.emit('toast', { type: 'warning', message: t('ctx.rule-not-found') })
  } catch (_) {
    // Module not landed yet, or a broken import — same miss toast, no throw.
    eventBus.emit('toast', { type: 'warning', message: t('ctx.rule-not-found') })
  }
}

/**
 * Open the link editor for an <a>, then write href/target/rel in one go.
 *
 * The dialog is awaited FIRST and the three writes happen afterwards with no
 * await between them — that is what fuses them into a single undo entry, and
 * it is why this cannot be three separate menu items (see the undo contract
 * at the top of shortcuts/table-actions.js). Exactly one
 * `canvas:content-changed` follows the last write.
 *
 * @param {object} component - The <a> component to edit
 * @returns {Promise<boolean>} true when the user confirmed and the
 *          attributes were written; false on cancel, on a locked component,
 *          or when called with something that is not a link
 */
export async function editComponentLink(component) {
  if (!component) return false
  if (component.get?.('editable') === false) return false    // locked
  if (tagOf(component) !== 'a') return false

  const attrs = component.getAttributes?.() || {}
  const answer = await showEditLinkDialog({
    href:   attrs.href   ?? '',
    target: attrs.target ?? '',
    rel:    attrs.rel    ?? ''
  })
  if (!answer) return false

  // ── one synchronous stack from here to the emit ──
  setAttr(component, 'href', answer.href)
  setAttr(component, 'target', answer.target)
  setAttr(component, 'rel', answer.rel)
  eventBus.emit('canvas:content-changed', component)
  return true
}

/**
 * "Edit Link…" tail for context menus — one item, only for an <a>.
 *
 * @param {object} component - The right-clicked component
 * @returns {Array<object>} A separator plus one item, or an EMPTY ARRAY for
 *          anything that is not a link (callers spread it unconditionally, so
 *          a non-link must contribute no separator noise).
 */
export function linkMenuItems(component) {
  if (tagOf(component) !== 'a') return []
  return [
    { separator: true },
    {
      label: t('ctx.edit-link'),
      action: () => editComponentLink(component),
      disabled: component.get?.('editable') === false
    }
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

function tagOf(component) {
  return String(component?.get?.('tagName') || '').toLowerCase()
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
