/**
 * GrapeStrap — Breakpoint slider strip
 *
 * Strip above the GL canvas region. Drives the GrapesJS canvas iframe's
 * width directly (the device manager's preset list is preserved but this
 * slider lets the user scrub continuously through any width).
 *
 * Surface:
 *   - A native range input (576 .. 1600 px) for free-form width.
 *   - Click-to-snap markers at BS5 breakpoints
 *     (xs / sm 576 / md 768 / lg 992 / xl 1200 / xxl 1400 / 100%).
 *   - Live width readout in pixels + active-breakpoint label.
 *   - Per-component responsive class chips appear under the slider
 *     (d-none / d-md-block / col-lg-4 / etc.) with click-to-toggle for
 *     the visibility classes at the current breakpoint — so a designer
 *     can hide/show an element at a given size without leaving the bar.
 *
 * Width application: directly on `editor.Canvas.getFrameEl()`'s inline
 * style + the parent `.gjs-cv-canvas` if present (GrapesJS centers the
 * iframe via the device system; setting a smaller width than the canvas
 * pane gives a horizontal letterbox so the user sees content getting
 * narrower, matching DW's mobile-preview behavior).
 */

import { eventBus } from '../../state/event-bus.js'
import { pageState } from '../../state/page-state.js'
import { projectState } from '../../state/project-state.js'
import { getEditor } from '../../editor/grapesjs-init.js'

const BREAKPOINTS = [
  { id: '',    label: 'xs',  min: 0,    short: '<576' },
  { id: 'sm',  label: 'sm',  min: 576,  short: '≥576' },
  { id: 'md',  label: 'md',  min: 768,  short: '≥768' },
  { id: 'lg',  label: 'lg',  min: 992,  short: '≥992' },
  { id: 'xl',  label: 'xl',  min: 1200, short: '≥1200' },
  { id: 'xxl', label: 'xxl', min: 1400, short: '≥1400' }
]
const SNAP_PRESETS = [375, 576, 768, 992, 1200, 1400]
const MIN = 320
const MAX = 1920

let host = null
let userHidden = false
let currentWidth = 0  // 0 = auto / fill canvas pane

export function renderBreakpointsBar(target) {
  host = target
  paint()
  eventBus.on('tab:focused',     () => paint())
  eventBus.on('project:opened',  () => paint())
  eventBus.on('project:closed',  () => paint())
  eventBus.on('canvas:selected', () => paint())
  eventBus.on('canvas:component-class-changed', () => paint())
  eventBus.on('view:toggle-breakpoints', () => { userHidden = !userHidden; paint() })

  host.addEventListener('input', evt => {
    const slider = evt.target.closest('[data-bp-slider]')
    if (slider) onSliderInput(Number(slider.value))
  })
  host.addEventListener('click', evt => {
    const snap = evt.target.closest('[data-bp-snap]')
    if (snap) {
      const v = snap.dataset.bpSnap
      onSliderInput(v === 'auto' ? 0 : Number(v))
      return
    }
    const toggle = evt.target.closest('[data-bp-class]')
    if (toggle) {
      onClassToggle(toggle.dataset.bpClass)
    }
  })
}

function paint() {
  if (!host) return
  const tab = pageState.active()
  if (userHidden || !tab || !projectState.current) {
    host.hidden = true
    host.innerHTML = ''
    return
  }
  host.hidden = false
  const activeBp = bpForWidth(currentWidth || canvasInnerWidth())

  host.innerHTML = `
    <div class="gstrap-bp-row">
      <span class="gstrap-bp-readout">
        <span class="gstrap-bp-width">${currentWidth ? `${currentWidth}px` : 'fill'}</span>
        <span class="gstrap-bp-active">${activeBp.label} ${activeBp.short}</span>
      </span>
      <input type="range" class="gstrap-bp-slider" data-bp-slider
             min="${MIN}" max="${MAX}" step="1" value="${currentWidth || canvasInnerWidth()}">
      <span class="gstrap-bp-snaps">
        <button class="gstrap-bp-snap" data-bp-snap="auto" title="Fill canvas pane">100%</button>
        ${SNAP_PRESETS.map(w => `<button class="gstrap-bp-snap ${currentWidth === w ? 'is-active' : ''}"
                                          data-bp-snap="${w}">${w}</button>`).join('')}
      </span>
    </div>
    ${renderResponsiveChips(activeBp)}
  `
}

function renderResponsiveChips(activeBp) {
  const editor = getEditor()
  const sel = editor?.getSelected?.()
  if (!sel) return ''
  const classes = sel.getClasses?.() || []
  // Surface visibility + display classes that have a per-breakpoint variant.
  const interesting = classes.filter(c =>
    /^d-(?:sm|md|lg|xl|xxl)?-?(?:none|inline|inline-block|block|flex|grid|table)$/.test(c) ||
    /^col(?:-(?:sm|md|lg|xl|xxl))?(?:-(?:auto|1[0-2]|[1-9]))?$/.test(c)
  )
  // Quick visibility toggles at the active breakpoint.
  const showCls = activeBp.id ? `d-${activeBp.id}-block` : 'd-block'
  const hideCls = activeBp.id ? `d-${activeBp.id}-none`  : 'd-none'
  return `
    <div class="gstrap-bp-chips">
      <span class="gstrap-bp-chips-label">at ${activeBp.label}:</span>
      <button class="gstrap-bp-toggle" data-bp-class="${hideCls}"
              title="${classes.includes(hideCls) ? 'Remove' : 'Add'} ${hideCls}">
        ${classes.includes(hideCls) ? '👁‍🗨 hidden' : '🚫 hide'}
      </button>
      <button class="gstrap-bp-toggle" data-bp-class="${showCls}"
              title="${classes.includes(showCls) ? 'Remove' : 'Add'} ${showCls}">
        ${classes.includes(showCls) ? '✓ shown' : '👁 show'}
      </button>
      ${interesting.length ? `<span class="gstrap-bp-chips-sep"></span>` : ''}
      ${interesting.map(c =>
        `<code class="gstrap-bp-chip">${escHtml(c)}</code>`
      ).join('')}
    </div>
  `
}

function onSliderInput(width) {
  currentWidth = width || 0
  applyCanvasWidth(currentWidth)
  paint()
}

function onClassToggle(cls) {
  const editor = getEditor()
  const sel = editor?.getSelected?.()
  if (!sel) return
  const cur = sel.getClasses?.() || []
  if (cur.includes(cls)) {
    sel.setClass(cur.filter(c => c !== cls))
  } else {
    // Hide/show toggles are mutually exclusive at the same breakpoint —
    // adding `d-md-none` should evict any prior `d-md-block`/`d-md-flex`/etc
    // for that breakpoint, otherwise BS source-order picks the last one.
    const evictPattern = /^d-(?:sm|md|lg|xl|xxl)?-?(?:none|inline|inline-block|block|flex|grid|table)$/
    const m = /^d(?:-(sm|md|lg|xl|xxl))?-(none|inline|inline-block|block|flex|grid|table)$/.exec(cls)
    if (m) {
      const bp = m[1] || ''
      const filtered = cur.filter(c => {
        if (!evictPattern.test(c)) return true
        const cm = /^d(?:-(sm|md|lg|xl|xxl))?-/.exec(c)
        return (cm?.[1] || '') !== bp
      })
      sel.setClass([...filtered, cls])
    } else {
      sel.setClass([...cur, cls])
    }
  }
}

function applyCanvasWidth(width) {
  const editor = getEditor()
  const frame = editor?.Canvas?.getFrameEl?.()
  if (!frame) return
  if (!width) {
    frame.style.width = ''
    frame.style.maxWidth = ''
    frame.style.margin = ''
  } else {
    frame.style.width = `${width}px`
    frame.style.maxWidth = '100%'
    frame.style.margin = '0 auto'
  }
  // Make sure GrapesJS internal offsets follow the new width.
  try { editor.refresh() } catch { /* GrapesJS not ready */ }
}

function bpForWidth(w) {
  if (!w) return BREAKPOINTS[0]
  let active = BREAKPOINTS[0]
  for (const bp of BREAKPOINTS) {
    if (w >= bp.min) active = bp
  }
  return active
}

function canvasInnerWidth() {
  const editor = getEditor()
  const frame = editor?.Canvas?.getFrameEl?.()
  return frame?.clientWidth || 1024
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c])
}
