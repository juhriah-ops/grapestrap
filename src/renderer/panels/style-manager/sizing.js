/**
 * GrapeStrap — Style Manager: Sizing sub-panel
 *
 * Width / height (25/50/75/100/auto), max-width / max-height 100, viewport
 * sizes (vw-100 / vh-100). One independent toggle per row — width and height
 * are separate cascading groups, mw-100 / vh-100 etc. are bool toggles.
 */

import {
  SIZING_W, SIZING_H,
  widthPattern, heightPattern,
  maxWidthPattern, maxHeightPattern, vwPattern, vhPattern
} from './bs-classes.js'
import { applyGroup, readGroup, hasGroup, toggleClass } from './class-utils.js'

export const id = 'sizing'
export const label = 'Sizing'

export function render(host, ctx) {
  const { component, requestRender } = ctx
  const curW = readGroup(component, widthPattern())
  const curH = readGroup(component, heightPattern())
  const hasMW = hasGroup(component, maxWidthPattern())
  const hasMH = hasGroup(component, maxHeightPattern())
  const hasVW = hasGroup(component, vwPattern())
  const hasVH = hasGroup(component, vhPattern())

  host.innerHTML = `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Width</label>
      <div class="gstrap-sm-segs">
        ${SIZING_W.map(w => {
          const cls = `w-${w}`
          return `<button class="gstrap-sm-seg ${curW === cls ? 'is-active' : ''}"
                          data-w="${w}" title="${cls}">${w}</button>`
        }).join('')}
        <button class="gstrap-sm-seg gstrap-sm-clear" data-w-clear>Clear</button>
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Height</label>
      <div class="gstrap-sm-segs">
        ${SIZING_H.map(h => {
          const cls = `h-${h}`
          return `<button class="gstrap-sm-seg ${curH === cls ? 'is-active' : ''}"
                          data-h="${h}" title="${cls}">${h}</button>`
        }).join('')}
        <button class="gstrap-sm-seg gstrap-sm-clear" data-h-clear>Clear</button>
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Max / Viewport</label>
      <div class="gstrap-sm-grid">
        <button class="gstrap-sm-pill ${hasMW ? 'is-active' : ''}" data-toggle="mw-100" title="mw-100">mw-100</button>
        <button class="gstrap-sm-pill ${hasMH ? 'is-active' : ''}" data-toggle="mh-100" title="mh-100">mh-100</button>
        <button class="gstrap-sm-pill ${hasVW ? 'is-active' : ''}" data-toggle="vw-100" title="vw-100">vw-100</button>
        <button class="gstrap-sm-pill ${hasVH ? 'is-active' : ''}" data-toggle="vh-100" title="vh-100">vh-100</button>
      </div>
    </div>
  `

  host.querySelectorAll('[data-w]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `w-${btn.dataset.w}`
      applyGroup(component, widthPattern(), curW === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelector('[data-w-clear]')?.addEventListener('click', () => {
    applyGroup(component, widthPattern(), null); requestRender()
  })

  host.querySelectorAll('[data-h]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `h-${btn.dataset.h}`
      applyGroup(component, heightPattern(), curH === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelector('[data-h-clear]')?.addEventListener('click', () => {
    applyGroup(component, heightPattern(), null); requestRender()
  })

  host.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleClass(component, btn.dataset.toggle)
      requestRender()
    })
  })
}
