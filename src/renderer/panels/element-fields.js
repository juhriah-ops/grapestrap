// =============================================================
// PATH: src/renderer/panels/element-fields.js
// ROLE: Headless, per-tag definitions of "what can you edit about THIS
//       element" — the href/target/rel of a link, the src/alt of an image,
//       the level of a heading, the striped/bordered state of a table — plus
//       the single commit path every surface uses to apply one. Zero DOM,
//       zero i18n: definitions carry labelKeys and the renderers translate,
//       so the bottom property strip and the right-hand Attributes section
//       stay two views over ONE matrix instead of two diverging copies.
// DEPENDS: state/event-bus.js, plugin-host/registry.js (bound editor),
//          editor/component-lock.js, log.js, shortcuts/table-actions.js
// CREATED: 2026-08-18
// UPDATED: 2026-08-18 — applyField()'s lock test moved to
//          editor/component-lock.js: `editable === false` is GrapesJS's
//          factory default on structural components, so it refused every
//          commit on a <table> / <ul> (see that module's header).
//
// ── Shape ────────────────────────────────────────────────────────────────
// Entry:  { id, match(component, tag, classes), fields: [Field] }
//         First match wins, so narrower entries come first — `a.btn` is
//         listed ahead of plain `a`, and its field set is a SUPERSET of the
//         plain link's so a button-styled link never loses target/rel.
// Field:  { key, kind: 'text'|'select'|'checkbox'|'action', labelKey,
//           options?, get(component), set(component, value), run?(component),
//           disabled?(component) }
//         `set`/`run` mutate ONLY through the GrapesJS component API, always
//         synchronously, and emit NOTHING — applyField() owns the event so
//         one gesture is one `canvas:content-changed`. Returning `{ next }`
//         hands applyField a replacement component to select (a retag drops
//         the old model). Returning `{ emitted: true }` means the callee
//         already fired the event (the table operations do, because the
//         context menu calls them without going through applyField).
//
// The undo contract these mutations obey — no um.stop()/start(), one
// synchronous call stack per gesture — is documented in full at the top of
// shortcuts/table-actions.js.
// =============================================================

import { eventBus } from '../state/event-bus.js'
// The editor handle comes from the plugin registry rather than
// editor/grapesjs-init.js's getEditor(). They are the same object (init calls
// setBound('editor', editor)), but grapesjs-init pulls in the whole GrapesJS
// bundle and a Vite-only `?raw` CSS import, neither of which loads under
// `node --test` — and this module has to stay importable there for
// tests/unit/element-fields.test.js.
import { pluginRegistry } from '../plugin-host/registry.js'
import { isComponentLocked } from '../editor/component-lock.js'
import { log } from '../log.js'
import {
  addTableRow, removeTableRow, addTableColumn, removeTableColumn,
  bodyRowCount, columnCount, findTableHead, theadDef
} from '../shortcuts/table-actions.js'

const HEADING_LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']

/** Seed text for a generated list item — an empty <li> cannot be typed into
 *  on the canvas (no textnode child). Same reasoning as table-actions.js's
 *  cell placeholders. */
const LIST_ITEM_PLACEHOLDER = 'Item'

const TARGET_OPTIONS = [
  { value: '',        labelKey: 'fields.target-default' },
  { value: '_self',   label: '_self' },
  { value: '_blank',  label: '_blank' },
  { value: '_parent', label: '_parent' },
  { value: '_top',    label: '_top' }
]

/** Reusable field builders — the link entries share these verbatim. */
const attrField = (key, labelKey) => ({
  key,
  kind: 'text',
  labelKey,
  get: component => component.getAttributes?.()?.[key] ?? '',
  set: (component, value) => { setAttr(component, key, value) }
})

const labelField = () => ({
  key: 'label',
  kind: 'text',
  labelKey: 'fields.label',
  // Only the simple `<a class="btn">Text</a>` shape is safe to edit as one
  // string. Anything else (an icon span, nested markup, several children)
  // would be destroyed by replacing the children, so the field goes disabled
  // and the user edits on the canvas or in code view instead.
  disabled: component => soleTextNode(component) === null,
  get: component => soleTextNode(component)?.get?.('content') ?? '',
  set: (component, value) => {
    // A definition array, not an HTML string: user label text must never be
    // re-parsed as markup (see the parser contract in table-actions.js).
    component.components([{ type: 'textnode', content: String(value ?? '') }])
  }
})

const classToggle = (key, className, labelKey) => ({
  key,
  kind: 'checkbox',
  labelKey,
  get: component => flatClasses(component).includes(className),
  set: (component, value) => { toggleClass(component, className, !!value) }
})

const tableAction = (key, labelKey, run, disabled) => ({
  key,
  kind: 'action',
  labelKey,
  // Table operations own their own canvas:content-changed — the context menu
  // reaches them directly, so the event cannot live in applyField alone.
  run: component => { run(component); return { emitted: true } },
  ...(disabled ? { disabled } : {})
})

const ELEMENT_DEFS = [
  {
    // Bootstrap button-links first: a superset of the plain-link field set,
    // so matching here never costs the user target/rel.
    id: 'link-button',
    match: (component, tag, classes) => tag === 'a' && classes.includes('btn'),
    fields: [
      labelField(),
      attrField('href', 'fields.href'),
      selectAttrField('target', 'fields.target', TARGET_OPTIONS),
      attrField('rel', 'fields.rel')
    ]
  },
  {
    id: 'button',
    match: (component, tag) => tag === 'button',
    fields: [labelField()]
  },
  {
    id: 'link',
    match: (component, tag) => tag === 'a',
    fields: [
      attrField('href', 'fields.href'),
      selectAttrField('target', 'fields.target', TARGET_OPTIONS),
      attrField('rel', 'fields.rel')
    ]
  },
  {
    id: 'image',
    match: (component, tag) => tag === 'img',
    fields: [attrField('src', 'fields.src'), attrField('alt', 'fields.alt')]
  },
  {
    id: 'heading',
    match: (component, tag) => HEADING_LEVELS.includes(tag),
    fields: [{
      key: 'heading-level',
      kind: 'select',
      labelKey: 'fields.heading-level',
      options: HEADING_LEVELS.map(level => ({ value: level, label: level.toUpperCase() })),
      get: component => tagOf(component),
      set: (component, value) => {
        if (!HEADING_LEVELS.includes(value)) return
        return { next: retagComponent(component, value) }
      }
    }]
  },
  {
    id: 'table',
    // `.table` is Bootstrap's own hook and always sits on a <table>, but
    // matching it too keeps the section available if a project ships a
    // table-shaped element that has been retagged.
    match: (component, tag, classes) => tag === 'table' || classes.includes('table'),
    fields: [
      {
        key: 'table-head',
        kind: 'checkbox',
        labelKey: 'fields.table-head',
        get: component => findTableHead(component) !== null,
        set: (component, value) => {
          const head = findTableHead(component)
          if (value && !head) {
            // ONE .add() of a complete <thead> definition — single undo entry.
            component.components().add(theadDef(columnCount(component)), { at: 0 })
          } else if (!value && head) {
            head.remove()
          }
        }
      },
      classToggle('table-striped', 'table-striped', 'fields.table-striped'),
      classToggle('table-bordered', 'table-bordered', 'fields.table-bordered'),
      classToggle('table-hover', 'table-hover', 'fields.table-hover'),
      tableAction('table-add-row', 'fields.add-row', component => addTableRow(component, null)),
      tableAction('table-remove-row', 'fields.remove-row',
        component => removeTableRow(component, null),
        component => bodyRowCount(component) <= 1),
      tableAction('table-add-col', 'fields.add-col', component => addTableColumn(component, null)),
      tableAction('table-remove-col', 'fields.remove-col',
        component => removeTableColumn(component, null),
        component => columnCount(component) <= 1)
    ]
  },
  {
    id: 'list',
    match: (component, tag) => tag === 'ul' || tag === 'ol',
    fields: [
      {
        key: 'list-type',
        kind: 'select',
        labelKey: 'fields.list-type',
        options: [
          { value: 'ul', labelKey: 'fields.list-unordered' },
          { value: 'ol', labelKey: 'fields.list-ordered' }
        ],
        get: component => tagOf(component),
        set: (component, value) => {
          if (value !== 'ul' && value !== 'ol') return
          if (value === tagOf(component)) return
          return { next: retagComponent(component, value) }
        }
      },
      {
        key: 'list-add-item',
        kind: 'action',
        labelKey: 'fields.add-item',
        // <li> survives fragment parsing (unlike <td>/<tr>), so the plain
        // HTML string is safe here and keeps the item text-editable.
        run: component => { component.components().add(`<li>${LIST_ITEM_PLACEHOLDER}</li>`) }
      },
      {
        key: 'list-remove-item',
        kind: 'action',
        labelKey: 'fields.remove-item',
        disabled: component => listItems(component).length === 0,
        run: component => {
          const items = listItems(component)
          const last = items[items.length - 1]
          if (!last || last.get?.('removable') === false) return
          last.remove()
        }
      }
    ]
  },
  {
    id: 'iframe',
    match: (component, tag) => tag === 'iframe',
    fields: [attrField('src', 'fields.src')]
  }
]

/**
 * Find the field set for a component.
 *
 * @param {object} component - GrapesJS component
 * @returns {{id: string, fields: Array<object>}|null} null when no entry
 *          matches — callers render nothing rather than an empty section.
 */
export function getFieldsFor(component) {
  if (!component) return null
  const tag = tagOf(component)
  if (!tag) return null
  const classes = flatClasses(component)
  const def = ELEMENT_DEFS.find(entry => {
    try {
      return entry.match(component, tag, classes) === true
    } catch (error) {
      // A matcher must never take the whole panel down over one odd model.
      // Treated as "no match" so the remaining entries still get a chance.
      log.warn(`element-fields: matcher "${entry.id}" threw`, error)
      return false
    }
  })
  return def ? { id: def.id, fields: def.fields } : null
}

/**
 * THE commit path for every field, from every surface.
 *
 * Centralising it is what makes "one gesture = one undo entry = one
 * canvas:content-changed" true no matter which panel the user touched.
 *
 * @param {object} component - The component being edited
 * @param {object} field - A field from getFieldsFor().fields
 * @param {*} value - New value ('' clears a text field, boolean for a
 *        checkbox, ignored for an action)
 * @returns {object|null} The replacement component when the mutation retagged
 *          the element (already selected), otherwise null. Also null when the
 *          component is locked (isComponentLocked — template chrome, library
 *          lock) or the field is malformed: a locked element must be inert,
 *          not half-applied.
 */
export function applyField(component, field, value) {
  if (!component || !field) return null
  if (isComponentLocked(component)) return null

  let result
  try {
    if (field.kind === 'action') {
      if (typeof field.run !== 'function') return null
      result = field.run(component)
    } else {
      if (typeof field.set !== 'function') return null
      result = field.set(component, value)
    }
  } catch (error) {
    // A throwing mutation may have landed a partial change; report it and
    // still emit so every surface repaints against the real model state
    // rather than showing the pre-edit value it optimistically kept.
    log.error(`element-fields: field "${field.key}" failed to apply`, error)
    eventBus.emit('canvas:content-changed', component)
    return null
  }

  const next = result?.next || null
  if (next) pluginRegistry.bound.editor?.select?.(next)
  // Table operations already emitted for themselves (see tableAction()).
  if (result?.emitted !== true) eventBus.emit('canvas:content-changed', next || component)
  return next
}

/**
 * Write one HTML attribute, or delete it when the value is empty.
 *
 * The empty-string branch is why this exists: `addAttributes({ href: '' })`
 * would persist `href=""` into every saved page. Idiom moved verbatim from
 * panels/properties-strip/index.js's applyChange().
 *
 * @param {object} component - GrapesJS component
 * @param {string} name - Attribute name
 * @param {string} value - New value; '' removes the attribute entirely
 * @returns {void}
 */
export function setAttr(component, name, value) {
  if (!component || !name) return
  const next = String(value ?? '')
  if (next === '') {
    const rest = { ...component.getAttributes?.() }
    delete rest[name]
    component.setAttributes(rest)
  } else {
    component.addAttributes({ [name]: next })
  }
}

/**
 * Add or remove one class, leaving every other class untouched.
 *
 * One setClass() write on the flat class list = one undo entry (the same
 * contract Style Manager group writes rely on — tests/e2e/undo-redo.spec.js).
 * A no-op toggle writes nothing, so re-checking an already-checked box does
 * not push a hollow entry onto the undo stack.
 *
 * @param {object} component - GrapesJS component
 * @param {string} className - Class to add or remove
 * @param {boolean} on - true adds, false removes
 * @returns {void}
 */
export function toggleClass(component, className, on) {
  if (!component || !className) return
  const current = flatClasses(component)
  const has = current.includes(className)
  if (!!on === has) return
  component.setClass(on ? [...current, className] : current.filter(name => name !== className))
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/** Attribute-backed <select>: same commit path as a text attribute. */
function selectAttrField(key, labelKey, options) {
  return { ...attrField(key, labelKey), kind: 'select', options }
}

/**
 * Replace a component with the same content and attributes under a new tag.
 *
 * Idiom moved verbatim from panels/properties-strip/index.js's heading-level
 * branch: GrapesJS has no retag API, so the element is re-serialised with the
 * new tag name and replaceWith() swaps the model. The old component is gone
 * afterwards — callers MUST select the returned one.
 *
 * @param {object} component - Component to retag
 * @param {string} newTag - Replacement tag name
 * @returns {object|null} The new component, or null if replaceWith returned
 *          nothing (a detached or root component)
 */
function retagComponent(component, newTag) {
  const innerHTML = component.getInnerHTML?.() || ''
  const attrs = component.getAttributes?.() || {}
  const classes = flatClasses(component)
  const merged = { ...attrs }
  if (classes.length) merged.class = classes.join(' ')
  const attrStr = Object.entries(merged)
    .map(([key, value]) => value === '' ? key : `${key}="${escAttr(String(value))}"`)
    .join(' ')
  const newHtml = `<${newTag}${attrStr ? ' ' + attrStr : ''}>${innerHTML}</${newTag}>`
  const replaced = component.replaceWith(newHtml)
  return (Array.isArray(replaced) ? replaced[0] : replaced) || null
}

/** The component's only child when that child is a textnode, else null. */
function soleTextNode(component) {
  const children = childModels(component)
  if (children.length !== 1) return null
  return children[0]?.get?.('type') === 'textnode' ? children[0] : null
}

/** A list's <li> children (textnodes and stray markup excluded). */
function listItems(component) {
  return childModels(component).filter(child => tagOf(child) === 'li')
}

/**
 * A component's children as a plain array. components() is a Backbone
 * Collection — indexed access via `coll[i]` does not work, it must be
 * `.models` / `.at(i)` (documented at src/renderer/editor/placement.js:210).
 */
function childModels(component) {
  const collection = component?.components?.()
  return collection?.models || (Array.isArray(collection) ? collection : [])
}

/** Class names as plain strings — getClasses() can hand back either strings
 *  or Selector models depending on how the component was built. */
function flatClasses(component) {
  const classes = component?.getClasses?.() || []
  return classes
    .map(entry => typeof entry === 'string' ? entry : (entry?.get?.('name') || ''))
    .filter(Boolean)
}

function tagOf(component) {
  return String(component?.get?.('tagName') || '').toLowerCase()
}

function escAttr(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
