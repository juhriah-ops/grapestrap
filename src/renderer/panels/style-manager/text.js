/**
 * GrapeStrap — Style Manager: Text sub-panel
 *
 * Alignment, weight, style, decoration, transform, size, color. All
 * one-of-many groups except decoration (which is exclusive in BS5 — there's
 * no "underline + line-through" combined utility).
 */

import {
  TEXT_ALIGN, TEXT_TRANSFORM, TEXT_WEIGHT, TEXT_STYLE,
  TEXT_DECORATION, TEXT_SIZE, TEXT_COLOR,
  textAlignClass, textAlignPattern, textTransformPattern,
  textWeightPattern, textStylePattern, textDecorationPattern,
  textSizePattern, textColorPattern
} from './bs-classes.js'
import { applyGroup, readGroup } from './class-utils.js'

export const id = 'text'
export const label = 'Text'

export function render(host, ctx) {
  const { component, requestRender } = ctx

  const curAlign  = readGroup(component, textAlignPattern())
  const curTrans  = readGroup(component, textTransformPattern())
  const curWeight = readGroup(component, textWeightPattern())
  const curStyle  = readGroup(component, textStylePattern())
  const curDeco   = readGroup(component, textDecorationPattern())
  const curSize   = readGroup(component, textSizePattern())
  const curColor  = readGroup(component, textColorPattern())

  host.innerHTML = `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Align</label>
      <div class="gstrap-sm-segs">
        ${TEXT_ALIGN.map(v => {
          const cls = textAlignClass(v.value)
          return `<button class="gstrap-sm-seg ${curAlign === cls ? 'is-active' : ''}"
                          data-align="${v.value}" title="${cls}">${v.label}</button>`
        }).join('')}
        <button class="gstrap-sm-seg gstrap-sm-clear" data-align-clear>Clear</button>
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Weight</label>
      <div class="gstrap-sm-grid">
        ${TEXT_WEIGHT.map(v => {
          const cls = `fw-${v.value}`
          return `<button class="gstrap-sm-pill ${curWeight === cls ? 'is-active' : ''}"
                          data-weight="${v.value}" title="${cls}">${v.label}</button>`
        }).join('')}
        <button class="gstrap-sm-pill gstrap-sm-clear" data-weight-clear>Clear</button>
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Style</label>
      <div class="gstrap-sm-grid">
        ${TEXT_STYLE.map(v => {
          const cls = `fst-${v.value}`
          return `<button class="gstrap-sm-pill ${curStyle === cls ? 'is-active' : ''}"
                          data-style="${v.value}" title="${cls}">${v.label}</button>`
        }).join('')}
        ${TEXT_DECORATION.map(v => {
          const cls = `text-decoration-${v.value}`
          return `<button class="gstrap-sm-pill ${curDeco === cls ? 'is-active' : ''}"
                          data-deco="${v.value}" title="${cls}">${v.label}</button>`
        }).join('')}
        ${TEXT_TRANSFORM.map(v => {
          const cls = `text-${v.value}`
          return `<button class="gstrap-sm-pill ${curTrans === cls ? 'is-active' : ''}"
                          data-trans="${v.value}" title="${cls}">${v.label}</button>`
        }).join('')}
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Size</label>
      <div class="gstrap-sm-segs">
        ${TEXT_SIZE.map(s => {
          const cls = `fs-${s}`
          return `<button class="gstrap-sm-seg ${curSize === cls ? 'is-active' : ''}"
                          data-size="${s}" title="${cls}">${s}</button>`
        }).join('')}
        <button class="gstrap-sm-seg gstrap-sm-clear" data-size-clear>Clear</button>
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Color</label>
      <div class="gstrap-sm-swatches">
        ${TEXT_COLOR.map(c => {
          const cls = `text-${c.value}`
          return `<button class="gstrap-sm-swatch ${curColor === cls ? 'is-active' : ''}"
                          data-color="${c.value}" style="--swatch:${c.swatch}" title="${cls}"></button>`
        }).join('')}
        <button class="gstrap-sm-swatch gstrap-sm-clear" data-color-clear title="Clear">×</button>
      </div>
    </div>
  `

  // Align (responsive variant deferred — chunk A keeps Display as the single
  // place that introduces the breakpoint switcher to keep the surface small).
  host.querySelectorAll('[data-align]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = textAlignClass(btn.dataset.align)
      applyGroup(component, textAlignPattern(), curAlign === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelector('[data-align-clear]')?.addEventListener('click', () => {
    applyGroup(component, textAlignPattern(), null); requestRender()
  })

  host.querySelectorAll('[data-weight]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `fw-${btn.dataset.weight}`
      applyGroup(component, textWeightPattern(), curWeight === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelector('[data-weight-clear]')?.addEventListener('click', () => {
    applyGroup(component, textWeightPattern(), null); requestRender()
  })

  host.querySelectorAll('[data-style]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `fst-${btn.dataset.style}`
      applyGroup(component, textStylePattern(), curStyle === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelectorAll('[data-deco]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `text-decoration-${btn.dataset.deco}`
      applyGroup(component, textDecorationPattern(), curDeco === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelectorAll('[data-trans]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `text-${btn.dataset.trans}`
      applyGroup(component, textTransformPattern(), curTrans === cls ? null : cls)
      requestRender()
    })
  })

  host.querySelectorAll('[data-size]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `fs-${btn.dataset.size}`
      applyGroup(component, textSizePattern(), curSize === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelector('[data-size-clear]')?.addEventListener('click', () => {
    applyGroup(component, textSizePattern(), null); requestRender()
  })

  host.querySelectorAll('[data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `text-${btn.dataset.color}`
      applyGroup(component, textColorPattern(), curColor === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelector('[data-color-clear]')?.addEventListener('click', () => {
    applyGroup(component, textColorPattern(), null); requestRender()
  })
}
