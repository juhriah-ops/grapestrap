/**
 * GrapeStrap — Property Inspector strip (bottom)
 *
 * Context-aware: contents change with the currently selected element. v0.0.1
 * ships handlers for 5 element types per the v4 plan; the rest of the matrix
 * lands in v0.0.2 alongside the full Style Manager.
 *
 * For unselected: shows guidance text.
 */

import { eventBus } from '../../state/event-bus.js'

let host = null

export function renderPropertyStrip(target) {
  host = target
  setEmptyState()
  eventBus.on('canvas:selected', renderForElement)
  eventBus.on('canvas:deselected', setEmptyState)
}

function setEmptyState() {
  if (!host) return
  host.innerHTML = `<span class="gstrap-strip-hint">Select an element on the canvas to edit its properties.</span>`
}

function renderForElement(component) {
  if (!host || !component) return
  const tag = component.get('tagName') || component.get('type')
  // v0.0.1 generic strip — element-specific UIs land in v0.0.2
  host.innerHTML = `
    <span class="gstrap-strip-tag">${escHtml(tag)}</span>
    <span class="gstrap-strip-sep">·</span>
    <label class="gstrap-strip-field">
      <span>Classes</span>
      <input type="text" data-field="classes" value="${escAttr((component.getClasses() || []).join(' '))}">
    </label>
  `
  host.querySelector('[data-field="classes"]').addEventListener('change', evt => {
    const value = evt.target.value.trim()
    component.setClass(value.split(/\s+/).filter(Boolean))
    eventBus.emit('element:classes-changed', { component, classes: value })
  })
}

function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
function escAttr(s) { return escHtml(s) }
