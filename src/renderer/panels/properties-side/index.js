/**
 * GrapeStrap — Properties side panel (right)
 *
 * PATH: src/renderer/panels/properties-side/index.js
 * ROLE: Four sections, top-to-bottom:
 *   - Element    : tag (read-only) + ID input
 *   - Classes    : chip list with remove + add-class input
 *   - Attributes : the element-aware fields for the selection, from the
 *                  shared matrix in panels/element-fields.js. Unlike the
 *                  bottom strip (one line, text/select only) this surface
 *                  renders EVERY field kind — the table's striped/bordered/
 *                  hover checkboxes and its row/column action buttons, a
 *                  list's add/remove item. Absent entirely for elements the
 *                  matrix has nothing to say about.
 *   - Style      : delegates to the Style Manager (panels/style-manager/),
 *                  which renders an accordion of class-first sub-panels
 *                  (Spacing, Display, Text in chunk A; Flex/Background/
 *                  Border/Sizing in chunk B; pseudo-class state bar +
 *                  Cascade view in chunk C).
 * DEPENDS: state/event-bus.js, state/project-state.js,
 *          editor/component-lock.js,
 *          panels/element-fields.js, panels/style-manager/index.js,
 *          panels/style-manager/css-rule-utils.js,
 *          panels/style-manager/css-jump.js, dialogs/context-menu.js,
 *          dialogs/typeahead.js, panels/properties-side/class-suggestions.js,
 *          shortcuts/component-actions.js, i18n.js, styles/panels.css
 * CREATED: 2026-05-02 (pre-breadcrumb; header added 2026-08-18)
 * UPDATED: 2026-08-18 — added the Attributes section (WP-B3) + the
 *          targeted canvas:content-changed re-render that keeps it honest
 *          after a mutation changes what the fields report
 * UPDATED: 2026-08-18 — the class-chip right-click menu gained the two
 *          jump-to-rule items (WP-A3, F3a), which is also why it stopped
 *          filtering separators out: the menu now has groups to divide
 * UPDATED: 2026-08-18 — the Attributes section's locked test moved to
 *          editor/component-lock.js (a raw `editable === false` read is
 *          GrapesJS's factory default on tables and lists, so every control
 *          they own rendered disabled)
 * UPDATED: 2026-08-18 — the add-class input's Enter-commit body is now
 *          commitClass(), shared with the new typeahead popover (F6):
 *          attachTypeahead() wires dialogs/typeahead.js to the input with
 *          class-suggestions.js as its item source and commitClass as
 *          onPick, so picking a suggestion and typing-then-Enter commit
 *          through the exact same path
 *
 * Class chip mutations here also fire `canvas:component-class-changed` via the
 * grapesjs-init bridge — which means picking a class from the chip input
 * re-renders the Style Manager's "Active" state in the same paint, and vice
 * versa. The two surfaces stay in sync without either knowing about the
 * other.
 */

import { eventBus } from '../../state/event-bus.js'
import { projectState } from '../../state/project-state.js'
import { isComponentLocked } from '../../editor/component-lock.js'
import { getFieldsFor, applyField } from '../element-fields.js'
import { renderStyleManager } from '../style-manager/index.js'
import { findSelectorRange } from '../style-manager/css-rule-utils.js'
import { jumpToCssRule } from '../style-manager/css-jump.js'
import { showContextMenu } from '../../dialogs/context-menu.js'
import { attachTypeahead } from '../../dialogs/typeahead.js'
import { bsDocsMenuItems } from '../../shortcuts/component-actions.js'
import { getClassSuggestions } from './class-suggestions.js'
import { t } from '../../i18n.js'

let host = null
let currentComponent = null
let eventsWired = false
// Attribute fields rendered in the current pass, keyed by field.key. The
// change/click handlers look definitions up here rather than re-deriving
// them, so a mutation that changes which matrix entry matches (a heading
// retag, adding the `table` class) can never commit through a stale one.
let renderedFields = new Map()

export function renderProperties(target) {
  host = target
  host.classList.add('gstrap-props-host')
  // Factory re-runs (GL loadLayout — Wave 3) land mid-session: repaint the
  // current selection into the fresh host instead of blanking it.
  if (currentComponent) renderForElement()
  else setEmpty()
  wirePropsEvents()
}

// Wire-once (Wave 3 idempotency — GL loadLayout re-invokes the factory).
// Handlers read the module `host`, reassigned per render run.
function wirePropsEvents() {
  if (eventsWired) return
  eventsWired = true
  eventBus.on('canvas:selected',   c => { currentComponent = c; renderForElement() })
  eventBus.on('canvas:deselected', () => { currentComponent = null; setEmpty() })
  // Keep chip list in sync if classes are mutated by the Style Manager or
  // any other source (Quick Tag, plugin commands, undo).
  eventBus.on('canvas:component-class-changed', c => {
    if (c === currentComponent) renderForElement()
  })
  // Attribute fields read live off the component (a table's column count, a
  // button's label), so a mutation has to repaint them. The payload is the
  // component the mutation targeted — element-fields.js and table-actions.js
  // pass it; every OTHER emitter in the app passes nothing, and those keep
  // the old no-repaint behavior rather than rebuilding this whole panel
  // (Style Manager included) on every canvas event.
  eventBus.on('canvas:content-changed', changed => {
    if (changed && changed === currentComponent) renderForElement()
  })
}

function setEmpty() {
  if (!host) return
  renderedFields = new Map()
  host.innerHTML = `
    <section class="gstrap-props-section gstrap-empty">
      ${escHtml(t('props.empty'))}
    </section>
    <section class="gstrap-props-section" data-region="style-manager"></section>
  `
  // Render the Style Manager into its empty-state too (it renders its own
  // empty hint when no component is selected, so the user always sees the
  // panel is *there*).
  const smHost = host.querySelector('[data-region="style-manager"]')
  if (smHost) renderStyleManager(smHost, () => currentComponent)
}

function renderForElement() {
  if (!host || !currentComponent) return
  const tag = currentComponent.get('tagName') || currentComponent.get('type')
  const id = currentComponent.getId() || ''
  const classes = currentComponent.getClasses() || []
  renderedFields = new Map()

  host.innerHTML = `
    <section class="gstrap-props-section">
      <h4>${escHtml(t('props.element'))}</h4>
      <div class="gstrap-prop-row"><label>${escHtml(t('props.tag'))}</label><span>${escHtml(tag)}</span></div>
      <div class="gstrap-prop-row"><label>${escHtml(t('props.id'))}</label><input type="text" data-field="id" value="${escAttr(id)}"></div>
    </section>
    <section class="gstrap-props-section">
      <h4>${escHtml(t('props.classes'))}</h4>
      <div class="gstrap-class-chips">
        ${classes.map(c => `<span class="gstrap-chip" data-class="${escAttr(c)}">${escHtml(c)}<button data-remove="${escAttr(c)}" title="${escAttr(t('action.remove'))}">×</button></span>`).join('')}
        <input type="text" class="gstrap-chip-input" data-field="add-class" placeholder="${escAttr(t('props.add-class-placeholder'))}">
      </div>
    </section>
    ${attributesSectionHtml(currentComponent)}
    <section class="gstrap-props-section">
      <h4>${escHtml(t('props.style'))}</h4>
      <div data-region="style-manager"></div>
    </section>
  `
  wireAttributeFields()

  host.querySelector('[data-field="id"]').addEventListener('change', evt => {
    currentComponent.setId(evt.target.value.trim())
  })
  const addClassInput = host.querySelector('[data-field="add-class"]')
  // Suggestion popover (F6) — wired BEFORE the raw Enter-commit handler
  // below on purpose. Both listeners target this same input, and at the
  // exact target a DOM dispatch runs listeners in REGISTRATION order, not
  // capture-flag order (capture only wins ordering across DIFFERENT nodes
  // during the true capturing phase) — so for this listener's
  // stopImmediatePropagation() to actually pre-empt the raw commit below,
  // it has to be registered first. See dialogs/typeahead.js's header for
  // the rest of the Enter contract (a HIGHLIGHTED Enter picks and stops
  // here; an Enter with nothing highlighted falls through untouched).
  // No detach bookkeeping needed: renderForElement rebuilds this whole
  // section's innerHTML on every selection change, which discards this
  // input (and, via the native blur that fires when a focused element is
  // removed from the document, closes any popover still open on it).
  attachTypeahead(addClassInput, {
    getItems: query => getClassSuggestions(query, currentComponent.getClasses()),
    onPick: commitClass
  })
  addClassInput.addEventListener('keydown', evt => {
    if (evt.key !== 'Enter') return
    commitClass(evt.target.value)
  })
  host.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = btn.dataset.remove
      currentComponent.setClass(currentComponent.getClasses().filter(c => c !== cls))
      renderForElement()
    })
  })

  // Right-click a class chip → jump to the class's rule, plus the "More info"
  // deep-link into the Bootstrap docs for that class (col-md-6 → Columns, …).
  host.querySelectorAll('.gstrap-chip[data-class]').forEach(chip => {
    chip.addEventListener('contextmenu', evt => {
      evt.preventDefault()
      showContextMenu(evt.clientX, evt.clientY, buildChipMenuItems(chip.dataset.class))
    })
  })

  const smHost = host.querySelector('[data-region="style-manager"]')
  if (smHost) renderStyleManager(smHost, () => currentComponent)
}

// ─── Add-class commit ───────────────────────────────────────────────────────

/**
 * Add one class to the currently selected component and repaint the panel.
 * The single commit path for the add-class input — reached from its own
 * Enter keydown (raw typed text) AND from the typeahead popover's onPick
 * (a chosen suggestion) AND from the raw text once the popover has been
 * dismissed (Esc, or Enter with nothing highlighted) — so there is exactly
 * one place that decides what "adding a class" means.
 *
 * @param {string} value - The class name to add, with or without surrounding
 *        whitespace (trimmed here)
 * @returns {void}
 */
function commitClass(value) {
  const cls = String(value || '').trim()
  if (!cls || !currentComponent) return
  const next = [...new Set([...currentComponent.getClasses(), cls])]
  currentComponent.setClass(next)
  renderForElement()
}

// ─── Class-chip context menu ────────────────────────────────────────────────

/**
 * Build the right-click menu for one class chip: go to the class's rule in
 * either stylesheet panel, then the Bootstrap docs deep-links.
 *
 * The two goto items are always PRESENT and disabled when the sheet doesn't
 * contain the rule — a menu whose items appear and vanish per class teaches
 * the user nothing about why, and "there is no rule for this class here" is
 * exactly what the disabled state says.
 *
 * @param {string} cls - The chip's class name, without the leading dot
 * @returns {Array<object>} showContextMenu items
 */
function buildChipMenuItems(cls) {
  const selector = '.' + cls
  const projectCss = projectState.current?.globalCSS
  const bootstrapCss = projectState.current?.bootstrapCSS

  const items = [
    {
      label: t('ctx.goto-custom-css'),
      disabled: !findSelectorRange(projectCss || '', selector),
      action: () => jumpToCssRule('custom-css', selector)
    },
    {
      // Absent buffer = a project that vendors its own framework; there is no
      // app-managed Bootstrap sheet to search, let alone open.
      label: t('ctx.goto-bootstrap-css'),
      disabled: typeof bootstrapCss !== 'string' || !findSelectorRange(bootstrapCss, selector),
      action: () => jumpToCssRule('bootstrap-css', selector)
    }
  ]

  // bsDocsMenuItems leads with its own separator so it can be appended after
  // anything — which is why the docs group goes last rather than first.
  const docsItems = bsDocsMenuItems([cls])
  if (docsItems.length > 0) return [...items, ...docsItems]
  return [...items, { separator: true }, { label: t('ctx.bs-docs-none'), disabled: true }]
}

// ─── Attributes section ─────────────────────────────────────────────────────

/**
 * Build the Attributes section for a component, or '' when the shared matrix
 * (panels/element-fields.js) has no entry for it — an empty titled section
 * would just be furniture.
 *
 * Field definitions are recorded in `renderedFields` as a side effect so the
 * handlers wired by wireAttributeFields() can find them by key.
 *
 * @param {object} component - The selected GrapesJS component
 * @returns {string} HTML for one <section>, or '' for no-match / no fields
 */
function attributesSectionHtml(component) {
  const matched = getFieldsFor(component)
  if (!matched || matched.fields.length === 0) return ''

  // A locked element (template chrome, library lock) shows its fields but
  // cannot commit them — applyField() refuses, so the controls say so rather
  // than silently swallowing the edit. Same predicate applyField() uses, so
  // the two can never disagree about what "locked" means.
  const locked = isComponentLocked(component)

  const rows = []
  const actions = []
  for (const field of matched.fields) {
    renderedFields.set(field.key, field)
    const disabled = locked || field.disabled?.(component) === true
    if (field.kind === 'action') actions.push(actionButtonHtml(field, disabled))
    else rows.push(fieldRowHtml(field, component, disabled))
  }

  return `
    <section class="gstrap-props-section gstrap-props-attributes" data-element-kind="${escAttr(matched.id)}">
      <h4>${escHtml(t('props.attributes'))}</h4>
      ${rows.join('')}
      ${actions.length ? `<div class="gstrap-prop-actions">${actions.join('')}</div>` : ''}
    </section>`
}

/** One labelled text / select / checkbox row. */
function fieldRowHtml(field, component, disabled) {
  const label = escHtml(t(field.labelKey))
  const key = escAttr(field.key)
  const off = disabled ? ' disabled' : ''

  if (field.kind === 'checkbox') {
    const checked = field.get?.(component) === true ? ' checked' : ''
    return `<div class="gstrap-prop-row"><label>${label}</label><input type="checkbox" data-attr-field="${key}"${checked}${off}></div>`
  }
  const value = String(field.get?.(component) ?? '')
  if (field.kind === 'select') {
    const opts = (field.options || []).map(option => {
      const optLabel = option.labelKey ? t(option.labelKey) : option.label
      return `<option value="${escAttr(option.value)}"${option.value === value ? ' selected' : ''}>${escHtml(optLabel)}</option>`
    }).join('')
    return `<div class="gstrap-prop-row"><label>${label}</label><select data-attr-field="${key}"${off}>${opts}</select></div>`
  }
  return `<div class="gstrap-prop-row"><label>${label}</label><input type="text" data-attr-field="${key}" value="${escAttr(value)}"${off}></div>`
}

function actionButtonHtml(field, disabled) {
  return `<button type="button" class="gstrap-prop-action" data-attr-action="${escAttr(field.key)}"${disabled ? ' disabled' : ''}>${escHtml(t(field.labelKey))}</button>`
}

/**
 * Bind the Attributes controls. Text and select commit on `change` (not per
 * keystroke — same rule the bottom strip follows), checkboxes and buttons on
 * their natural event. Every one of them routes through applyField(), the
 * single commit path: one gesture, one undo entry, one
 * `canvas:content-changed`.
 *
 * @returns {void}
 */
function wireAttributeFields() {
  host.querySelectorAll('[data-attr-field]').forEach(el => {
    el.addEventListener('change', () => {
      const field = renderedFields.get(el.dataset.attrField)
      if (!field || !currentComponent) return
      const value = el.type === 'checkbox' ? el.checked : String(el.value ?? '').trim()
      applyField(currentComponent, field, value)
    })
  })
  host.querySelectorAll('[data-attr-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = renderedFields.get(btn.dataset.attrAction)
      if (!field || !currentComponent) return
      applyField(currentComponent, field, null)
    })
  })
}

function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
function escAttr(s) { return escHtml(s) }
