/**
 * GrapeStrap — Color picker w/ eyedropper
 *
 * Singleton popover anchored to a trigger element. Surface:
 *   - Live preview + hex/rgb/var() input
 *   - BS5 theme palette (primary/secondary/success/danger/warning/info/light/dark
 *     + body/black/white/transparent)
 *   - Recent colors (last 12, in-memory only — cleared on project:closed)
 *   - Native EyeDropper button (Chromium 95+, present in our Electron build)
 *   - Clear button (passes '' to the consumer)
 *
 * Public API:
 *   openColorPicker({ anchor, value, onChange, onClose })
 *     anchor   — DOM element to position next to (or { x, y } absolute)
 *     value    — current color string (hex, rgb, or var(--bs-...))
 *     onChange — called on every value change while the picker is open
 *     onClose  — called once on dismiss
 *
 * Wire-up:
 *   - Click outside the popover → close (onClose fires)
 *   - Esc → close
 *   - Picking a swatch → onChange('#rrggbb') and close (one-shot)
 *   - Typing into the input → onChange(value) live, no close
 *   - Eyedropper success → onChange(hex) and close
 *
 * The pseudo-class editor (style-manager/pseudo-class.js) is the first
 * consumer; the Properties chip-color affordance is a v0.0.3 candidate.
 */

import { eventBus } from '../../state/event-bus.js'

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

const RECENT_MAX = 12
let recent = []
let activePopover = null

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
  paint()
  positionAnchored(popover, anchor)

  function paint() {
    popover.innerHTML = `
      <div class="gstrap-cp-header">
        <span class="gstrap-cp-preview" data-cp-preview></span>
        <input type="text" class="gstrap-cp-input" data-cp-input
               value="${escapeAttr(currentValue)}"
               placeholder="#0d6efd or var(--bs-primary)"
               spellcheck="false" />
      </div>
      <div class="gstrap-cp-section-label">Theme</div>
      <div class="gstrap-cp-swatches">
        ${PALETTE.map(p => `
          <button class="gstrap-cp-swatch ${currentValue === p.value ? 'is-active' : ''}"
                  data-cp-pick="${p.value}" data-cp-color="${p.value}"
                  title="${p.label} — ${p.value}"></button>
        `).join('')}
      </div>
      ${recent.length ? `
        <div class="gstrap-cp-section-label">Recent</div>
        <div class="gstrap-cp-swatches">
          ${recent.map(c => `
            <button class="gstrap-cp-swatch ${currentValue === c ? 'is-active' : ''}"
                    data-cp-pick="${c}" data-cp-color="${c}" title="${c}"></button>
          `).join('')}
        </div>
      ` : ''}
      <div class="gstrap-cp-actions">
        ${supportsEyeDropper() ? `<button class="gstrap-cp-btn" data-cp-eyedrop>
          <span class="gstrap-cp-eyedrop-icon">⊙</span> Eyedropper
        </button>` : ''}
        <button class="gstrap-cp-btn" data-cp-clear>Clear</button>
      </div>
    `

    // Set --cp-color on every swatch via JS (CSS attr() for non-content
    // properties isn't reliably shipped in Chromium yet). The CSS sheet does
    // the rest — ::after fills with the custom property.
    popover.querySelectorAll('[data-cp-color]').forEach(el => {
      el.style.setProperty('--cp-color', el.dataset.cpColor || 'transparent')
    })
    paintPreview()
    wirePopoverEvents()
  }

  function paintPreview() {
    const preview = popover.querySelector('[data-cp-preview]')
    if (preview) preview.style.setProperty('--cp-color', currentValue || 'transparent')
  }

  function wirePopoverEvents() {
    popover.querySelectorAll('[data-cp-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        commit(btn.dataset.cpPick)
      })
    })
    const input = popover.querySelector('[data-cp-input]')
    input?.addEventListener('input', () => {
      currentValue = input.value
      onChange?.(currentValue)
      paintPreview()
    })
    input?.addEventListener('keydown', evt => {
      if (evt.key === 'Enter') commit(input.value)
      if (evt.key === 'Escape') closeActive()
    })
    popover.querySelector('[data-cp-eyedrop]')?.addEventListener('click', async () => {
      try {
        // eslint-disable-next-line no-undef -- EyeDropper is a Chromium global
        const ed = new EyeDropper()
        const result = await ed.open()
        if (result?.sRGBHex) commit(result.sRGBHex)
      } catch {
        // User cancelled — silent.
      }
    })
    popover.querySelector('[data-cp-clear]')?.addEventListener('click', () => {
      commit('')
    })
  }

  function commit(next) {
    currentValue = next
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
