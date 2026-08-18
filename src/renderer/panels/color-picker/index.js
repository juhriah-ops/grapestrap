/**
 * GrapeStrap — Colour picker: visual selector + palette + eyedropper
 *
 * PATH: src/renderer/panels/color-picker/index.js
 * ROLE: Singleton popover anchored to a trigger element. Surface, top to
 *       bottom:
 *         - Live preview + hex text field (accepts `var(--bs-*)` too)
 *         - Saturation/brightness spectrum with a draggable thumb
 *         - Hue strip with a draggable thumb
 *         - R / G / B numeric fields
 *         - BS5 theme palette, then recent colours (last 12, in-memory only)
 *         - Native EyeDropper button (Chromium 95+, present in our Electron
 *           build) and Clear
 * DEPENDS: ../../state/event-bus.js, ../../../shared/color-convert.js,
 *          ../../i18n.js
 * CREATED: v0.0.2-alpha, Phase 2 (visual selector added 2026-08-17)
 *
 * Public API:
 *   openColorPicker({ anchor, value, onChange, onClose })
 *     anchor   — DOM element to position next to (or { x, y } absolute)
 *     value    — current colour string (hex, rgb(), or var(--bs-...))
 *     onChange — called on every value change while the picker is open
 *     onClose  — called once on dismiss
 *
 * Wire-up — two classes of interaction, deliberately different:
 *   ONE-SHOT (commit + close): a palette or recent swatch, an eyedropper
 *     sample, Clear. These are "I know the colour I want" gestures.
 *   LIVE (emit + stay open): spectrum drag, hue drag, R/G/B fields, hex
 *     field. These are "let me find it" gestures, and closing the popover on
 *     every increment would make the selector unusable. Each emit writes the
 *     CSS rule downstream, so the canvas previews as the thumb moves.
 *   Click outside or Esc → close (onClose fires, nothing extra is committed).
 *
 * Colours the picker cannot resolve to numbers — `var(--bs-primary)`, named
 * colours, `transparent` — are still legal values: they ride the hex field
 * and the preview untouched, the numeric fields blank out, and the spectrum
 * holds its last position rather than lying about where that colour sits.
 * `lastSpectrumHsv` is module-level so reopening the picker returns the thumb
 * to where the user left it, which is what makes the blank-field case read as
 * "not resolvable" instead of "reset to red".
 *
 * Accessibility: the spectrum and hue strips are pointer-driven only. The
 * keyboard path to any colour is the hex and R/G/B fields, which are real
 * form controls with labels — so the popover stays operable without a mouse
 * without needing a bespoke 2-D keyboard interaction.
 */

import { eventBus } from '../../state/event-bus.js'
import { t } from '../../i18n.js'
import {
  clampChannel,
  clampUnit,
  hsvToRgb,
  parseColorToRgb,
  rgbToHex,
  rgbToHsv
} from '../../../shared/color-convert.js'

const PALETTE = [
  { value: '#0d6efd', label: 'primary'   },
  { value: '#6c757d', label: 'secondary' },
  { value: '#198754', label: 'success'   },
  { value: '#dc3545', label: 'danger'    },
  { value: '#ffc107', label: 'warning'   },
  { value: '#0dcaf0', label: 'info'      },
  { value: '#f8f9fa', label: 'light'     },
  { value: '#212529', label: 'dark'      },
  { value: '#ffffff', label: 'white'     },
  { value: '#000000', label: 'black'     },
  { value: 'transparent', label: 'transparent' }
]

// R/G/B fields, in render order. The single-letter captions are the universal
// shorthand for the channels and stay literal; the aria-labels are translated.
const CHANNELS = [
  { key: 'r', caption: 'R', ariaKey: 'cp.aria.channel-red'   },
  { key: 'g', caption: 'G', ariaKey: 'cp.aria.channel-green' },
  { key: 'b', caption: 'B', ariaKey: 'cp.aria.channel-blue'  }
]

const RECENT_MAX = 12

let recent = []
let activePopover = null

// Where the spectrum/hue thumbs sat when the picker last closed. Editor chrome
// state, not project state — it deliberately survives project:closed so the
// thumbs don't jump when the user reopens the picker on a new project.
let lastSpectrumHsv = { h: 0, s: 1, v: 1 }

eventBus.on('project:closed', () => { recent = [] })

export function openColorPicker({ anchor, value = '', onChange, onClose } = {}) {
  // Close any existing picker first — we're a singleton.
  if (activePopover) closeActive()

  const host = document.getElementById('gstrap-modals') || document.body
  const popover = document.createElement('div')
  popover.className = 'gstrap-cp-popover'
  popover.setAttribute('role', 'dialog')
  popover.dataset.gstrapColorPicker = ''
  host.appendChild(popover)

  let currentValue = value
  // Spectrum/hue position. Seeded from the incoming value when it resolves to
  // numbers, otherwise from wherever the picker was last left.
  let spectrumHsv = { ...lastSpectrumHsv }
  const initialRgb = parseColorToRgb(value)
  if (initialRgb) spectrumHsv = rgbToHsv(initialRgb)

  paint()
  positionAnchored(popover, anchor)

  function paint() {
    popover.innerHTML = `
      <div class="gstrap-cp-header">
        <span class="gstrap-cp-preview" data-cp-preview></span>
        <input type="text" class="gstrap-cp-input" data-cp-input
               value="${escapeAttr(currentValue)}"
               aria-label="${escapeAttr(t('cp.aria.hex'))}"
               placeholder="#0d6efd or var(--bs-primary)"
               spellcheck="false" />
      </div>
      <div class="gstrap-cp-spectrum" data-cp-spectrum
           aria-label="${escapeAttr(t('cp.aria.spectrum'))}">
        <span class="gstrap-cp-spectrum-thumb" data-cp-spectrum-thumb></span>
      </div>
      <div class="gstrap-cp-hue" data-cp-hue aria-label="${escapeAttr(t('cp.aria.hue'))}">
        <span class="gstrap-cp-hue-thumb" data-cp-hue-thumb></span>
      </div>
      <div class="gstrap-cp-channels">
        ${CHANNELS.map(channel => `
          <label class="gstrap-cp-channel">
            <span class="gstrap-cp-channel-label">${channel.caption}</span>
            <input type="number" min="0" max="255" step="1" inputmode="numeric"
                   class="gstrap-cp-channel-input" data-cp-channel="${channel.key}"
                   aria-label="${escapeAttr(t(channel.ariaKey))}" />
          </label>
        `).join('')}
      </div>
      <div class="gstrap-cp-section-label">${escapeHtml(t('cp.section.theme'))}</div>
      <div class="gstrap-cp-swatches">
        ${PALETTE.map(p => `
          <button class="gstrap-cp-swatch ${currentValue === p.value ? 'is-active' : ''}"
                  data-cp-pick="${p.value}" data-cp-color="${p.value}"
                  title="${p.label} — ${p.value}"></button>
        `).join('')}
      </div>
      ${recent.length ? `
        <div class="gstrap-cp-section-label">${escapeHtml(t('cp.section.recent'))}</div>
        <div class="gstrap-cp-swatches">
          ${recent.map(c => `
            <button class="gstrap-cp-swatch ${currentValue === c ? 'is-active' : ''}"
                    data-cp-pick="${c}" data-cp-color="${c}" title="${c}"></button>
          `).join('')}
        </div>
      ` : ''}
      <div class="gstrap-cp-actions">
        ${supportsEyeDropper() ? `<button class="gstrap-cp-btn" data-cp-eyedrop>
          <span class="gstrap-cp-eyedrop-icon">⊙</span> ${escapeHtml(t('cp.action.eyedropper'))}
        </button>` : ''}
        <button class="gstrap-cp-btn" data-cp-clear>${escapeHtml(t('action.clear'))}</button>
      </div>
    `

    // Set --cp-color on every swatch via JS (CSS attr() for non-content
    // properties isn't reliably shipped in Chromium yet). The CSS sheet does
    // the rest — ::after fills with the custom property.
    popover.querySelectorAll('[data-cp-color]').forEach(el => {
      el.style.setProperty('--cp-color', el.dataset.cpColor || 'transparent')
    })
    paintSelector()
    wirePopoverEvents()
  }

  /** Preview swatch + spectrum tint + thumb offsets + numeric fields, all
   *  from the two pieces of state (`currentValue`, `spectrumHsv`). Every
   *  interaction ends here, so there is exactly one place that paints. */
  function paintSelector() {
    const preview = popover.querySelector('[data-cp-preview]')
    preview?.style.setProperty('--cp-color', currentValue || 'transparent')

    // The spectrum's own tint is the fully-saturated form of the current hue;
    // the white/black gradient layers on top of it come from the stylesheet.
    const hueOnly = rgbToHex(hsvToRgb({ h: spectrumHsv.h, s: 1, v: 1 }))
    const resolved = parseColorToRgb(currentValue)

    const spectrum = popover.querySelector('[data-cp-spectrum]')
    if (spectrum) {
      spectrum.style.setProperty('--cp-hue', hueOnly)
      spectrum.style.setProperty('--cp-thumb-x', `${clampUnit(spectrumHsv.s) * 100}%`)
      spectrum.style.setProperty('--cp-thumb-y', `${(1 - clampUnit(spectrumHsv.v)) * 100}%`)
      // Thumb fill shows the colour under it, so the thumb reads as a lens
      // rather than a dot floating over the gradient.
      spectrum.style.setProperty('--cp-color', resolved ? rgbToHex(resolved) : hueOnly)
    }

    const hue = popover.querySelector('[data-cp-hue]')
    if (hue) {
      hue.style.setProperty('--cp-thumb-x', `${(spectrumHsv.h / 360) * 100}%`)
      hue.style.setProperty('--cp-color', hueOnly)
    }

    // Blank rather than zero when the value doesn't resolve — a var() or a
    // named colour is not "rgb(0,0,0)", and showing zeros would invite the
    // user to overwrite a working value with black by touching one field.
    for (const channel of CHANNELS) {
      const field = popover.querySelector(`[data-cp-channel="${channel.key}"]`)
      if (field) field.value = resolved ? String(resolved[channel.key]) : ''
    }
  }

  function wirePopoverEvents() {
    popover.querySelectorAll('[data-cp-pick]').forEach(btn => {
      btn.addEventListener('click', () => commit(btn.dataset.cpPick))
    })

    wireDragSurface(popover.querySelector('[data-cp-spectrum]'), (ratioX, ratioY) => {
      spectrumHsv = { h: spectrumHsv.h, s: ratioX, v: 1 - ratioY }
      emitFromSpectrum()
    })
    wireDragSurface(popover.querySelector('[data-cp-hue]'), ratioX => {
      spectrumHsv = { ...spectrumHsv, h: ratioX * 360 }
      emitFromSpectrum()
    })

    popover.querySelectorAll('[data-cp-channel]').forEach(field => {
      field.addEventListener('input', onChannelInput)
    })

    const input = popover.querySelector('[data-cp-input]')
    input?.addEventListener('input', () => {
      currentValue = input.value
      // Re-seat the thumbs when the typed value is resolvable; hold position
      // when it isn't (a half-typed "#12" shouldn't drag the spectrum around).
      const rgb = parseColorToRgb(currentValue)
      if (rgb) spectrumHsv = preserveHue(rgbToHsv(rgb), spectrumHsv)
      paintSelector()
      onChange?.(currentValue)
    })
    input?.addEventListener('keydown', evt => {
      if (evt.key === 'Enter') commit(input.value)
      if (evt.key === 'Escape') closeActive()
    })

    popover.querySelector('[data-cp-eyedrop]')?.addEventListener('click', async () => {
      try {
        const ed = new EyeDropper()
        const result = await ed.open()
        if (result?.sRGBHex) commit(result.sRGBHex)
      } catch {
        // User cancelled — silent.
      }
    })
    popover.querySelector('[data-cp-clear]')?.addEventListener('click', () => commit(''))
  }

  /** Spectrum/hue produced a new HSV: derive the hex, repaint, emit live. */
  function emitFromSpectrum() {
    currentValue = rgbToHex(hsvToRgb(spectrumHsv))
    const input = popover.querySelector('[data-cp-input]')
    if (input) input.value = currentValue
    paintSelector()
    onChange?.(currentValue)
  }

  /** R/G/B fields changed. Emits only once all three read as numbers — an
   *  empty field mid-retype is an unfinished colour, not a request for 0. */
  function onChannelInput() {
    const values = CHANNELS.map(channel =>
      popover.querySelector(`[data-cp-channel="${channel.key}"]`)?.value ?? '')
    if (values.some(v => String(v).trim() === '')) return

    const rgb = {
      r: clampChannel(values[0]),
      g: clampChannel(values[1]),
      b: clampChannel(values[2])
    }
    spectrumHsv = preserveHue(rgbToHsv(rgb), spectrumHsv)
    currentValue = rgbToHex(rgb)

    const input = popover.querySelector('[data-cp-input]')
    if (input) input.value = currentValue
    // paintSelector() rewrites the channel fields from the clamped value, so
    // typing 300 into R lands as 255 without a second round of events.
    paintSelector()
    onChange?.(currentValue)
  }

  /** One-shot path: swatch, eyedropper sample, or Clear. Re-seats the
   *  selector before closing so `lastSpectrumHsv` remembers where the picked
   *  colour lives and the next open starts from there. */
  function commit(next) {
    currentValue = next
    const rgb = parseColorToRgb(next)
    if (rgb) spectrumHsv = preserveHue(rgbToHsv(rgb), spectrumHsv)
    paintSelector()

    if (next && next !== 'transparent' && /^#[0-9a-f]{3,8}$/i.test(next)) {
      recent = [next, ...recent.filter(c => c !== next)].slice(0, RECENT_MAX)
    }
    onChange?.(currentValue)
    closeActive()
  }

  function onDocClick(evt) {
    if (popover.contains(evt.target)) return
    // Don't close when the click is on the original anchor — the consumer
    // expects clicking the trigger again to be a re-toggle, not a close +
    // re-open at the same coords.
    if (anchor instanceof Element && anchor.contains(evt.target)) return
    closeActive()
  }
  function onKey(evt) {
    if (evt.key === 'Escape') closeActive()
  }
  function onResize() {
    if (anchor instanceof Element) positionAnchored(popover, anchor)
  }

  // Defer doc-click listener so the click that opened us doesn't immediately close us.
  setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)

  function closeActive() {
    document.removeEventListener('mousedown', onDocClick, true)
    document.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', onResize)
    lastSpectrumHsv = { ...spectrumHsv }
    popover.remove()
    activePopover = null
    onClose?.()
  }

  activePopover = { popover, close: closeActive }
  return activePopover
}

export function closeColorPicker() {
  if (activePopover) activePopover.close()
}

/**
 * Make an element drag-addressable: pointerdown picks a point, and the drag
 * keeps reporting until release. Both ratios are clamped to 0–1, so dragging
 * past the edge pins to the edge instead of running off the scale.
 *
 * Pointer capture is what lets the drag continue outside the element's box;
 * it is wrapped because `setPointerCapture` throws NotFoundError for a
 * pointerId with no active pointer — which is exactly the case for the
 * synthetic PointerEvents the e2e suite dispatches. The move/up listeners sit
 * on the element itself, so the drag works either way: with capture the
 * browser retargets real events here, and without it the synthetic events are
 * dispatched here directly.
 *
 * @param {HTMLElement|null} surface - Element to read coordinates against.
 * @param {(ratioX: number, ratioY: number) => void} onPick - Called with the
 *        clamped 0–1 position on every press and drag step.
 */
function wireDragSurface(surface, onPick) {
  if (!surface) return
  let isDragging = false

  const report = evt => {
    const rect = surface.getBoundingClientRect()
    // A zero-width box (element not laid out yet) would divide to Infinity.
    if (!rect.width || !rect.height) return
    onPick(
      clampUnit((evt.clientX - rect.left) / rect.width),
      clampUnit((evt.clientY - rect.top) / rect.height)
    )
  }

  surface.addEventListener('pointerdown', evt => {
    isDragging = true
    try {
      surface.setPointerCapture(evt.pointerId)
    } catch {
      // Synthetic event with no live pointer — see the note above.
    }
    evt.preventDefault()
    report(evt)
  })
  surface.addEventListener('pointermove', evt => {
    if (isDragging) report(evt)
  })
  const endDrag = evt => {
    if (!isDragging) return
    isDragging = false
    try {
      surface.releasePointerCapture(evt.pointerId)
    } catch {
      // Capture was never taken — nothing to release.
    }
  }
  surface.addEventListener('pointerup', endDrag)
  surface.addEventListener('pointercancel', endDrag)
}

/**
 * Carry the previous hue across a conversion that lost it. Greys, black and
 * white all convert to hue 0; without this, dimming a blue to black would
 * swing the hue strip to red and the next brighten would come back red.
 *
 * @param {{h: number, s: number, v: number}} next - Freshly converted HSV.
 * @param {{h: number, s: number, v: number}} previous - HSV being replaced.
 * @returns {{h: number, s: number, v: number}} `next`, with hue restored when
 *          the conversion had no hue to report.
 */
function preserveHue(next, previous) {
  return next.s === 0 ? { ...next, h: previous.h } : next
}

function supportsEyeDropper() {
  return typeof window !== 'undefined' && typeof window.EyeDropper === 'function'
}

function positionAnchored(popover, anchor) {
  // Anchor can be a DOM element or { x, y } absolute coords.
  const rect = anchor instanceof Element
    ? anchor.getBoundingClientRect()
    : { left: anchor?.x ?? 0, top: anchor?.y ?? 0, right: anchor?.x ?? 0, bottom: anchor?.y ?? 0, width: 0, height: 0 }

  // First show off-screen to measure dimensions, then place.
  popover.style.left = '0px'
  popover.style.top  = '0px'
  popover.style.visibility = 'hidden'
  popover.style.display = 'block'

  const pw = popover.offsetWidth
  const ph = popover.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Default: below + left-aligned with the trigger.
  let left = rect.left
  let top  = rect.bottom + 4

  // If not enough room below, flip above.
  if (top + ph > vh - 8) top = Math.max(8, rect.top - ph - 4)
  // Clamp vertically no matter which way we flipped. The flip alone is not
  // enough: a trigger scrolled out of its panel reports a rect below the
  // viewport, and "above that rect" is still off-screen. Since the popover
  // grew a spectrum it is tall enough (~380px) for the difference to hide the
  // palette and the action buttons — the stylesheet caps its height and lets
  // it scroll, so clamping here always leaves every control reachable.
  if (top + ph > vh - 8) top = vh - ph - 8
  if (top < 8) top = 8
  // Clamp horizontally.
  if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8)
  if (left < 8) left = 8

  popover.style.left = `${left}px`
  popover.style.top  = `${top}px`
  popover.style.visibility = 'visible'
}

function escapeAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
