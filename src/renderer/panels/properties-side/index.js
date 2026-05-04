/**
 * GrapeStrap — Properties side panel (right)
 *
 * Three sections, top-to-bottom:
 *   - Element : tag (read-only) + ID input
 *   - Classes : chip list with remove + add-class input
 *   - Style   : delegates to the Style Manager (panels/style-manager/), which
 *               renders an accordion of class-first sub-panels (Spacing,
 *               Display, Text in chunk A; Flex/Background/Border/Sizing in
 *               chunk B; pseudo-class state bar + Cascade view in chunk C).
 *
 * Class chip mutations here also fire `canvas:component-class-changed` via the
 * grapesjs-init bridge — which means picking a class from the chip input
 * re-renders the Style Manager's "Active" state in the same paint, and vice
 * versa. The two surfaces stay in sync without either knowing about the
 * other.
 */

import { eventBus } from '../../state/event-bus.js'
import { renderStyleManager } from '../style-manager/index.js'

let host = null
let currentComponent = null

export function renderProperties(target) {
  host = target
  host.classList.add('gstrap-props-host')
  setEmpty()
  eventBus.on('canvas:selected',   c => { currentComponent = c; renderForElement() })
  eventBus.on('canvas:deselected', () => { currentComponent = null; setEmpty() })
  // Keep chip list in sync if classes are mutated by the Style Manager or
  // any other source (Quick Tag, plugin commands, undo).
  eventBus.on('canvas:component-class-changed', c => {
    if (c === currentComponent) renderForElement()
  })
}

function setEmpty() {
  if (!host) return
  host.innerHTML = `
    <section class="gstrap-props-section gstrap-empty">
      Select an element on the canvas.
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
      <div data-region="style-manager"></div>
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

  const smHost = host.querySelector('[data-region="style-manager"]')
  if (smHost) renderStyleManager(smHost, () => currentComponent)
}

function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
function escAttr(s) { return escHtml(s) }
