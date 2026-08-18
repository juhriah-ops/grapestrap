/**
 * GrapeStrap — Style Manager: Animation sub-panel
 *
 * PATH: src/renderer/panels/style-manager/animation.js
 * ROLE: The motion surface for ANY selected element — a scroll/page-load reveal
 *       with its timing, a hover preset, and a looping preset with its speed.
 *       Every control writes AUTHORED markup: `data-gs-anim-*` attributes the
 *       behaviors runtime (and its stylesheet) read. No inline styles, no
 *       per-project generated script, no panel-side store.
 * DEPENDS: ../../editor/behaviors.js, ../../editor/component-lock.js,
 *          ../../state/event-bus.js, ../../i18n.js, ../../log.js
 * CREATED: 2026-08-18
 *
 * ── Where each control stores its state ─────────────────────────────────────
 *   Reveal effect       `data-gs-anim` = fade | fade-up | fade-down |
 *                        fade-left | fade-right | zoom-in | zoom-out
 *   Trigger             `data-gs-anim-trigger` = load (omitted for the
 *                        runtime's default, scroll)
 *   Duration            `data-gs-anim-duration` in ms (omitted at 600)
 *   Delay               `data-gs-anim-delay` in ms (omitted at 0)
 *   Animate once        `data-gs-anim-once="0"` switches REPEAT on; the
 *                        attribute is absent for the default, once
 *   Hover preset        `data-gs-anim-hover` = grow | shrink | lift | glow |
 *                        underline
 *   Loop preset         `data-gs-anim-loop` = pulse | bounce | spin | float |
 *                        marquee | marquee-reverse
 *   Loop speed          `data-gs-anim-loop-speed` = slow | fast (omitted at
 *                        normal, which is what every preset already runs at)
 *
 * An attribute that only restates a runtime default is noise in the saved page,
 * so each of those settings REMOVES its attribute rather than writing the
 * default back. The attributes ARE the configuration: every render re-reads
 * them from the component, so a change made in the code view, an undo, or a
 * second panel is picked up for free.
 *
 * ── Runtime-owned classes ───────────────────────────────────────────────────
 * `gs-anim-pending` (hidden start state) and `gs-anim-in` (revealed) belong to
 * the runtime and are never authored onto a component. The Preview button adds
 * them to the CANVAS ELEMENT for the length of one replay and takes them off
 * again — see the Preview section below.
 *
 * ── Undo ────────────────────────────────────────────────────────────────────
 * One gesture writes attributes exactly once (a single `addAttributes` or a
 * single `removeAttributes`), which is one undo entry — including "Remove all
 * animation", which strips every `data-gs-anim*` attribute in that one call.
 * `ensureBehaviors()` is awaited BEFORE the write: it touches the manifest and
 * the project's asset folder, neither of which is on the canvas undo stack, so
 * an undo of the attribute leaves the (inert) runtime files behind — the same
 * posture a section insert has.
 */

import { ensureBehaviors } from '../../editor/behaviors.js'
import { isComponentLocked } from '../../editor/component-lock.js'
import { eventBus } from '../../state/event-bus.js'
import { t } from '../../i18n.js'
import { log } from '../../log.js'

export const id = 'animation'
export const labelKey = 'sm.panel.animation'

// Keep in step with assets/behaviors/gstrap-behaviors.js and its stylesheet.
const ATTR = {
  effect:    'data-gs-anim',
  trigger:   'data-gs-anim-trigger',
  duration:  'data-gs-anim-duration',
  delay:     'data-gs-anim-delay',
  once:      'data-gs-anim-once',
  hover:     'data-gs-anim-hover',
  loop:      'data-gs-anim-loop',
  loopSpeed: 'data-gs-anim-loop-speed'
}

// Everything the reveal owns, listed rather than prefix-matched: switching the
// reveal off must not take the hover or loop preset with it, and both of those
// live under the same `data-gs-anim-` prefix.
const REVEAL_ATTRS = [ATTR.effect, ATTR.trigger, ATTR.duration, ATTR.delay, ATTR.once]

// "Remove all animation" DOES want the prefix — the reveal family, hover, loop,
// speed, and anything a future runtime version adds under the same namespace.
const ANIM_ATTR_PREFIX = 'data-gs-anim'

// Runtime defaults (gstrap-behaviors.css's `var(…, 600ms)` / `var(…, 0ms)`).
// Writing either back as an attribute would say what the runtime already does.
const DEFAULT_DURATION_MS = 600
const DEFAULT_DELAY_MS = 0
// Below ~150ms a reveal reads as a flicker rather than a movement; above 2s the
// user is waiting for their own page. The steps are coarse on purpose — a
// slider that can land on 617ms invites a precision nobody needs.
const MIN_DURATION_MS = 150
const MAX_DURATION_MS = 2000
const MIN_DELAY_MS = 0
const MAX_DELAY_MS = 2000
const TIMING_STEP_MS = 50

// How long after duration+delay the preview gives up waiting for transitionend.
// One frame would do when the transition really runs; this covers the case
// where it never starts at all (behaviors stylesheet not in the canvas yet, a
// display:none ancestor, reduced motion) so the classes always come back off.
const PREVIEW_TAIL_MS = 200

const EFFECTS = [
  { value: '',           labelKey: 'sm.anim.off' },
  { value: 'fade',       labelKey: 'sm.anim.effect-fade' },
  { value: 'fade-up',    labelKey: 'sm.anim.effect-fade-up' },
  { value: 'fade-down',  labelKey: 'sm.anim.effect-fade-down' },
  { value: 'fade-left',  labelKey: 'sm.anim.effect-fade-left' },
  { value: 'fade-right', labelKey: 'sm.anim.effect-fade-right' },
  { value: 'zoom-in',    labelKey: 'sm.anim.effect-zoom-in' },
  { value: 'zoom-out',   labelKey: 'sm.anim.effect-zoom-out' }
]

const HOVER_PRESETS = [
  { value: '',          labelKey: 'sm.anim.off' },
  { value: 'grow',      labelKey: 'sm.anim.hover-grow' },
  { value: 'shrink',    labelKey: 'sm.anim.hover-shrink' },
  { value: 'lift',      labelKey: 'sm.anim.hover-lift' },
  { value: 'glow',      labelKey: 'sm.anim.hover-glow' },
  { value: 'underline', labelKey: 'sm.anim.hover-underline' }
]

const LOOP_PRESETS = [
  { value: '',                labelKey: 'sm.anim.off' },
  { value: 'pulse',           labelKey: 'sm.anim.loop-pulse' },
  { value: 'bounce',          labelKey: 'sm.anim.loop-bounce' },
  { value: 'spin',            labelKey: 'sm.anim.loop-spin' },
  { value: 'float',           labelKey: 'sm.anim.loop-float' },
  { value: 'marquee',         labelKey: 'sm.anim.loop-marquee' },
  { value: 'marquee-reverse', labelKey: 'sm.anim.loop-marquee-reverse' }
]

const LOOP_SPEEDS = [
  { value: 'slow',   labelKey: 'sm.anim.speed-slow' },
  { value: 'normal', labelKey: 'sm.anim.speed-normal' },
  { value: 'fast',   labelKey: 'sm.anim.speed-fast' }
]

const DEFAULT_LOOP_SPEED = 'normal'

// Both marquee directions clone their contents at run time, and that is the one
// loop preset whose behavior the markup alone does not explain.
const MARQUEE_LOOPS = new Set(['marquee', 'marquee-reverse'])

const VALID_EFFECTS = new Set(EFFECTS.map(option => option.value).filter(Boolean))
const VALID_HOVER = new Set(HOVER_PRESETS.map(option => option.value).filter(Boolean))
const VALID_LOOPS = new Set(LOOP_PRESETS.map(option => option.value).filter(Boolean))
const VALID_SPEEDS = new Set(LOOP_SPEEDS.map(option => option.value))

// Canvas element → the teardown of the replay currently running on it. A
// WeakMap rather than a Map so an element removed from the canvas mid-replay is
// not held alive by this module.
const runningPreviews = new WeakMap()

/**
 * Render the sub-panel for the current selection.
 *
 * Every element can be animated, so unlike the Navbar sub-panel there is no
 * context to resolve: the shell already guarantees a selection, and the
 * controls apply to whatever it is.
 *
 * @param {HTMLElement} host - The accordion body to render into
 * @param {object} ctx - Style Manager context: `{ component, requestRender }`
 * @returns {void}
 */
export function render(host, ctx) {
  const { component, requestRender } = ctx
  if (!component) return

  const locked = isComponentLocked(component)
  const state = readAnimationState(component)
  host.innerHTML = renderPanel(state, locked)

  // A locked element renders every control disabled and wires none of them: a
  // disabled <button>/<select>/<input> emits no events, so there is nothing for
  // a handler to guard against.
  if (locked) return
  wirePanel(host, component, state, requestRender)
}

/**
 * Everything one render needs, read fresh from the component's attributes.
 *
 * @param {object} component - The selected GrapesJS component
 * @returns {object} Panel state
 */
function readAnimationState(component) {
  const attributes = component.getAttributes?.() || {}
  const loop = readEnum(attributes[ATTR.loop], VALID_LOOPS, '')
  return {
    attributes,
    effect: readEnum(attributes[ATTR.effect], VALID_EFFECTS, ''),
    // Anything other than the explicit `load` behaves like `scroll` at run
    // time, so that is what the panel shows.
    triggerOnLoad: attributes[ATTR.trigger] === 'load',
    duration: clampDuration(attributes[ATTR.duration]),
    delay: clampDelay(attributes[ATTR.delay]),
    // The runtime tests for the exact string "0"; every other value (including
    // a missing attribute) means "reveal once".
    repeats: attributes[ATTR.once] === '0',
    hover: readEnum(attributes[ATTR.hover], VALID_HOVER, ''),
    loop,
    loopSpeed: readEnum(attributes[ATTR.loopSpeed], VALID_SPEEDS, DEFAULT_LOOP_SPEED),
    isMarquee: MARQUEE_LOOPS.has(loop),
    animAttributes: animationAttributeNames(attributes)
  }
}

/**
 * A stored attribute value reduced to one of the values this panel can show.
 *
 * Hand-authored markup (or a newer runtime) can carry something outside the
 * list; falling back keeps the control from silently displaying the first
 * option as if it were the truth.
 *
 * @param {string} raw - Attribute value
 * @param {Set<string>} allowed - The values the control offers
 * @param {string} fallback - What to show when `raw` is not one of them
 * @returns {string}
 */
function readEnum(raw, allowed, fallback) {
  return allowed.has(raw) ? raw : fallback
}

/**
 * True when the attribute is present at all, whatever its value.
 *
 * @param {object} attributes - Component attribute map
 * @param {string} name - Attribute name
 * @returns {boolean}
 */
function hasAttribute(attributes, name) {
  return Object.prototype.hasOwnProperty.call(attributes, name)
}

// ─── Pure helpers (unit-tested — see tests/unit/animation-panel.test.js) ─────

/**
 * A stored or dragged duration, reduced to a number the runtime can use.
 *
 * Shared by the reader and the slider handler on purpose: a value the panel
 * would DISPLAY as the default must also be the value it declines to write, or
 * the slider would sit at 600 while the page carried something else.
 *
 * @param {string|number} raw - Attribute value or raw slider value
 * @returns {number} ms within the slider's range; the runtime's own default for
 *          empty or unparseable input
 */
export function clampDuration(raw) {
  return clampMs(raw, MIN_DURATION_MS, MAX_DURATION_MS, DEFAULT_DURATION_MS)
}

/**
 * A stored or dragged delay, reduced to a number the runtime can use.
 *
 * @param {string|number} raw - Attribute value or raw slider value
 * @returns {number} ms within the slider's range; 0 (the runtime's default) for
 *          empty or unparseable input
 */
export function clampDelay(raw) {
  return clampMs(raw, MIN_DELAY_MS, MAX_DELAY_MS, DEFAULT_DELAY_MS)
}

/**
 * Shared millisecond clamp.
 *
 * `parseInt` tolerance matches the runtime's own read of these attributes, so
 * markup that says `600ms` is understood here exactly as the visitor's browser
 * will understand it.
 *
 * @param {string|number} raw - Value to reduce
 * @param {number} min - Lower bound
 * @param {number} max - Upper bound
 * @param {number} fallback - Result for empty or unparseable input
 * @returns {number}
 */
function clampMs(raw, min, max, fallback) {
  const parsed = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

/**
 * Every animation attribute present on a component, in a stable order.
 *
 * This is what "Remove all animation" removes and what decides whether that
 * button is enabled at all. Prefix-matched rather than listed, so an attribute
 * a newer runtime introduces is still cleared by the button that promises to
 * clear everything.
 *
 * @param {object} attributes - Component attribute map
 * @returns {string[]} Attribute names, sorted (a stable order keeps the single
 *          removeAttributes call — and the tests that pin it — deterministic)
 */
export function animationAttributeNames(attributes) {
  return Object.keys(attributes || {})
    .filter(name => name === ANIM_ATTR_PREFIX || name.startsWith(`${ANIM_ATTR_PREFIX}-`))
    .sort()
}

/**
 * The reveal-family attributes actually present on a component.
 *
 * Switching the effect to Off removes exactly these, in one call — filtered to
 * what is there so the gesture never turns into a no-op write that would still
 * cost an undo entry.
 *
 * @param {object} attributes - Component attribute map
 * @returns {string[]} Subset of REVEAL_ATTRS, in declaration order
 */
export function revealAttributesPresent(attributes) {
  return REVEAL_ATTRS.filter(name => hasAttribute(attributes || {}, name))
}

/**
 * Timing for one preview replay, read from the same attributes the runtime
 * reads and expressed the same way the stylesheet expects.
 *
 * @param {object} attributes - Component attribute map
 * @returns {{durationMs: number, delayMs: number, totalMs: number}} `totalMs`
 *          is how long the replay can possibly take, tail included — the
 *          deadline after which the transient classes come off regardless
 */
export function previewTimingFor(attributes) {
  const durationMs = clampDuration((attributes || {})[ATTR.duration])
  const delayMs = clampDelay((attributes || {})[ATTR.delay])
  return { durationMs, delayMs, totalMs: durationMs + delayMs + PREVIEW_TAIL_MS }
}

// ─── Markup ─────────────────────────────────────────────────────────────────

function renderPanel(state, locked) {
  const disabled = locked ? 'disabled' : ''
  return `
    <div class="gstrap-sm-anim-panel">
      ${locked ? `<div class="gstrap-sm-hint">${escHtml(t('sm.anim.locked'))}</div>` : ''}
      ${revealGroup(state, disabled)}
      ${hoverGroup(state, disabled)}
      ${loopGroup(state, disabled)}
      ${actionsRow(state, locked)}
    </div>
  `
}

/**
 * The reveal group. Trigger, timing and repeat only appear once an effect is
 * chosen — with no effect there is nothing for them to govern, and the runtime
 * ignores them outright.
 */
function revealGroup(state, disabled) {
  return `
    <div class="gstrap-sm-anim-group">
      <div class="gstrap-sm-anim-group-title">${escHtml(t('sm.anim.group-reveal'))}</div>
      ${selectRow({
        labelKey: 'sm.anim.effect',
        attribute: 'data-anim-effect',
        options: EFFECTS,
        current: state.effect,
        disabled
      })}
      ${state.effect ? `
        ${segmentedRow({
          labelKey: 'sm.anim.trigger',
          attribute: 'data-anim-trigger',
          options: [
            { value: 'scroll', labelKey: 'sm.anim.trigger-scroll' },
            { value: 'load',   labelKey: 'sm.anim.trigger-load' }
          ],
          current: state.triggerOnLoad ? 'load' : 'scroll',
          disabled
        })}
        ${sliderRow({
          labelKey: 'sm.anim.duration',
          attribute: 'data-anim-duration',
          min: MIN_DURATION_MS,
          max: MAX_DURATION_MS,
          value: state.duration,
          disabled
        })}
        ${sliderRow({
          labelKey: 'sm.anim.delay',
          attribute: 'data-anim-delay',
          min: MIN_DELAY_MS,
          max: MAX_DELAY_MS,
          value: state.delay,
          disabled
        })}
        ${segmentedRow({
          labelKey: 'sm.anim.once',
          attribute: 'data-anim-once',
          options: [
            { value: 'off', labelKey: 'sm.anim.off' },
            { value: 'on',  labelKey: 'sm.anim.on' }
          ],
          current: state.repeats ? 'off' : 'on',
          disabled,
          hintKey: state.repeats ? 'sm.anim.once-hint' : ''
        })}
      ` : ''}
    </div>
  `
}

function hoverGroup(state, disabled) {
  return `
    <div class="gstrap-sm-anim-group">
      <div class="gstrap-sm-anim-group-title">${escHtml(t('sm.anim.group-hover'))}</div>
      ${selectRow({
        labelKey: 'sm.anim.effect',
        attribute: 'data-anim-hover',
        options: HOVER_PRESETS,
        current: state.hover,
        disabled
      })}
      ${state.hover ? `<div class="gstrap-sm-hint">${escHtml(t('sm.anim.hover-hint'))}</div>` : ''}
    </div>
  `
}

function loopGroup(state, disabled) {
  return `
    <div class="gstrap-sm-anim-group">
      <div class="gstrap-sm-anim-group-title">${escHtml(t('sm.anim.group-loop'))}</div>
      ${selectRow({
        labelKey: 'sm.anim.effect',
        attribute: 'data-anim-loop',
        options: LOOP_PRESETS,
        current: state.loop,
        disabled
      })}
      ${state.loop ? `
        <div class="gstrap-sm-row">
          <label class="gstrap-sm-label">${escHtml(t('sm.anim.speed'))}</label>
          <div class="gstrap-sm-grid">
            ${LOOP_SPEEDS.map(option => `
              <button class="gstrap-sm-pill ${option.value === state.loopSpeed ? 'is-active' : ''}"
                      data-anim-speed="${escAttr(option.value)}" ${disabled}>${escHtml(t(option.labelKey))}</button>
            `).join('')}
          </div>
        </div>
      ` : ''}
      ${state.isMarquee ? `<div class="gstrap-sm-hint">${escHtml(t('sm.anim.marquee-hint'))}</div>` : ''}
    </div>
  `
}

/**
 * Preview and Remove-all.
 *
 * Preview needs a reveal to replay, and Remove-all needs something to remove —
 * each is disabled when its precondition is missing rather than being offered
 * as a button that does nothing.
 */
function actionsRow(state, locked) {
  const canPreview = !locked && !!state.effect
  const canClear = !locked && state.animAttributes.length > 0
  return `
    <div class="gstrap-sm-anim-actions">
      <button class="gstrap-sm-pill" data-anim-preview ${canPreview ? '' : 'disabled'}>${escHtml(t('sm.anim.preview'))}</button>
      <button class="gstrap-sm-pill gstrap-sm-clear" data-anim-clear ${canClear ? '' : 'disabled'}>${escHtml(t('sm.anim.clear-all'))}</button>
    </div>
  `
}

function selectRow({ labelKey, attribute, options, current, disabled }) {
  return `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-anim-control">
        <span class="gstrap-sm-label">${escHtml(t(labelKey))}</span>
        <select class="gstrap-sm-pseudo-input" ${attribute} ${disabled}>
          ${options.map(option => `
            <option value="${escAttr(option.value)}" ${option.value === current ? 'selected' : ''}>${escHtml(t(option.labelKey))}</option>
          `).join('')}
        </select>
      </label>
    </div>
  `
}

function segmentedRow({ labelKey, attribute, options, current, disabled, hintKey = '' }) {
  return `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${escHtml(t(labelKey))}</label>
      <div class="gstrap-sm-segs">
        ${options.map(option => `
          <button class="gstrap-sm-seg ${option.value === current ? 'is-active' : ''}"
                  ${attribute}="${escAttr(option.value)}" ${disabled}>${escHtml(t(option.labelKey))}</button>
        `).join('')}
      </div>
      ${hintKey ? `<div class="gstrap-sm-hint">${escHtml(t(hintKey))}</div>` : ''}
    </div>
  `
}

function sliderRow({ labelKey, attribute, min, max, value, disabled }) {
  const label = t(labelKey)
  return `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${escHtml(label)}</label>
      <div class="gstrap-sm-slider-row">
        <input type="range" class="gstrap-sm-slider" min="${min}" max="${max}" step="${TIMING_STEP_MS}"
               value="${escAttr(value)}" ${attribute} aria-label="${escAttr(label)}" ${disabled}>
        <span class="gstrap-sm-slider-readout" ${attribute}-readout>${escHtml(t('sm.anim.ms', { value }))}</span>
      </div>
    </div>
  `
}

// ─── Wiring ─────────────────────────────────────────────────────────────────

function wirePanel(host, component, state, requestRender) {
  wireReveal(host, component, state, requestRender)
  wireHover(host, component, state, requestRender)
  wireLoop(host, component, state, requestRender)

  host.querySelector('[data-anim-preview]')?.addEventListener('click', () => {
    firePreview(component)
  })

  host.querySelector('[data-anim-clear]')?.addEventListener('click', () => {
    commitAttributes(component, { remove: state.animAttributes }, requestRender)
  })
}

function wireReveal(host, component, state, requestRender) {
  host.querySelector('[data-anim-effect]')?.addEventListener('change', async event => {
    const effect = event.target.value
    if (!effect) {
      // Off clears the whole reveal family in one call — leaving a stray
      // duration or trigger behind would be dead weight in the saved page, and
      // would come back to life the moment an effect was chosen again.
      commitAttributes(component, { remove: revealAttributesPresent(state.attributes) }, requestRender)
      return
    }
    const committed = await commitAttributes(
      component, { set: { [ATTR.effect]: effect }, enabling: true }, requestRender)
    // Choosing an effect is the one gesture whose result is invisible until it
    // plays: the reveal's start state is runtime-owned, so the canvas shows
    // nothing at all. Play it once, immediately.
    if (committed) firePreview(component)
  })

  host.querySelectorAll('[data-anim-trigger]').forEach(button => {
    button.addEventListener('click', () => {
      const onLoad = button.dataset.animTrigger === 'load'
      if (onLoad) commitAttributes(component, { set: { [ATTR.trigger]: 'load' }, enabling: true }, requestRender)
      else commitAttributes(component, { remove: presentSubset(state.attributes, [ATTR.trigger]) }, requestRender)
    })
  })

  wireTimingSlider(host, component, requestRender, {
    attribute: 'data-anim-duration',
    name: ATTR.duration,
    clamp: clampDuration,
    defaultMs: DEFAULT_DURATION_MS,
    attributes: state.attributes
  })
  wireTimingSlider(host, component, requestRender, {
    attribute: 'data-anim-delay',
    name: ATTR.delay,
    clamp: clampDelay,
    defaultMs: DEFAULT_DELAY_MS,
    attributes: state.attributes
  })

  host.querySelectorAll('[data-anim-once]').forEach(button => {
    button.addEventListener('click', () => {
      // "Animate once" ON is the runtime's default, so it is stored as the
      // ABSENCE of the attribute; only the repeat case writes anything.
      const repeats = button.dataset.animOnce === 'off'
      if (repeats) commitAttributes(component, { set: { [ATTR.once]: '0' }, enabling: true }, requestRender)
      else commitAttributes(component, { remove: presentSubset(state.attributes, [ATTR.once]) }, requestRender)
    })
  })
}

/**
 * Wire one timing slider: readout on drag, attribute on release.
 *
 * @param {HTMLElement} host - Sub-panel body
 * @param {object} component - The selected component
 * @param {Function} [requestRender] - Style Manager re-render callback
 * @param {object} spec - `{ attribute, name, clamp, defaultMs, attributes }`
 * @returns {void}
 */
function wireTimingSlider(host, component, requestRender, spec) {
  const slider = host.querySelector(`[${spec.attribute}]`)
  const readout = host.querySelector(`[${spec.attribute}-readout]`)
  if (!slider) return

  // The readout tracks the thumb; the component is only touched on release, so
  // a drag doesn't write (and undo-stack) an attribute per pixel of travel.
  slider.addEventListener('input', () => {
    if (readout) readout.textContent = t('sm.anim.ms', { value: spec.clamp(slider.value) })
  })

  slider.addEventListener('change', () => {
    const ms = spec.clamp(slider.value)
    if (ms === spec.defaultMs) {
      commitAttributes(component, { remove: presentSubset(spec.attributes, [spec.name]) }, requestRender)
      return
    }
    commitAttributes(component, { set: { [spec.name]: String(ms) }, enabling: true }, requestRender)
  })
}

function wireHover(host, component, state, requestRender) {
  host.querySelector('[data-anim-hover]')?.addEventListener('change', event => {
    const preset = event.target.value
    if (!preset) {
      commitAttributes(component, { remove: presentSubset(state.attributes, [ATTR.hover]) }, requestRender)
      return
    }
    commitAttributes(component, { set: { [ATTR.hover]: preset }, enabling: true }, requestRender)
  })
}

function wireLoop(host, component, state, requestRender) {
  host.querySelector('[data-anim-loop]')?.addEventListener('change', event => {
    const preset = event.target.value
    if (!preset) {
      // The speed stays: it is the same setting whichever loop it governs, so
      // re-picking a preset should find the speed the user chose.
      commitAttributes(component, { remove: presentSubset(state.attributes, [ATTR.loop]) }, requestRender)
      return
    }
    commitAttributes(component, { set: { [ATTR.loop]: preset }, enabling: true }, requestRender)
  })

  host.querySelectorAll('[data-anim-speed]').forEach(button => {
    button.addEventListener('click', () => {
      const speed = button.dataset.animSpeed
      if (speed === state.loopSpeed) return   // re-picking the active speed is a no-op
      if (speed === DEFAULT_LOOP_SPEED) {
        commitAttributes(component, { remove: presentSubset(state.attributes, [ATTR.loopSpeed]) }, requestRender)
        return
      }
      commitAttributes(component, { set: { [ATTR.loopSpeed]: speed }, enabling: true }, requestRender)
    })
  })
}

/**
 * The subset of `names` actually present on the component.
 *
 * A `removeAttributes` call for attributes that were never there still rewrites
 * the attribute map, which registers an undo entry for a gesture that changed
 * nothing. Filtering first is what keeps Ctrl+Z counting real edits.
 *
 * @param {object} attributes - Component attribute map
 * @param {string[]} names - Candidate attribute names
 * @returns {string[]}
 */
function presentSubset(attributes, names) {
  return names.filter(name => hasAttribute(attributes || {}, name))
}

/**
 * Commit one attribute gesture on the component.
 *
 * Exactly one attribute write happens here — a single `addAttributes` or a
 * single `removeAttributes` — which is what makes the gesture one undo entry.
 *
 * @param {object} component - The selected component
 * @param {object} change - `{ set }` or `{ remove }`, plus `enabling` when the
 *        gesture switches a runtime-backed behavior ON
 * @param {Function} [requestRender] - Style Manager re-render callback
 * @returns {Promise<boolean>} true when something was written; false for a
 *          removal with nothing to remove, and for a failed write
 */
async function commitAttributes(component, { set = null, remove = null, enabling = false }, requestRender) {
  // Nothing to take off: skip the write entirely rather than spend an undo
  // entry on a no-op (see presentSubset).
  if (remove && !remove.length) return false
  if (enabling) await enableBehaviorsRuntime()

  try {
    if (remove) component.removeAttributes(remove)
    else if (set) component.addAttributes(set)
    else return false
  } catch (error) {
    // This can run a tick after the click (the runtime copy is awaited first),
    // so a throw here would otherwise become an unhandled rejection nobody sees
    // and a control that quietly snaps back on the next render. Say so instead.
    log.error('animation panel: attribute write failed:', error)
    eventBus.emit('toast', {
      type: 'error',
      message: t('toast.command-failed', { action: t('sm.panel.animation'), error: error?.message || error })
    })
    return false
  }

  eventBus.emit('canvas:content-changed', component)
  requestRender?.()
  return true
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
    log.warn('animation panel: behaviors runtime unavailable:', error?.message || error)
    eventBus.emit('toast', { type: 'warning', message: t('sm.anim.toast.behaviors-failed') })
  }
}

// ─── Preview ────────────────────────────────────────────────────────────────
//
// A reveal is invisible in the editor by design: the runtime JS is deliberately
// kept OUT of the canvas (reveals, marquee cloning and scroll listeners would
// fight editing), so nothing ever adds the runtime's classes there. Preview
// replays the runtime's exact choreography by hand, once:
//
//   1. add `gs-anim-pending` → the stylesheet's hidden start state for this
//      element's `data-gs-anim` value applies
//   2. force a reflow → the browser paints that start state, so there is a
//      "from" to transition out of. Without it the two class additions collapse
//      into one style recalculation and the element simply appears.
//   3. add `gs-anim-in` → its rule wins on source order at equal specificity
//      and carries the transition, exactly as it does for a real visitor. The
//      runtime leaves `gs-anim-pending` in place too, and so does this.
//   4. on transitionend (or a duration+delay+tail deadline) take both classes
//      and both custom properties back off.
//
// Nothing here touches the component: no model mutation, no undo entry, no
// `canvas:content-changed`, nothing serialized. `getHtml()` reads the component
// tree, so a save during a replay cannot capture the transient classes.
//
// A replay is best-effort by nature. Any attribute write on the same component
// makes GrapesJS rewrite the element's whole class attribute from the model,
// which strips the two runtime classes mid-flight — measured, and the reason a
// second replay CANCELS the one in front of it rather than being refused by it
// (see playPreview). Editing wins over a rehearsal, always.

/**
 * Replay the selected element's reveal on the canvas, once.
 *
 * @param {object} component - The selected component
 * @returns {void}
 */
function firePreview(component) {
  const element = component.getEl?.()
  if (!element) return   // never rendered, or the canvas was rebuilt under us

  // Synchronous on purpose. An auto-fired preview follows an attribute write,
  // and every start-state rule is keyed on that attribute being on the element
  // — but GrapesJS applies attributes to the view synchronously (Backbone
  // change events), so the attribute is already there, and the forced reflow
  // below is what actually guarantees the start state is computed. Deferring a
  // frame instead would make Preview depend on requestAnimationFrame, which an
  // unfocused or occluded Electron window does not necessarily run (measured:
  // no replay at all under xvfb).
  playPreview(element, previewTimingFor(component.getAttributes?.() || {}))
}

/**
 * Add the runtime's reveal classes to a canvas element, then take them off.
 *
 * @param {HTMLElement} element - The element in the canvas document
 * @param {object} timing - From previewTimingFor()
 * @returns {void}
 */
function playPreview(element, timing) {
  // Two overlapping replays would race over the same classes, and the older
  // one's cleanup would strip the newer one mid-transition. The NEWEST wins:
  // the request in hand reflects what the user just asked to see, so the one
  // already running is torn down rather than being allowed to refuse it.
  //
  // Refusing instead was measurably wrong. A replay's bookkeeping outlives its
  // visible half whenever an attribute is written mid-flight: GrapesJS rewrites
  // the element's whole class attribute from the model on any attribute change,
  // which silently strips the two runtime classes — so picking an effect and
  // then immediately dragging the duration slider left the panel refusing
  // Preview for up to duration+delay+200ms with nothing on screen to explain it.
  runningPreviews.get(element)?.()

  // Custom properties on a CANVAS element, set the same way and for the same
  // reason the runtime sets them in a visitor's browser (see the file header of
  // assets/behaviors/gstrap-behaviors.js): this is presentation applied at run
  // time to markup GrapeStrap never re-serializes, from the element's own
  // data-attributes — which stay the authored, diffable source of truth. It is
  // the documented exemption from the house no-inline-styles rule, and the
  // cleanup below removes both properties again.
  element.style.setProperty('--gs-anim-duration', `${timing.durationMs}ms`)
  element.style.setProperty('--gs-anim-delay', `${timing.delayMs}ms`)
  element.classList.add('gs-anim-pending')
  forceReflow(element)
  element.classList.add('gs-anim-in')

  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    clearTimeout(deadline)
    element.removeEventListener('transitionend', onTransitionEnd)
    element.classList.remove('gs-anim-pending', 'gs-anim-in')
    element.style.removeProperty('--gs-anim-duration')
    element.style.removeProperty('--gs-anim-delay')
    // Only if this replay is still the registered one: a newer replay has
    // already overwritten the entry with its own teardown by the time an older
    // one's deadline fires.
    if (runningPreviews.get(element) === finish) runningPreviews.delete(element)
  }

  // Opacity and transform transition together on the same clock, so the first
  // of them to land ends the replay. Transitions on DESCENDANTS bubble through
  // here as well — theirs are not this replay's to end.
  const onTransitionEnd = event => {
    if (event.target === element) finish()
  }

  element.addEventListener('transitionend', onTransitionEnd)
  const deadline = setTimeout(finish, timing.totalMs)
  runningPreviews.set(element, finish)
}

/**
 * Force a synchronous style/layout flush by reading a layout property.
 *
 * Its own function because a bare `element.offsetHeight` statement reads like
 * dead code and is exactly the kind of line a later cleanup deletes — taking
 * the animation with it.
 *
 * @param {HTMLElement} element - Element to measure
 * @returns {number} The measured height, deliberately unused by callers
 */
function forceReflow(element) {
  return element.offsetHeight
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

function escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
