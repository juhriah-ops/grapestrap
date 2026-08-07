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
import { showContextMenu } from '../../dialogs/context-menu.js'
import { bsDocsMenuItems } from '../../shortcuts/component-actions.js'
import { t } from '../../i18n.js'

let host = null
let currentComponent = null
let eventsWired = false

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
}

function setEmpty() {
  if (!host) return
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
    <section class="gstrap-props-section">
      <h4>${escHtml(t('props.style'))}</h4>
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

  // Right-click a class chip → "More info" deep-link into the Bootstrap
  // docs for that class (col-md-6 → Columns, …). Unrecognized classes get
  // a disabled explainer instead of a silent no-op (house toast rule).
  host.querySelectorAll('.gstrap-chip[data-class]').forEach(chip => {
    chip.addEventListener('contextmenu', evt => {
      evt.preventDefault()
      const items = bsDocsMenuItems([chip.dataset.class])
      showContextMenu(evt.clientX, evt.clientY, items.length > 0
        ? items.filter(i => !i.separator)
        : [{ label: t('ctx.bs-docs-none'), disabled: true, action: () => {} }])
    })
  })

  const smHost = host.querySelector('[data-region="style-manager"]')
  if (smHost) renderStyleManager(smHost, () => currentComponent)
}

function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
function escAttr(s) { return escHtml(s) }
