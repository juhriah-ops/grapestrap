/**
 * GrapeStrap — Style Manager: Display sub-panel
 *
 * Display type, visibility and opacity, with per-breakpoint variants for
 * display (the `[xs sm md lg xl xxl]` strip at the top of the panel governs
 * which `d-<bp>-<value>` class gets written; `xs` writes the bare
 * `d-<value>`).
 *
 * Opacity is the one row with two storage backends: the five BS step classes
 * (`opacity-0` … `opacity-100`) and, for anything between them, a real
 * `opacity` declaration on the component's rule in project style.css. The
 * slider needs a usable selector for that rule; without one it renders the
 * same "add a class first" hint the Background image row uses.
 *
 * Per-breakpoint storage:
 *   - The user can have d-none AND d-md-flex on the same component (BS-typical
 *     "hidden on mobile, flex on tablet+"). So the DISPLAY pattern is scoped
 *     by breakpoint when stripping prior selections — switching breakpoints
 *     and clicking Block doesn't wipe the other breakpoint's class.
 */

import {
  BREAKPOINTS, DISPLAY_VALUES, VISIBILITY_VALUES, OPACITY,
  displayClass, visibilityPattern, opacityPattern
} from './bs-classes.js'
import { applyGroup, readGroup } from './class-utils.js'
import { pickSelector, isBsUtility } from './css-rule-utils.js'
import { readProjectRule, writeProjectRuleProps } from './bare-rule-store.js'
import { t } from '../../i18n.js'

let activeBreakpoint = ''  // '' = xs (default)

export const id = 'display'
export const labelKey = 'sm.panel.display'

export function render(host, ctx) {
  const { component, requestRender } = ctx
  const bp = activeBreakpoint
  const curDisplay = readForBreakpoint(component, bp)
  const curVis = readGroup(component, visibilityPattern())

  // Opacity has both surfaces: five BS steps as classes, anything in between
  // as an `opacity` declaration on the component's own rule in style.css.
  const selector = pickSelector(component, isBsUtility)
  const curOpacityClass = readGroup(component, opacityPattern())
  const ruleOpacity = readProjectRule(selector).opacity || ''
  const opacityPercent = sliderPercentFor(ruleOpacity, curOpacityClass)

  host.innerHTML = `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${escHtml(t('sm.label.breakpoint'))}</label>
      <div class="gstrap-sm-segs" data-prop="bp">
        ${BREAKPOINTS.map(b => `
          <button class="gstrap-sm-seg ${b === bp ? 'is-active' : ''}"
                  data-bp="${b}">${b || 'xs'}</button>
        `).join('')}
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${escHtml(t('sm.label.display'))}</label>
      <div class="gstrap-sm-grid">
        ${DISPLAY_VALUES.map(v => {
          const cls = displayClass(v.value, bp)
          return `<button class="gstrap-sm-pill ${curDisplay === cls ? 'is-active' : ''}"
                          data-display="${v.value}" title="${cls}">${v.label}</button>`
        }).join('')}
        <button class="gstrap-sm-pill gstrap-sm-clear" data-display-clear>${escHtml(t('action.clear'))}</button>
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${escHtml(t('sm.label.visibility'))}</label>
      <div class="gstrap-sm-grid">
        ${VISIBILITY_VALUES.map(v =>
          `<button class="gstrap-sm-pill ${curVis === v.value ? 'is-active' : ''}"
                   data-vis="${v.value}">${v.label}</button>`
        ).join('')}
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${escHtml(t('sm.label.opacity'))}</label>
      <div class="gstrap-sm-grid">
        ${OPACITY.map(v => {
          const cls = `opacity-${v}`
          return `<button class="gstrap-sm-pill ${curOpacityClass === cls ? 'is-active' : ''}"
                          data-opacity="${v}" title="${cls}">${v}</button>`
        }).join('')}
        <button class="gstrap-sm-pill gstrap-sm-clear" data-opacity-clear>${escHtml(t('action.clear'))}</button>
      </div>
      ${!selector ? `
        <div class="gstrap-sm-hint">${escHtml(t('sm.custom-needs-selector'))}</div>
      ` : `
        <div class="gstrap-sm-slider-row">
          <input type="range" class="gstrap-sm-slider" min="0" max="100" step="1"
                 value="${opacityPercent}" data-opacity-slider
                 aria-label="${escAttr(t('sm.label.opacity'))}">
          <span class="gstrap-sm-slider-readout" data-opacity-readout>${opacityPercent}%</span>
        </div>
      `}
    </div>
  `

  host.querySelectorAll('[data-bp]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeBreakpoint = btn.dataset.bp
      requestRender()
    })
  })

  host.querySelectorAll('[data-display]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = displayClass(btn.dataset.display, bp)
      applyGroup(component, breakpointPattern(bp), curDisplay === cls ? null : cls)
      requestRender()
    })
  })

  host.querySelector('[data-display-clear]')?.addEventListener('click', () => {
    applyGroup(component, breakpointPattern(bp), null)
    requestRender()
  })

  host.querySelectorAll('[data-vis]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.vis
      // Visibility is always one-of (or none).
      applyGroup(component, visibilityPattern(), curVis === v ? null : v)
      requestRender()
    })
  })

  // ── Opacity: BS step classes vs a free value on the component's rule ──────
  // Both surfaces target the same CSS property, and the project rule beats a
  // utility class on specificity — so each surface erases the other rather
  // than letting the cascade pick a winner the user didn't choose.
  host.querySelectorAll('[data-opacity]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `opacity-${btn.dataset.opacity}`
      applyGroup(component, opacityPattern(), curOpacityClass === cls ? null : cls)
      writeProjectRuleProps(selector, { opacity: '' })
      requestRender()
    })
  })

  host.querySelector('[data-opacity-clear]')?.addEventListener('click', () => {
    applyGroup(component, opacityPattern(), null)
    writeProjectRuleProps(selector, { opacity: '' })
    requestRender()
  })

  const slider  = host.querySelector('[data-opacity-slider]')
  const readout = host.querySelector('[data-opacity-readout]')
  // Readout tracks the thumb; the stylesheet is only touched on commit, so a
  // drag doesn't write (and dirty, and re-inject) a rule per pixel of travel.
  slider?.addEventListener('input', () => {
    if (readout) readout.textContent = `${slider.value}%`
  })
  slider?.addEventListener('change', () => {
    if (readGroup(component, opacityPattern())) {
      applyGroup(component, opacityPattern(), null)
    }
    writeProjectRuleProps(selector, { opacity: ruleValueFor(slider.value) })
    requestRender()
  })
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

function escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/**
 * Slider position for the current state: the rule's free value wins, then the
 * BS step class, then fully opaque.
 *
 * @param {string} ruleValue - Raw `opacity` declaration, e.g. '0.5' or '50%'.
 * @param {string} stepClass - Active BS class, e.g. 'opacity-25', or ''.
 * @returns {number} 0–100.
 */
function sliderPercentFor(ruleValue, stepClass) {
  const fromRule = percentFromRuleValue(ruleValue)
  if (fromRule !== null) return fromRule
  const step = Number.parseInt(String(stepClass).replace('opacity-', ''), 10)
  return Number.isFinite(step) ? step : 100
}

// A hand-edited stylesheet may carry a percentage rather than the 0–1 number
// we write, so accept both and ignore anything else (keywords, var(), junk) —
// the slider falls back to the class/default instead of showing NaN.
function percentFromRuleValue(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const isPercent = text.endsWith('%')
  const parsed = Number.parseFloat(isPercent ? text.slice(0, -1) : text)
  if (!Number.isFinite(parsed)) return null
  return clampPercent(isPercent ? parsed : parsed * 100)
}

// 0–100 slider position → the 0–1 number CSS wants. Rounded to two decimals so
// float noise (0.30000000000000004) never reaches the stylesheet.
function ruleValueFor(percent) {
  const clamped = clampPercent(Number.parseFloat(percent))
  return String(Number((clamped / 100).toFixed(2)))
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 100
  return Math.min(100, Math.max(0, Math.round(value)))
}

// Match only the display class for the given breakpoint, leaving other
// breakpoint variants untouched.
function breakpointPattern(bp) {
  if (!bp) {
    // bare d-<value> — not d-<bp>-<value>
    return /^d-(?!sm-|md-|lg-|xl-|xxl-)(?:none|inline|inline-block|inline-flex|inline-grid|block|flex|grid|table)$/
  }
  return new RegExp(`^d-${bp}-(?:none|inline|inline-block|inline-flex|inline-grid|block|flex|grid|table)$`)
}

function readForBreakpoint(component, bp) {
  return readGroup(component, breakpointPattern(bp))
}
