/**
 * GrapeStrap — Style Manager: Border sub-panel
 *
 * Side toggles, width, color, radius, shadow. Each side is independent —
 * toggling Top adds `border-top`; clicking again removes it. The "border"
 * (all-sides) toggle adds the bare `border` class. The `-0` removers
 * (`border-top-0`, etc.) are not surfaced as separate buttons in chunk B —
 * power users can type those directly into the chip input. They DO match
 * `borderSidePattern` so applyGroup will correctly clean them up if the
 * user toggles a normal side after the fact.
 */

import {
  BORDER_SIDES, BORDER_WIDTHS, BORDER_COLOR, BORDER_RADIUS, SHADOW,
  borderSidePattern, borderWidthPattern, borderColorPattern,
  borderRadiusPattern, shadowPattern
} from './bs-classes.js'
import { applyGroup, readGroup, readGroupAll, toggleClass } from './class-utils.js'

export const id = 'border'
export const label = 'Border'

export function render(host, ctx) {
  const { component, requestRender } = ctx

  const sidesActive = readGroupAll(component, /^border(?:-(?:top|end|bottom|start))?$/)
  const curWidth  = readGroup(component, borderWidthPattern())
  const curColor  = readGroup(component, borderColorPattern())
  const curRadius = readGroup(component, borderRadiusPattern())
  const curShadow = readGroup(component, shadowPattern())

  host.innerHTML = `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Sides</label>
      <div class="gstrap-sm-segs">
        ${BORDER_SIDES.map(s => {
          const cls = s.value ? `border-${s.value}` : 'border'
          const active = sidesActive.includes(cls)
          return `<button class="gstrap-sm-seg ${active ? 'is-active' : ''}"
                          data-side="${s.value}" title="${cls}">${s.label}</button>`
        }).join('')}
        <button class="gstrap-sm-seg gstrap-sm-clear" data-side-clear>Clear</button>
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Width</label>
      <div class="gstrap-sm-segs">
        ${BORDER_WIDTHS.map(w => {
          const cls = `border-${w}`
          return `<button class="gstrap-sm-seg ${curWidth === cls ? 'is-active' : ''}"
                          data-width="${w}" title="${cls}">${w}</button>`
        }).join('')}
        <button class="gstrap-sm-seg gstrap-sm-clear" data-width-clear>Clear</button>
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Color</label>
      <div class="gstrap-sm-swatches">
        ${BORDER_COLOR.map(c => {
          const cls = `border-${c.value}`
          return `<button class="gstrap-sm-swatch ${curColor === cls ? 'is-active' : ''}"
                          data-color="${c.value}" style="--swatch:${c.swatch}" title="${cls}"></button>`
        }).join('')}
        <button class="gstrap-sm-swatch gstrap-sm-clear" data-color-clear title="Clear">×</button>
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Radius</label>
      <div class="gstrap-sm-segs">
        ${BORDER_RADIUS.map(r => {
          const cls = r.value ? `rounded-${r.value}` : 'rounded'
          return `<button class="gstrap-sm-seg ${curRadius === cls ? 'is-active' : ''}"
                          data-radius="${r.value}" title="${cls}">${r.label}</button>`
        }).join('')}
        <button class="gstrap-sm-seg gstrap-sm-clear" data-radius-clear>Clear</button>
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Shadow</label>
      <div class="gstrap-sm-segs">
        ${SHADOW.map(s => {
          const cls = s.value ? `shadow-${s.value}` : 'shadow'
          return `<button class="gstrap-sm-seg ${curShadow === cls ? 'is-active' : ''}"
                          data-shadow="${s.value}" title="${cls}">${s.label}</button>`
        }).join('')}
        <button class="gstrap-sm-seg gstrap-sm-clear" data-shadow-clear>Clear</button>
      </div>
    </div>
  `

  host.querySelectorAll('[data-side]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = btn.dataset.side ? `border-${btn.dataset.side}` : 'border'
      toggleClass(component, cls)
      requestRender()
    })
  })
  host.querySelector('[data-side-clear]')?.addEventListener('click', () => {
    applyGroup(component, borderSidePattern(), null); requestRender()
  })

  host.querySelectorAll('[data-width]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `border-${btn.dataset.width}`
      applyGroup(component, borderWidthPattern(), curWidth === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelector('[data-width-clear]')?.addEventListener('click', () => {
    applyGroup(component, borderWidthPattern(), null); requestRender()
  })

  host.querySelectorAll('[data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `border-${btn.dataset.color}`
      applyGroup(component, borderColorPattern(), curColor === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelector('[data-color-clear]')?.addEventListener('click', () => {
    applyGroup(component, borderColorPattern(), null); requestRender()
  })

  host.querySelectorAll('[data-radius]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = btn.dataset.radius ? `rounded-${btn.dataset.radius}` : 'rounded'
      applyGroup(component, borderRadiusPattern(), curRadius === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelector('[data-radius-clear]')?.addEventListener('click', () => {
    applyGroup(component, borderRadiusPattern(), null); requestRender()
  })

  host.querySelectorAll('[data-shadow]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = btn.dataset.shadow ? `shadow-${btn.dataset.shadow}` : 'shadow'
      applyGroup(component, shadowPattern(), curShadow === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelector('[data-shadow-clear]')?.addEventListener('click', () => {
    applyGroup(component, shadowPattern(), null); requestRender()
  })
}
