/**
 * GrapeStrap — Style Manager: Flex sub-panel
 *
 * Only meaningful when the component has a `d-flex` (or `d-<bp>-flex`,
 * `d-inline-flex`) class. When it doesn't, the body shows a hint with a
 * one-click "Set display: flex" shortcut so the user doesn't have to bounce
 * to the Display panel.
 *
 * Direction / wrap / justify-content / align-items / align-content / gap.
 * No per-breakpoint variants in chunk B — the full responsive flex matrix
 * is a v0.0.3 candidate; chunk B keeps the surface small enough to use.
 */

import {
  FLEX_DIRECTION, FLEX_WRAP, FLEX_JUSTIFY,
  FLEX_ALIGN_ITEMS, FLEX_ALIGN_CONTENT, FLEX_GAP,
  flexDirectionPattern, flexWrapPattern,
  justifyContentPattern, alignItemsPattern,
  alignContentPattern, gapPattern, flexEnabledPattern
} from './bs-classes.js'
import { applyGroup, hasGroup, readGroup } from './class-utils.js'

export const id = 'flex'
export const label = 'Flex'

export function render(host, ctx) {
  const { component, requestRender } = ctx

  if (!hasGroup(component, flexEnabledPattern())) {
    host.innerHTML = `
      <div class="gstrap-sm-hint">
        Flex utilities apply only when the element has <code>d-flex</code>.
        <button class="gstrap-sm-pill" data-set-flex>Set display: flex</button>
      </div>
    `
    host.querySelector('[data-set-flex]')?.addEventListener('click', () => {
      // Add `d-flex` directly without going through the Display panel's
      // breakpoint-scoped pattern — this is the bare class.
      const next = [...new Set([...component.getClasses(), 'd-flex'])]
      component.setClass(next)
      requestRender()
    })
    return
  }

  const curDir     = readGroup(component, flexDirectionPattern())
  const curWrap    = readGroup(component, flexWrapPattern())
  const curJustify = readGroup(component, justifyContentPattern())
  const curAlignI  = readGroup(component, alignItemsPattern())
  const curAlignC  = readGroup(component, alignContentPattern())
  const curGap     = readGroup(component, gapPattern())

  host.innerHTML = `
    ${row('Direction', FLEX_DIRECTION, 'flex-', curDir, 'dir')}
    ${row('Wrap',      FLEX_WRAP,      'flex-', curWrap, 'wrap')}
    ${row('Justify',   FLEX_JUSTIFY,   'justify-content-', curJustify, 'just')}
    ${row('Align Items', FLEX_ALIGN_ITEMS, 'align-items-', curAlignI, 'aitems')}
    ${row('Align Content', FLEX_ALIGN_CONTENT, 'align-content-', curAlignC, 'acontent')}
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Gap</label>
      <div class="gstrap-sm-segs">
        ${FLEX_GAP.map(g => {
          const cls = `gap-${g}`
          return `<button class="gstrap-sm-seg ${curGap === cls ? 'is-active' : ''}"
                          data-gap="${g}" title="${cls}">${g}</button>`
        }).join('')}
        <button class="gstrap-sm-seg gstrap-sm-clear" data-gap-clear>Clear</button>
      </div>
    </div>
  `

  bindRow(host, '[data-dir]',    flexDirectionPattern, 'flex-',           curDir,     component, requestRender, 'dir')
  bindRow(host, '[data-wrap]',   flexWrapPattern,      'flex-',           curWrap,    component, requestRender, 'wrap')
  bindRow(host, '[data-just]',   justifyContentPattern,'justify-content-',curJustify, component, requestRender, 'just')
  bindRow(host, '[data-aitems]', alignItemsPattern,    'align-items-',    curAlignI,  component, requestRender, 'aitems')
  bindRow(host, '[data-acontent]', alignContentPattern,'align-content-',  curAlignC,  component, requestRender, 'acontent')

  host.querySelectorAll('[data-gap]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `gap-${btn.dataset.gap}`
      applyGroup(component, gapPattern(), curGap === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelector('[data-gap-clear]')?.addEventListener('click', () => {
    applyGroup(component, gapPattern(), null); requestRender()
  })
}

function row(label, list, prefix, current, dataKey) {
  return `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${label}</label>
      <div class="gstrap-sm-segs">
        ${list.map(v => {
          const cls = `${prefix}${v.value}`
          return `<button class="gstrap-sm-seg ${current === cls ? 'is-active' : ''}"
                          data-${dataKey}="${v.value}" title="${cls}">${v.label}</button>`
        }).join('')}
        <button class="gstrap-sm-seg gstrap-sm-clear" data-${dataKey}-clear>Clear</button>
      </div>
    </div>
  `
}
function bindRow(host, sel, patternFn, prefix, current, component, requestRender, dataKey) {
  host.querySelectorAll(sel).forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `${prefix}${btn.dataset[dataKey]}`
      applyGroup(component, patternFn(), current === cls ? null : cls)
      requestRender()
    })
  })
  host.querySelector(`[data-${dataKey}-clear]`)?.addEventListener('click', () => {
    applyGroup(component, patternFn(), null); requestRender()
  })
}
