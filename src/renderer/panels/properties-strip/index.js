/**
 * GrapeStrap — Property Inspector strip (bottom)
 *
 * PATH: src/renderer/panels/properties-strip/index.js
 * ROLE: Dreamweaver-style horizontal strip below the canvas. Updates with the
 *       currently selected element. Always shows tag · id · classes (those
 *       three are strip-local — every element has them), then appends the
 *       element-aware fields for the selection from the shared matrix in
 *       panels/element-fields.js: href/target/rel on a link, src/alt on an
 *       image, the level of a heading, and so on.
 *
 *       The strip renders only the `text` and `select` field kinds. It is one
 *       line tall by design, so checkboxes and action buttons (table row/
 *       column surgery, list items) live in the Properties panel's Attributes
 *       section instead — same definitions, richer surface.
 * DEPENDS: state/event-bus.js, editor/component-lock.js,
 *          panels/element-fields.js, i18n.js, styles/property-strip.css
 * CREATED: 2026-05-02 (pre-breadcrumb; header added 2026-08-18)
 * UPDATED: 2026-08-18 — the inline a/img/h1-6 branches and the attribute half
 *          of applyChange moved into panels/element-fields.js (WP-B3); the
 *          strip now renders whatever that matrix offers, so new element
 *          types show up here without touching this file
 * UPDATED: 2026-08-18 — the locked test moved to editor/component-lock.js so
 *          this surface and the Attributes section agree; the raw
 *          `editable === false` read it replaced is GrapesJS's factory
 *          default on structural elements (lists, tables)
 *
 * Inputs commit on `change` / blur, not on every keystroke — fewer canvas
 * churns and undo-history entries.
 */

import { eventBus } from '../../state/event-bus.js'
import { isComponentLocked } from '../../editor/component-lock.js'
import { getFieldsFor, applyField } from '../element-fields.js'
import { t } from '../../i18n.js'

let host = null
let currentComponent = null
// Fields rendered in the current pass, keyed by field.key — the change
// handler looks the definition up here instead of re-deriving it, so a
// mutation that changes the matched entry (a retag) can never commit through
// a stale definition.
let renderedFields = new Map()

export function renderPropertyStrip(target) {
  host = target
  setEmptyState()
  eventBus.on('canvas:selected',   renderForElement)
  eventBus.on('canvas:deselected', setEmptyState)
}

function setEmptyState() {
  if (!host) return
  currentComponent = null
  renderedFields = new Map()
  host.innerHTML = `<span class="gstrap-strip-hint">${escHtml(t('strip.hint'))}</span>`
}

function renderForElement(component) {
  if (!host || !component) return
  currentComponent = component
  renderedFields = new Map()

  const tag = (component.get('tagName') || component.get('type') || 'div').toLowerCase()
  const attrs = component.getAttributes?.() || {}
  const flatClasses = (component.getClasses?.() || [])
    .map(c => typeof c === 'string' ? c : (c?.get?.('name') || ''))
    .filter(Boolean)

  const sections = [
    `<span class="gstrap-strip-tag" title="${escAttr(t('props.element'))}">${escHtml(tag)}</span>`,
    fieldText('id', t('props.id'), attrs.id ?? ''),
    fieldText('classes', t('props.classes'), flatClasses.join(' '))
  ]

  // A locked element (template chrome, library lock) shows its fields but
  // cannot commit them — applyField() refuses, so the controls say so rather
  // than silently swallowing the edit.
  const locked = isComponentLocked(component)

  for (const field of getFieldsFor(component)?.fields || []) {
    if (field.kind !== 'text' && field.kind !== 'select') continue
    const disabled = locked || field.disabled?.(component) === true
    renderedFields.set(field.key, field)
    const value = String(field.get?.(component) ?? '')
    sections.push(field.kind === 'select'
      ? fieldSelect(field.key, t(field.labelKey), value, field.options || [], disabled)
      : fieldText(field.key, t(field.labelKey), value, disabled))
  }

  host.innerHTML = sections.join('<span class="gstrap-strip-sep">·</span>')

  host.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('change', () => applyChange(el.dataset.field, el.value))
  })
}

/**
 * Commit one strip edit.
 *
 * id and classes are strip-local (every element has them, no matrix entry
 * needed); everything else routes through applyField(), the single commit
 * path shared with the Properties panel — that is what keeps one gesture at
 * one undo entry and one `canvas:content-changed`.
 *
 * @param {string} key - The edited control's data-field value
 * @param {string} raw - Its .value
 * @returns {void}
 */
function applyChange(key, raw) {
  const component = currentComponent
  if (!component) return
  const value = String(raw ?? '').trim()

  if (key === 'classes') {
    component.setClass(value.split(/\s+/).filter(Boolean))
    eventBus.emit('canvas:content-changed', component)
    return
  }
  if (key === 'id') {
    // Same empty-string-deletes idiom applyField uses for attributes, kept
    // here because `id` is offered on every element, matrix entry or not.
    if (value === '') {
      const rest = { ...component.getAttributes?.() }
      delete rest.id
      component.setAttributes(rest)
    } else {
      component.addAttributes({ id: value })
    }
    eventBus.emit('canvas:content-changed', component)
    return
  }

  const field = renderedFields.get(key)
  if (!field) return
  applyField(component, field, value)
}

function fieldText(name, label, value, disabled = false) {
  return `<label class="gstrap-strip-field">
    <span>${escHtml(label)}</span>
    <input type="text" data-field="${escAttr(name)}" value="${escAttr(value)}"${disabled ? ' disabled' : ''}>
  </label>`
}

/**
 * @param {Array} options - Either [value, label] pairs (strip-local fields)
 *        or element-fields option objects ({ value, label } / { value,
 *        labelKey } — labelKey is translated here, so the definitions stay
 *        i18n-free).
 */
function fieldSelect(name, label, value, options, disabled = false) {
  const opts = options.map(option => {
    const [optValue, optLabel] = Array.isArray(option)
      ? option
      : [option.value, option.labelKey ? t(option.labelKey) : option.label]
    return `<option value="${escAttr(optValue)}"${optValue === value ? ' selected' : ''}>${escHtml(optLabel)}</option>`
  }).join('')
  return `<label class="gstrap-strip-field">
    <span>${escHtml(label)}</span>
    <select data-field="${escAttr(name)}"${disabled ? ' disabled' : ''}>${opts}</select>
  </label>`
}

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
function escAttr(s) { return escHtml(s) }
