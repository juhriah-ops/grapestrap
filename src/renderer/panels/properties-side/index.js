/**
 * GrapeStrap — Properties side panel (right)
 *
 * v0.0.1: minimal — element type, ID, classes (chip list with remove buttons).
 * v0.0.2: full Style Manager replacement (7 sub-panels), Cascade view,
 * pseudo-class state bar.
 */

import { eventBus } from '../../state/event-bus.js'

let host = null
let currentComponent = null

export function renderProperties(target) {
  host = target
  host.classList.add('gstrap-props-host')
  setEmpty()
  eventBus.on('canvas:selected',   c => { currentComponent = c; renderForElement() })
  eventBus.on('canvas:deselected', () => { currentComponent = null; setEmpty() })
}

function setEmpty() {
  if (!host) return
  host.innerHTML = `<div class="gstrap-empty">Select an element on the canvas.</div>`
}

function renderForElement() {
  if (!host || !currentComponent) return
  const tag = currentComponent.get('tagName') || currentComponent.get('type')
  const id = currentComponent.getId() || ''
  const classes = currentComponent.getClasses() || []

  host.innerHTML = `
    <section class="gstrap-props-section">
      <h4>Element</h4>
      <div class="gstrap-prop-row"><label>Tag</label><span>${escHtml(tag)}</span></div>
      <div class="gstrap-prop-row"><label>ID</label><input type="text" data-field="id" value="${escAttr(id)}"></div>
    </section>
    <section class="gstrap-props-section">
      <h4>Classes</h4>
      <div class="gstrap-class-chips">
        ${classes.map(c => `<span class="gstrap-chip">${escHtml(c)}<button data-remove="${escAttr(c)}" title="Remove">×</button></span>`).join('')}
        <input type="text" class="gstrap-chip-input" data-field="add-class" placeholder="add-class…">
      </div>
    </section>
    <section class="gstrap-props-section">
      <h4>Style</h4>
      <div class="gstrap-empty">Class-first Style Manager arrives in v0.0.2.</div>
    </section>
  `

  host.querySelector('[data-field="id"]').addEventListener('change', evt => {
    currentComponent.setId(evt.target.value.trim())
  })
  host.querySelector('[data-field="add-class"]').addEventListener('keydown', evt => {
    if (evt.key !== 'Enter') return
    const v = evt.target.value.trim()
    if (!v) return
    const next = [...new Set([...currentComponent.getClasses(), v])]
    currentComponent.setClass(next)
    evt.target.value = ''
    renderForElement()
  })
  host.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = btn.dataset.remove
      currentComponent.setClass(currentComponent.getClasses().filter(c => c !== cls))
      renderForElement()
    })
  })
}

function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
function escAttr(s) { return escHtml(s) }
