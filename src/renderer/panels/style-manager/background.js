/**
 * GrapeStrap — Style Manager: Background sub-panel
 *
 * Color, subtle variants (BS5.3+), gradient toggle. Background and text
 * color are handled in their own panels because they share regex shapes
 * (`bg-*` vs `text-*`) but live in different conceptual sections.
 */

import {
  BG_COLOR, BG_SUBTLE,
  bgColorPattern, bgGradientPattern
} from './bs-classes.js'
import { applyGroup, readGroup, toggleClass } from './class-utils.js'

export const id = 'background'
export const label = 'Background'

export function render(host, ctx) {
  const { component, requestRender } = ctx
  const cur = readGroup(component, bgColorPattern())
  const hasGradient = (component.getClasses() || []).includes('bg-gradient')

  host.innerHTML = `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Color</label>
      <div class="gstrap-sm-swatches">
        ${BG_COLOR.map(c => {
          const cls = `bg-${c.value}`
          return `<button class="gstrap-sm-swatch ${cur === cls ? 'is-active' : ''}"
                          data-color="${c.value}" style="--swatch:${c.swatch}" title="${cls}"></button>`
        }).join('')}
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Subtle</label>
      <div class="gstrap-sm-grid">
        ${BG_SUBTLE.map(s => {
          const cls = `bg-${s}`
          return `<button class="gstrap-sm-pill ${cur === cls ? 'is-active' : ''}"
                          data-subtle="${s}" title="${cls}">${s.replace('-subtle','')}</button>`
        }).join('')}
        <button class="gstrap-sm-pill gstrap-sm-clear" data-clear>Clear</button>
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Effect</label>
      <div class="gstrap-sm-grid">
        <button class="gstrap-sm-pill ${hasGradient ? 'is-active' : ''}" data-gradient
                title="bg-gradient">Gradient</button>
      </div>
    </div>
  `

  host.querySelectorAll('[data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `bg-${btn.dataset.color}`
      applyGroup(component, bgColorPattern(), cur === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelectorAll('[data-subtle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `bg-${btn.dataset.subtle}`
      applyGroup(component, bgColorPattern(), cur === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelector('[data-clear]')?.addEventListener('click', () => {
    applyGroup(component, bgColorPattern(), null); requestRender()
  })
  host.querySelector('[data-gradient]')?.addEventListener('click', () => {
    toggleClass(component, 'bg-gradient'); requestRender()
  })
}
