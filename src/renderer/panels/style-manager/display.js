/**
 * GrapeStrap — Style Manager: Display sub-panel
 *
 * Display type + visibility, with per-breakpoint variants (the `[xs sm md lg
 * xl xxl]` strip at the top of the panel governs which `d-<bp>-<value>` class
 * gets written; `xs` writes the bare `d-<value>`).
 *
 * Per-breakpoint storage:
 *   - The user can have d-none AND d-md-flex on the same component (BS-typical
 *     "hidden on mobile, flex on tablet+"). So the DISPLAY pattern is scoped
 *     by breakpoint when stripping prior selections — switching breakpoints
 *     and clicking Block doesn't wipe the other breakpoint's class.
 */

import {
  BREAKPOINTS, DISPLAY_VALUES, VISIBILITY_VALUES,
  displayClass, displayPattern, visibilityPattern
} from './bs-classes.js'
import { applyGroup, readGroup, toggleClass } from './class-utils.js'

let activeBreakpoint = ''  // '' = xs (default)

export const id = 'display'
export const label = 'Display'

export function render(host, ctx) {
  const { component, requestRender } = ctx
  const bp = activeBreakpoint
  const curDisplay = readForBreakpoint(component, bp)
  const curVis = readGroup(component, visibilityPattern())

  host.innerHTML = `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Breakpoint</label>
      <div class="gstrap-sm-segs" data-prop="bp">
        ${BREAKPOINTS.map(b => `
          <button class="gstrap-sm-seg ${b === bp ? 'is-active' : ''}"
                  data-bp="${b}">${b || 'xs'}</button>
        `).join('')}
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Display</label>
      <div class="gstrap-sm-grid">
        ${DISPLAY_VALUES.map(v => {
          const cls = displayClass(v.value, bp)
          return `<button class="gstrap-sm-pill ${curDisplay === cls ? 'is-active' : ''}"
                          data-display="${v.value}" title="${cls}">${v.label}</button>`
        }).join('')}
        <button class="gstrap-sm-pill gstrap-sm-clear" data-display-clear>Clear</button>
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Visibility</label>
      <div class="gstrap-sm-grid">
        ${VISIBILITY_VALUES.map(v =>
          `<button class="gstrap-sm-pill ${curVis === v.value ? 'is-active' : ''}"
                   data-vis="${v.value}">${v.label}</button>`
        ).join('')}
      </div>
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
