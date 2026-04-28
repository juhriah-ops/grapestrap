/**
 * GrapeStrap — Property Inspector strip (bottom)
 *
 * Dreamweaver-style horizontal strip below the canvas. Updates with the
 * currently selected element. Always shows: tag · id · classes. Adds
 * element-aware controls for the common cases:
 *
 *   <a>       href · target
 *   <img>     src · alt
 *   <h1..h6>  heading-level dropdown (changes the tag)
 *
 * The rest of the Dreamweaver matrix (block formats, lists, alignment,
 * inline-style toggles) lands alongside the full Style Manager.
 *
 * Inputs commit on `change` / blur, not on every keystroke — fewer canvas
 * churns and undo-history entries.
 */

import { eventBus } from '../../state/event-bus.js'
import { getEditor } from '../../editor/grapesjs-init.js'

const HEADING_LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']

let host = null
let currentComponent = null

export function renderPropertyStrip(target) {
  host = target
  setEmptyState()
  eventBus.on('canvas:selected',   renderForElement)
  eventBus.on('canvas:deselected', setEmptyState)
}

function setEmptyState() {
  if (!host) return
  currentComponent = null
  host.innerHTML = `<span class="gstrap-strip-hint">Select an element on the canvas to edit its properties.</span>`
}

function renderForElement(component) {
  if (!host || !component) return
  currentComponent = component

  const tag = (component.get('tagName') || component.get('type') || 'div').toLowerCase()
  const attrs = component.getAttributes?.() || {}
  const classes = component.getClasses?.() || []
  const flatClasses = classes
    .map(c => typeof c === 'string' ? c : (c?.get?.('name') || ''))
    .filter(Boolean)

  const sections = [
    `<span class="gstrap-strip-tag" title="Element">${escHtml(tag)}</span>`,
    fieldText('id', 'ID', attrs.id ?? ''),
    fieldText('classes', 'Classes', flatClasses.join(' '))
  ]

  if (tag === 'a') {
    sections.push(fieldText('href', 'href', attrs.href ?? ''))
    sections.push(fieldSelect('target', 'target', attrs.target ?? '', [
      ['', '(default)'], ['_self', '_self'], ['_blank', '_blank'],
      ['_parent', '_parent'], ['_top', '_top']
    ]))
  } else if (tag === 'img') {
    sections.push(fieldText('src', 'src', attrs.src ?? ''))
    sections.push(fieldText('alt', 'alt', attrs.alt ?? ''))
  } else if (HEADING_LEVELS.includes(tag)) {
    sections.push(fieldSelect('heading-level', 'level', tag,
      HEADING_LEVELS.map(h => [h, h.toUpperCase()])))
  }

  host.innerHTML = sections.join('<span class="gstrap-strip-sep">·</span>')

  host.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('change', () => applyChange(el.dataset.field, el.value))
  })
}

function applyChange(field, raw) {
  const editor = getEditor()
  const c = currentComponent
  if (!c || !editor) return
  const value = String(raw ?? '').trim()

  if (field === 'classes') {
    c.setClass(value.split(/\s+/).filter(Boolean))
    eventBus.emit('canvas:content-changed')
    return
  }
  if (field === 'heading-level') {
    if (!HEADING_LEVELS.includes(value)) return
    const innerHTML = c.getInnerHTML?.() || ''
    const attrs = c.getAttributes?.() || {}
    const classes = c.getClasses?.() || []
    const flatClasses = classes
      .map(x => typeof x === 'string' ? x : (x?.get?.('name') || ''))
      .filter(Boolean)
    const merged = { ...attrs }
    if (flatClasses.length) merged.class = flatClasses.join(' ')
    const attrStr = Object.entries(merged)
      .map(([k, v]) => v === '' ? k : `${k}="${escAttr(String(v))}"`)
      .join(' ')
    const newHtml = `<${value}${attrStr ? ' ' + attrStr : ''}>${innerHTML}</${value}>`
    const replaced = c.replaceWith(newHtml)
    const next = Array.isArray(replaced) ? replaced[0] : replaced
    if (next) editor.select(next)
    eventBus.emit('canvas:content-changed')
    return
  }

  // Generic attribute set: id, href, target, src, alt.
  // Empty string → drop the attribute so we don't write `id=""` on disk.
  if (value === '') {
    const next = { ...c.getAttributes?.() }
    delete next[field]
    c.setAttributes(next)
  } else {
    c.addAttributes({ [field]: value })
  }
  eventBus.emit('canvas:content-changed')
}

function fieldText(name, label, value) {
  return `<label class="gstrap-strip-field">
    <span>${escHtml(label)}</span>
    <input type="text" data-field="${escAttr(name)}" value="${escAttr(value)}">
  </label>`
}

function fieldSelect(name, label, value, options) {
  const opts = options.map(([v, lbl]) =>
    `<option value="${escAttr(v)}"${v === value ? ' selected' : ''}>${escHtml(lbl)}</option>`
  ).join('')
  return `<label class="gstrap-strip-field">
    <span>${escHtml(label)}</span>
    <select data-field="${escAttr(name)}">${opts}</select>
  </label>`
}

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
function escAttr(s) { return escHtml(s) }
