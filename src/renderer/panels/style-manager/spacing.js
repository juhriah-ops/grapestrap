/**
 * GrapeStrap — Style Manager: Spacing sub-panel
 *
 * Margin and padding utility classes per side. Two segmented selectors:
 *
 *   Margin   [All Top End Bot Start X Y]   [0 1 2 3 4 5 auto -1 -2 -3 -4 -5]
 *   Padding  [All Top End Bot Start X Y]   [0 1 2 3 4 5]
 *
 * The "side" picker switches which side the scale buttons write to. The
 * scale buttons each show the currently-applied value as `is-active`.
 *
 * Per-breakpoint variants are NOT exposed in the spacing panel — the
 * margin/padding API is wide enough already, and the Display panel's
 * breakpoint logic is the explicit Bootstrap responsive surface. Power users
 * can still type breakpoint variants by hand into the Classes chip input.
 */

import {
  spacingClass, spacingPattern,
  SPACING_SIDES, SPACING_SCALES_PADDING, SPACING_SCALES_MARGIN
} from './bs-classes.js'
import { applyGroup, readGroup } from './class-utils.js'

let activeMarginSide = ''
let activePaddingSide = ''

export const id = 'spacing'
export const label = 'Spacing'

export function render(host, ctx) {
  const { component, requestRender } = ctx

  const marginCur  = readGroup(component, spacingPattern('m', activeMarginSide))
  const paddingCur = readGroup(component, spacingPattern('p', activePaddingSide))

  host.innerHTML = `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Margin</label>
      <div class="gstrap-sm-segs" data-prop="m">
        ${SPACING_SIDES.map(s => `
          <button class="gstrap-sm-seg ${s.value === activeMarginSide ? 'is-active' : ''}"
                  data-side="${s.value}">${s.label}</button>
        `).join('')}
      </div>
    </div>
    <div class="gstrap-sm-scales" data-scales-for="m">
      ${SPACING_SCALES_MARGIN.map(scale => {
        const cls = spacingClass('m', activeMarginSide, scale)
        const isActive = marginCur === cls
        return `<button class="gstrap-sm-scale ${isActive ? 'is-active' : ''}"
                        data-scale="${scale}" title="${cls}">${scaleLabel(scale)}</button>`
      }).join('')}
      <button class="gstrap-sm-scale gstrap-sm-clear" data-clear="m">Clear</button>
    </div>

    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Padding</label>
      <div class="gstrap-sm-segs" data-prop="p">
        ${SPACING_SIDES.map(s => `
          <button class="gstrap-sm-seg ${s.value === activePaddingSide ? 'is-active' : ''}"
                  data-side="${s.value}">${s.label}</button>
        `).join('')}
      </div>
    </div>
    <div class="gstrap-sm-scales" data-scales-for="p">
      ${SPACING_SCALES_PADDING.map(scale => {
        const cls = spacingClass('p', activePaddingSide, scale)
        const isActive = paddingCur === cls
        return `<button class="gstrap-sm-scale ${isActive ? 'is-active' : ''}"
                        data-scale="${scale}" title="${cls}">${scaleLabel(scale)}</button>`
      }).join('')}
      <button class="gstrap-sm-scale gstrap-sm-clear" data-clear="p">Clear</button>
    </div>
  `

  // Side selector → swap which side the scale row writes to.
  host.querySelectorAll('[data-prop] [data-side]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prop = btn.closest('[data-prop]').dataset.prop
      const side = btn.dataset.side
      if (prop === 'm') activeMarginSide = side
      else activePaddingSide = side
      requestRender()
    })
  })

  // Scale selector → mutate the component, re-render to refresh active state.
  host.querySelectorAll('[data-scales-for] [data-scale]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prop = btn.closest('[data-scales-for]').dataset.scalesFor
      const scale = btn.dataset.scale
      const side = prop === 'm' ? activeMarginSide : activePaddingSide
      const cls = spacingClass(prop, side, scale)
      const cur = readGroup(component, spacingPattern(prop, side))
      // Click again to clear (toggle off).
      applyGroup(component, spacingPattern(prop, side), cur === cls ? null : cls)
      requestRender()
    })
  })

  // Clear-all button per group.
  host.querySelectorAll('[data-clear]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prop = btn.dataset.clear
      const side = prop === 'm' ? activeMarginSide : activePaddingSide
      applyGroup(component, spacingPattern(prop, side), null)
      requestRender()
    })
  })
}

function scaleLabel(scale) {
  if (scale === 'auto') return 'auto'
  if (scale.startsWith('n')) return '−' + scale.slice(1)
  return scale
}
