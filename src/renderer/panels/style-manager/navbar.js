/**
 * GrapeStrap — Style Manager: Navbar sub-panel
 *
 * PATH: src/renderer/panels/style-manager/navbar.js
 * ROLE: The behavior surface for a Bootstrap navbar — page position, the
 *       background change on scroll (with its two swap colours), shrink,
 *       hide-on-scroll-down, and mobile-menu auto-close. Every control writes
 *       AUTHORED markup: Bootstrap position classes, `data-gs-nav-*`
 *       attributes the behaviors runtime reads at page load, and — for the two
 *       swap colours — real declarations in the project stylesheet. No inline
 *       styles, no per-project generated script.
 * DEPENDS: ./class-utils.js, ./css-rule-utils.js, ./bare-rule-store.js,
 *          ./selector-target.js, ../color-picker/index.js,
 *          ../../editor/behaviors.js, ../../editor/component-lock.js,
 *          ../../editor/placement.js, ../../state/event-bus.js,
 *          ../../i18n.js, ../../log.js
 * CREATED: 2026-08-18
 * UPDATED: 2026-08-18 — the Top colour writes `<selector>:not(.gs-nav-scrolled)`
 *          instead of the bare selector, and the row names the selector both
 *          rules are scoped to (and lets the user change it).
 *
 * ── Where each control stores its state ─────────────────────────────────────
 *   Position            classes `sticky-top` / `fixed-top` (class-first, so a
 *                       project with no behaviors runtime still gets it)
 *   Background on scroll `data-gs-nav-scroll` = solid | swap
 *   Threshold           `data-gs-nav-scroll-offset` (omitted at the runtime
 *                       default of 40px — an attribute that says what the
 *                       runtime already does is noise in the saved page)
 *   Swap colours        `background-color` on `<selector>:not(.gs-nav-scrolled)`
 *                       and on `<selector>.gs-nav-scrolled`, in project style.css
 *   Shrink              `data-gs-nav-shrink="1"`
 *   Hide on scroll down `data-gs-nav-hide="1"`
 *   Auto-close menu     `data-gs-nav-autoclose` = collapse | offcanvas
 *
 * The attributes ARE the configuration — every render re-reads them from the
 * component, together with the class list and the project stylesheet, so there
 * is no panel-side store that can drift from the page.
 *
 * ── Runtime-owned classes ───────────────────────────────────────────────────
 * `gs-nav-scrolled`, `gs-nav-shrunk` and `gs-nav-hidden` are added and removed
 * by the runtime in the visitor's browser and are never authored here. Both
 * swap-colour rules use that class as a selector SUFFIX — `.gs-nav-scrolled`
 * for the scrolled colour, `:not(.gs-nav-scrolled)` for the resting one —
 * which READS the contract rather than authoring the class onto the component.
 * They write `background-color` rather than the runtime's `--gs-nav-scrolled-bg`
 * custom property so the rules also win against a `bg-*` utility on the navbar
 * (the runtime's own `.gs-nav-scrolled` rule is one class weaker). Both colour
 * rules scope to a class the NAVBAR owns: `navbar`, `navbar-expand-*` and the
 * position utilities are ruled out as shared vocabulary, since a `.navbar { … }`
 * rule would repaint every navbar in the project; which of the remaining
 * classes is used is shown — and can be changed — in the row itself
 * (selector-target.js).
 *
 * ── Why the resting colour is a `:not()` and not the bare selector ──────────
 * It was the bare selector until 2026-08-18, and on any navbar whose theme
 * carries a two-class state rule the Top colour was simply invisible: the
 * Graphite starter's `.site-navbar.is-overlay { background: transparent }`
 * outranks `.site-navbar { background-color: … }`, so the resting bar never
 * changed while the Scrolled colour — a two-class rule itself — worked. Pairing
 * the two states at the same weight is also just the CSS a swap wants: the
 * navbar is one colour while it is not scrolled and another while it is.
 *
 * ── Undo ────────────────────────────────────────────────────────────────────
 * One gesture writes attributes exactly once (a single `addAttributes` or a
 * single `removeAttributes`), which is one undo entry. `ensureBehaviors()` is
 * awaited BEFORE that write: it touches the manifest and the project's asset
 * folder, neither of which is on the canvas undo stack, so an undo of the
 * attribute leaves the (inert) runtime files behind — the same posture a
 * section insert has.
 */

import { applyGroup, readGroup } from './class-utils.js'
import { isBsUtility } from './css-rule-utils.js'
import { readProjectRule, writeProjectRuleProps } from './bare-rule-store.js'
import { resolveTargetSelector, selectorTargetMarkup, wireSelectorTarget } from './selector-target.js'
import { openColorPicker } from '../color-picker/index.js'
import { ensureBehaviors } from '../../editor/behaviors.js'
import { isComponentLocked } from '../../editor/component-lock.js'
import { tagOf } from '../../editor/placement.js'
import { eventBus } from '../../state/event-bus.js'
import { t } from '../../i18n.js'
import { log } from '../../log.js'

export const id = 'navbar'
export const labelKey = 'sm.panel.navbar'

// Bootstrap's two pinned-navbar utilities. `fixed-bottom` is deliberately out:
// the runtime's hide-on-scroll and the shrink transition are written for a
// navbar at the top of the viewport.
const POSITION_PATTERN = /^(?:sticky-top|fixed-top)$/

const POSITIONS = [
  { value: '',           labelKey: 'sm.nav.position-static' },
  { value: 'sticky-top', labelKey: 'sm.nav.position-sticky' },
  { value: 'fixed-top',  labelKey: 'sm.nav.position-fixed' }
]

const SCROLL_MODES = [
  { value: '',      labelKey: 'sm.nav.off' },
  { value: 'solid', labelKey: 'sm.nav.scroll-solid' },
  { value: 'swap',  labelKey: 'sm.nav.scroll-swap' }
]

const AUTOCLOSE_MODES = [
  { value: '',          labelKey: 'sm.nav.off' },
  { value: 'collapse',  labelKey: 'sm.nav.autoclose-collapse' },
  { value: 'offcanvas', labelKey: 'sm.nav.autoclose-offcanvas' }
]

// Keep in step with assets/behaviors/gstrap-behaviors.js.
const ATTR = {
  scroll:    'data-gs-nav-scroll',
  offset:    'data-gs-nav-scroll-offset',
  shrink:    'data-gs-nav-shrink',
  hide:      'data-gs-nav-hide',
  autoclose: 'data-gs-nav-autoclose'
}
const DEFAULT_SCROLL_OFFSET = 40   // DEFAULT_NAV_OFFSET in the runtime
const MAX_SCROLL_OFFSET = 2000     // a threshold past a long page is a typo, not a setting
const SCROLLED_SUFFIX = '.gs-nav-scrolled'
const RESTING_SUFFIX = ':not(.gs-nav-scrolled)'
const SWAP_COLOR_PROP = 'background-color'

// Ancestor walks are bounded so a malformed tree (or a hand-built stub in a
// unit test) can never spin here.
const MAX_ANCESTOR_STEPS = 50

// Bootstrap's navbar vocabulary is shared by every navbar in a project, so a
// colour rule scoped to `.navbar` (or to `.sticky-top`) would repaint all of
// them — and pickSelector, which is deliberately conservative about what it
// calls a utility, would otherwise pick exactly those. Ruling them out here
// binds the swap colours to the navbar's OWN class, or asks the user for one.
const SHARED_NAVBAR_CLASSES = /^(?:navbar(?:-.+)?|(?:sticky|fixed)-(?:top|bottom))$/

/**
 * Render the sub-panel for whatever navbar the current selection belongs to.
 *
 * @param {HTMLElement} host - The accordion body to render into
 * @param {object} ctx - Style Manager context: `{ component, requestRender }`
 * @returns {void}
 */
export function render(host, ctx) {
  const { component, requestRender } = ctx
  const navbar = resolveNavbar(component)

  // Nothing navbar-shaped in the selection's ancestry is the ordinary case for
  // most of a page — a hint, not an error.
  if (!navbar) {
    host.innerHTML = `<div class="gstrap-sm-hint">${escHtml(t('sm.nav.no-navbar'))}</div>`
    return
  }

  const locked = isComponentLocked(navbar)
  const state = readNavbarState(navbar)
  host.innerHTML = renderPanel(state, locked)
  // Painting is independent of wiring — a locked navbar still SHOWS the
  // colours it was given.
  paintColorChips(host)

  // A locked navbar renders every control disabled and wires none of them:
  // a disabled <button>/<select> emits no events, so there is nothing for a
  // handler to guard against.
  if (locked) return
  wirePanel(host, navbar, state, requestRender)
}

/**
 * Find the `<nav class="navbar">` a selection belongs to.
 *
 * Two acceptances, both deliberately narrow so that selecting an ordinary
 * paragraph on a page that happens to have a navbar does NOT put navbar
 * controls in front of the user:
 *   1. The selection itself, or any ancestor up to the wrapper, IS the navbar.
 *   2. The selection is a `<header>` whose DIRECT child is the navbar — the
 *      shape every harvested navbar section ships as, where clicking the band
 *      selects the header rather than the nav inside it.
 *
 * @param {object} component - Selected GrapesJS component (Backbone model)
 * @returns {object|null} The navbar component, or null when there is none
 */
export function resolveNavbar(component) {
  if (!component) return null

  if (tagOf(component) === 'header') {
    const child = findDirectChild(component, isNavbar)
    if (child) return child
  }

  let current = component
  let steps = 0
  while (current && steps < MAX_ANCESTOR_STEPS) {
    if (isNavbar(current)) return current
    // The wrapper/body root has no parent, which ends the walk on its own.
    current = current.parent?.() || null
    steps += 1
  }
  return null
}

/** True for a `<nav>` carrying Bootstrap's `navbar` class. */
function isNavbar(component) {
  if (tagOf(component) !== 'nav') return false
  return (component.getClasses?.() || []).includes('navbar')
}

/**
 * First direct child of `component` satisfying `predicate`.
 *
 * @param {object} component - GrapesJS component
 * @param {Function} predicate - Called with each child component
 * @returns {object|null}
 */
function findDirectChild(component, predicate) {
  const children = component.components?.() || []
  for (const child of children) if (predicate(child)) return child
  return null
}

/**
 * Everything one render needs, read fresh from the component and the project
 * stylesheet. There is no cache: an attribute changed from the code view, an
 * undo, or a second panel is picked up on the next render for free.
 *
 * @param {object} navbar - The resolved navbar component
 * @returns {object} Panel state
 */
function readNavbarState(navbar) {
  const attributes = navbar.getAttributes?.() || {}
  const selector = resolveTargetSelector(navbar, SWAP_COLOR_PROP, isSharedNavbarClass)
  const topSelector = selector ? selector + RESTING_SUFFIX : null
  const scrolledSelector = selector ? selector + SCROLLED_SUFFIX : null
  return {
    // The component travels with the state so the colour row can offer the
    // navbar's other classes as targets without a second lookup.
    navbar,
    position: readGroup(navbar, POSITION_PATTERN),
    scrollMode: readScrollMode(attributes),
    offset: clampScrollOffset(attributes[ATTR.offset]),
    shrink: hasAttribute(attributes, ATTR.shrink),
    hide: hasAttribute(attributes, ATTR.hide),
    autoclose: readAutoclose(attributes[ATTR.autoclose]),
    detectedAutoclose: detectTogglerMechanism(navbar),
    selector,
    topSelector,
    scrolledSelector,
    topColor: readProjectRule(topSelector)[SWAP_COLOR_PROP] || '',
    scrolledColor: readProjectRule(scrolledSelector)[SWAP_COLOR_PROP] || ''
  }
}

/**
 * Classes a colour rule must NOT be scoped to: the generic Bootstrap utilities
 * every sub-panel excludes, plus the navbar vocabulary this one shares with
 * every other navbar in the project.
 *
 * @param {string} cls - Class name
 * @returns {boolean} true when the class is framework vocabulary, not identity
 */
function isSharedNavbarClass(cls) {
  return isBsUtility(cls) || SHARED_NAVBAR_CLASSES.test(cls)
}

/**
 * True when the attribute is present at all. Presence — not the value — is
 * what the runtime tests (`hasAttribute`), so reading it the same way keeps
 * the panel's picture of the page and the visitor's experience in agreement,
 * including for hand-authored markup that carries an empty value.
 *
 * @param {object} attributes - Component attribute map
 * @param {string} name - Attribute name
 * @returns {boolean}
 */
function hasAttribute(attributes, name) {
  return Object.prototype.hasOwnProperty.call(attributes, name)
}

// `swap` is the only value with its own styling contract; any other present
// value behaves like `solid` at run time (the runtime toggles the same class
// whatever the value says), so that is what the panel shows.
function readScrollMode(attributes) {
  if (!hasAttribute(attributes, ATTR.scroll)) return ''
  return attributes[ATTR.scroll] === 'swap' ? 'swap' : 'solid'
}

function readAutoclose(raw) {
  return raw === 'collapse' || raw === 'offcanvas' ? raw : ''
}

/**
 * A stored or typed threshold, reduced to a number the runtime can use.
 *
 * Shared by the reader and the input handler on purpose: a value the panel
 * would DISPLAY as the default must also be the value it declines to write, or
 * the box would show 40 while the page carried something else.
 *
 * @param {string|number} raw - Attribute value or raw input value
 * @returns {number} px offset; the runtime's own default for empty, junk or
 *          non-positive input, which is exactly what the runtime falls back to
 */
export function clampScrollOffset(raw) {
  const parsed = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SCROLL_OFFSET
  return Math.min(parsed, MAX_SCROLL_OFFSET)
}

/**
 * Which Bootstrap menu mechanism this navbar's toggler actually opens.
 *
 * The toggler's `data-bs-toggle` is the authored truth (Bootstrap itself reads
 * it), so the panel can tell the user which auto-close mode fits instead of
 * making them work it out from the markup. A `.navbar-toggler` wins over any
 * other toggle inside the nav — a dropdown or modal trigger in the menu is not
 * the mobile-menu opener.
 *
 * @param {object} navbar - The navbar component
 * @returns {string} 'collapse', 'offcanvas', or '' when nothing was found
 */
function detectTogglerMechanism(navbar) {
  const fromToggler = findDescendant(navbar, component =>
    (component.getClasses?.() || []).includes('navbar-toggler') && !!menuMechanismOf(component))
  if (fromToggler) return menuMechanismOf(fromToggler)

  const fromAnyToggle = findDescendant(navbar, component => !!menuMechanismOf(component))
  return fromAnyToggle ? menuMechanismOf(fromAnyToggle) : ''
}

function menuMechanismOf(component) {
  const mode = (component.getAttributes?.() || {})['data-bs-toggle']
  return mode === 'collapse' || mode === 'offcanvas' ? mode : ''
}

/**
 * Depth-first search of a component's subtree.
 *
 * @param {object} component - Root of the search (not itself tested)
 * @param {Function} predicate - Called with each descendant
 * @returns {object|null} First match in document order, or null
 */
function findDescendant(component, predicate) {
  const children = component.components?.() || []
  for (const child of children) {
    if (predicate(child)) return child
    const deeper = findDescendant(child, predicate)
    if (deeper) return deeper
  }
  return null
}

// ─── Markup ─────────────────────────────────────────────────────────────────

function renderPanel(state, locked) {
  const disabled = locked ? 'disabled' : ''
  // Hide-on-scroll only does something for a navbar that stays in the
  // viewport; the runtime checks the computed position and skips the rest.
  const isPinned = state.position !== ''
  return `
    <div class="gstrap-sm-nav-panel">
      ${locked ? `<div class="gstrap-sm-hint">${escHtml(t('sm.nav.locked'))}</div>` : ''}
      ${positionRow(state, disabled)}
      ${scrollRow(state, disabled)}
      ${state.scrollMode === 'swap' ? swapColorsRow(state, disabled) : ''}
      ${showsThreshold(state) ? thresholdRow(state, disabled) : ''}
      ${toggleRow({
        labelKey: 'sm.nav.shrink',
        attribute: ATTR.shrink,
        isOn: state.shrink,
        disabled
      })}
      ${toggleRow({
        labelKey: 'sm.nav.hide',
        attribute: ATTR.hide,
        isOn: state.hide,
        disabled: locked || !isPinned ? 'disabled' : '',
        hintKey: isPinned ? '' : 'sm.nav.hide-needs-pinned'
      })}
      ${autocloseRow(state, disabled)}
    </div>
  `
}

// The threshold drives the scrolled, shrunk AND hidden states, so it belongs
// on screen whenever any of the three is switched on.
function showsThreshold(state) {
  return state.scrollMode !== '' || state.shrink || state.hide
}

function positionRow(state, disabled) {
  return `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${escHtml(t('sm.label.position'))}</label>
      <div class="gstrap-sm-segs">
        ${POSITIONS.map(option => `
          <button class="gstrap-sm-seg ${option.value === state.position ? 'is-active' : ''}"
                  data-nav-position="${escAttr(option.value)}" ${disabled}>${escHtml(t(option.labelKey))}</button>
        `).join('')}
      </div>
      ${state.position === 'fixed-top'
        ? `<div class="gstrap-sm-hint">${escHtml(t('sm.nav.fixed-hint'))}</div>`
        : ''}
    </div>
  `
}

function scrollRow(state, disabled) {
  return `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-nav-control">
        <span class="gstrap-sm-label">${escHtml(t('sm.nav.scroll'))}</span>
        <select class="gstrap-sm-pseudo-input" data-nav-scroll-mode ${disabled}>
          ${SCROLL_MODES.map(option => `
            <option value="${escAttr(option.value)}" ${option.value === state.scrollMode ? 'selected' : ''}>${escHtml(t(option.labelKey))}</option>
          `).join('')}
        </select>
      </label>
    </div>
  `
}

function swapColorsRow(state, disabled) {
  // A navbar wearing nothing but Bootstrap's own navbar classes has no
  // selector we can scope a colour to without repainting every other navbar in
  // the project, so the row asks for one instead — the same shape of hint the
  // opacity slider and the background-image row use.
  if (!state.selector) {
    return `
      <div class="gstrap-sm-row">
        <label class="gstrap-sm-label">${escHtml(t('sm.nav.swap-colors'))}</label>
        <div class="gstrap-sm-hint">${escHtml(t('sm.nav.colors-need-selector'))}</div>
      </div>
    `
  }
  return `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${escHtml(t('sm.nav.swap-colors'))}</label>
      <div class="gstrap-sm-nav-colors">
        ${colorChip('top', 'sm.nav.color-top', state.topColor, disabled)}
        ${colorChip('scrolled', 'sm.nav.color-scrolled', state.scrolledColor, disabled)}
      </div>
      ${selectorTargetMarkup({
        component: state.navbar,
        prop: SWAP_COLOR_PROP,
        selected: state.selector,
        isExcluded: isSharedNavbarClass,
        disabled
      })}
    </div>
  `
}

/**
 * One swap-colour chip. The swatch fill travels as the `--swatch` custom
 * property set from JS (paintChip below) exactly like the Custom colour row's
 * chip, so no colour value is ever written into a style attribute.
 *
 * @param {string} key - 'top' or 'scrolled' — which rule the chip owns
 * @param {string} labelKey - i18n key for the chip's caption
 * @param {string} value - Current colour, '' when unset
 * @param {string} disabled - '' or the literal 'disabled' attribute
 * @returns {string} HTML
 */
function colorChip(key, labelKey, value, disabled) {
  const label = t(labelKey)
  return `
    <div class="gstrap-sm-nav-color">
      <button type="button" class="gstrap-sm-nav-chip ${value ? 'is-active' : ''}"
              data-nav-color="${escAttr(key)}" data-nav-color-value="${escAttr(value)}"
              title="${escAttr(value || label)}"
              aria-label="${escAttr(t('sm.pick-aria', { label }))}" ${disabled}>
        <span class="gstrap-sm-nav-chip-swatch" data-nav-color-swatch></span>
        <span class="gstrap-sm-nav-chip-label">${escHtml(label)}</span>
      </button>
      <button class="gstrap-sm-pill gstrap-sm-clear" data-nav-color-clear="${escAttr(key)}" ${disabled}>${escHtml(t('action.clear'))}</button>
    </div>
  `
}

function thresholdRow(state, disabled) {
  return `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-nav-control">
        <span class="gstrap-sm-label">${escHtml(t('sm.nav.threshold'))}</span>
        <input type="number" class="gstrap-sm-pseudo-input gstrap-sm-nav-number"
               min="0" max="${MAX_SCROLL_OFFSET}" step="1" value="${escAttr(state.offset)}"
               data-nav-offset ${disabled}>
      </label>
      <div class="gstrap-sm-hint">${escHtml(t('sm.nav.threshold-hint'))}</div>
    </div>
  `
}

function toggleRow({ labelKey, attribute, isOn, disabled, hintKey = '' }) {
  return `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${escHtml(t(labelKey))}</label>
      <div class="gstrap-sm-segs">
        <button class="gstrap-sm-seg ${isOn ? '' : 'is-active'}"
                data-nav-toggle="${escAttr(attribute)}" data-nav-toggle-to="off" ${disabled}>${escHtml(t('sm.nav.off'))}</button>
        <button class="gstrap-sm-seg ${isOn ? 'is-active' : ''}"
                data-nav-toggle="${escAttr(attribute)}" data-nav-toggle-to="on" ${disabled}>${escHtml(t('sm.nav.on'))}</button>
      </div>
      ${hintKey ? `<div class="gstrap-sm-hint">${escHtml(t(hintKey))}</div>` : ''}
    </div>
  `
}

function autocloseRow(state, disabled) {
  return `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-nav-control">
        <span class="gstrap-sm-label">${escHtml(t('sm.nav.autoclose'))}</span>
        <select class="gstrap-sm-pseudo-input" data-nav-autoclose ${disabled}>
          ${AUTOCLOSE_MODES.map(option => `
            <option value="${escAttr(option.value)}" ${option.value === state.autoclose ? 'selected' : ''}>${escHtml(autocloseOptionLabel(option, state.detectedAutoclose))}</option>
          `).join('')}
        </select>
      </label>
    </div>
  `
}

// The mode this navbar's own toggler opens is marked in the list, so picking
// the right one is a read rather than a guess.
function autocloseOptionLabel(option, detected) {
  const label = t(option.labelKey)
  if (!option.value || option.value !== detected) return label
  return t('sm.nav.autoclose-detected', { label })
}

// ─── Wiring ─────────────────────────────────────────────────────────────────

function wirePanel(host, navbar, state, requestRender) {
  host.querySelectorAll('[data-nav-position]').forEach(button => {
    button.addEventListener('click', () => {
      const next = button.dataset.navPosition
      // Clicking the active position again is a no-op rather than a toggle —
      // "Static" is already the way to switch a pinned navbar off.
      if (next === state.position) return
      applyGroup(navbar, POSITION_PATTERN, next || null)
      eventBus.emit('canvas:content-changed', navbar)
      requestRender?.()
    })
  })

  host.querySelector('[data-nav-scroll-mode]')?.addEventListener('change', event => {
    const mode = event.target.value
    if (!mode) {
      // The offset stays: it still drives shrink and hide, and re-enabling the
      // background swap should find the threshold the user chose.
      commitAttributes(navbar, { remove: [ATTR.scroll] }, requestRender)
      return
    }
    commitAttributes(navbar, { set: { [ATTR.scroll]: mode }, enabling: true }, requestRender)
  })

  // Commit on 'change' (blur / Enter / spinner), never on 'input': a threshold
  // typed digit by digit would otherwise write "4" before "40".
  host.querySelector('[data-nav-offset]')?.addEventListener('change', event => {
    const offset = clampScrollOffset(event.target.value)
    if (offset === DEFAULT_SCROLL_OFFSET) {
      commitAttributes(navbar, { remove: [ATTR.offset] }, requestRender)
      return
    }
    commitAttributes(navbar, { set: { [ATTR.offset]: String(offset) }, enabling: true }, requestRender)
  })

  host.querySelectorAll('[data-nav-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const attribute = button.dataset.navToggle
      const turningOn = button.dataset.navToggleTo === 'on'
      if (turningOn) commitAttributes(navbar, { set: { [attribute]: '1' }, enabling: true }, requestRender)
      else commitAttributes(navbar, { remove: [attribute] }, requestRender)
    })
  })

  host.querySelector('[data-nav-autoclose]')?.addEventListener('change', event => {
    const mode = event.target.value
    if (!mode) {
      commitAttributes(navbar, { remove: [ATTR.autoclose] }, requestRender)
      return
    }
    commitAttributes(navbar, { set: { [ATTR.autoclose]: mode }, enabling: true }, requestRender)
  })

  wireColorChips(host, state, requestRender)
}

/**
 * Wire both swap-colour chips and the target picker they share. Each chip owns
 * `background-color` on one rule: the navbar's selector plus `:not(.gs-nav-scrolled)`
 * for the top-of-page colour, and that selector plus the runtime's
 * `.gs-nav-scrolled` class for the scrolled one.
 *
 * @param {HTMLElement} host - Sub-panel body
 * @param {object} state - Panel state (carries the navbar and both selectors)
 * @param {Function} [requestRender] - Style Manager re-render callback
 * @returns {void}
 */
function wireColorChips(host, state, requestRender) {
  const selectorFor = key => (key === 'scrolled' ? state.scrolledSelector : state.topSelector)

  // Retargeting rewires both chips: the pair always describes ONE navbar's two
  // states, so they share a base selector by construction.
  wireSelectorTarget(host, { component: state.navbar, prop: SWAP_COLOR_PROP, requestRender })

  host.querySelectorAll('[data-nav-color]').forEach(chip => {
    chip.addEventListener('click', () => {
      openColorPicker({
        anchor: chip,
        value: chip.dataset.navColorValue || '',
        // Fires per keystroke in the picker as well as on swatch commits, so
        // the canvas previews live. Writing the rule emits
        // 'project:css-changed', which re-renders this sub-panel and detaches
        // `chip`; the picker lives in the modal layer and survives, and every
        // value here is captured in the closure, so the detached node costs us
        // nothing but its own repaint.
        onChange: next => {
          const value = String(next ?? '').trim()
          chip.dataset.navColorValue = value
          paintChip(chip, value)
          writeProjectRuleProps(selectorFor(chip.dataset.navColor), { [SWAP_COLOR_PROP]: value })
        },
        onClose: () => requestRender?.()
      })
    })
  })

  host.querySelectorAll('[data-nav-color-clear]').forEach(button => {
    button.addEventListener('click', () => {
      writeProjectRuleProps(selectorFor(button.dataset.navColorClear), { [SWAP_COLOR_PROP]: '' })
      requestRender?.()
    })
  })
}

/**
 * Commit one attribute gesture on the navbar.
 *
 * Exactly one attribute write happens here — a single `addAttributes` or a
 * single `removeAttributes` — which is what makes the gesture one undo entry.
 *
 * @param {object} navbar - The navbar component
 * @param {object} change - `{ set }` or `{ remove }`, plus `enabling` when the
 *        gesture switches a runtime-backed behavior ON
 * @param {Function} [requestRender] - Style Manager re-render callback
 * @returns {Promise<void>} Resolved after the write; callers fire and forget
 */
async function commitAttributes(navbar, { set = null, remove = null, enabling = false }, requestRender) {
  if (enabling) await enableBehaviorsRuntime()

  try {
    if (remove) navbar.removeAttributes(remove)
    else if (set) navbar.addAttributes(set)
  } catch (error) {
    // This runs a tick after the click (the runtime copy is awaited first), so
    // a throw here becomes an unhandled rejection nobody sees and a control
    // that quietly snaps back on the next render. Say so instead.
    log.error('navbar panel: attribute write failed:', error)
    eventBus.emit('toast', {
      type: 'error',
      message: t('toast.command-failed', { action: t('sm.panel.navbar'), error: error?.message || error })
    })
    return
  }

  eventBus.emit('canvas:content-changed', navbar)
  requestRender?.()
}

/**
 * Make sure the behaviors runtime is in the project before an attribute that
 * needs it lands.
 *
 * Idempotent and cheap, so it runs on every enabling gesture rather than only
 * the first. A failure is reported and swallowed: the attribute is still
 * authored correctly and starts working as soon as a later call succeeds, so
 * refusing the edit would be worse than a warning.
 *
 * @returns {Promise<void>}
 */
async function enableBehaviorsRuntime() {
  try {
    await ensureBehaviors()
  } catch (error) {
    // No project open, or the copy failed (missing bridge, read-only folder).
    log.warn('navbar panel: behaviors runtime unavailable:', error?.message || error)
    eventBus.emit('toast', { type: 'warning', message: t('sm.nav.toast.behaviors-failed') })
  }
}

/**
 * Fill in every rendered chip's swatch. Separate from wiring so a locked
 * navbar still shows its colours.
 *
 * @param {HTMLElement} host - Sub-panel body
 * @returns {void}
 */
function paintColorChips(host) {
  host.querySelectorAll('[data-nav-color]').forEach(chip => {
    paintChip(chip, chip.dataset.navColorValue || '')
  })
}

// Paint a chip from its value: swatch fill, active outline, tooltip. An unset
// chip shows `transparent` so it stays readable against the panel background.
function paintChip(chip, value) {
  chip.querySelector('[data-nav-color-swatch]')?.style.setProperty('--swatch', value || 'transparent')
  chip.classList.toggle('is-active', !!value)
  chip.title = value || chip.querySelector('.gstrap-sm-nav-chip-label')?.textContent || ''
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

function escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
