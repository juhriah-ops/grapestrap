/**
 * GrapeStrap — Style Manager: Background sub-panel
 *
 * Color (BS theme tokens), subtle variants (BS5.3+), gradient toggle, and a
 * "Background image" row that lets the user pick from project assets and
 * writes a CSS rule into the project's globalCSS scoped by the selected
 * component's first non-BS class (or id) — same pattern the pseudo-class
 * editor uses, so behavior stays predictable: no inline styles, edits are
 * portable, round-trip via globalCSS reads.
 */

import {
  BG_COLOR, BG_SUBTLE,
  bgColorPattern, bgGradientPattern
} from './bs-classes.js'
import { applyGroup, readGroup, toggleClass } from './class-utils.js'
import { projectState } from '../../state/project-state.js'
import { eventBus } from '../../state/event-bus.js'
import { pickSelector, isBsUtility } from './css-rule-utils.js'

export const id = 'background'
export const label = 'Background'

const BG_SIZES = ['', 'cover', 'contain', 'auto']
const BG_POSITIONS = ['', 'center', 'top', 'bottom', 'left', 'right']
const BG_REPEATS = ['', 'no-repeat', 'repeat', 'repeat-x', 'repeat-y']

export function render(host, ctx) {
  const { component, requestRender } = ctx
  const cur = readGroup(component, bgColorPattern())
  const hasGradient = (component.getClasses() || []).includes('bg-gradient')

  // Background-image rule for this component (read from globalCSS).
  const selector = pickSelector(component, isBsUtility)
  const css = projectState.current?.globalCSS || ''
  const bgRule = selector ? readBareRule(css, selector) : {}
  const currentBgImage = (bgRule['background-image'] || '').match(/url\(['"]?([^'")]+)['"]?\)/)?.[1] || ''
  const currentBgSize     = bgRule['background-size']     || ''
  const currentBgPosition = bgRule['background-position'] || ''
  const currentBgRepeat   = bgRule['background-repeat']   || ''

  // Project images for the picker.
  const images = listProjectImages()

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

    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Image</label>
      ${!selector ? `
        <div class="gstrap-sm-hint">
          Add a custom class or id to this element first — background images need a target selector.
        </div>
      ` : `
        <div class="gstrap-sm-bg-image">
          ${currentBgImage
            ? `<div class="gstrap-sm-bg-current" data-bg-current title="${escAttr(currentBgImage)}">
                 ${imagePreviewMarkup(currentBgImage)}
                 <span class="gstrap-sm-bg-name">${escHtml(basename(currentBgImage))}</span>
               </div>`
            : `<div class="gstrap-sm-bg-empty">No image</div>`}
          <div class="gstrap-sm-bg-actions">
            <button class="gstrap-sm-pill" data-bg-toggle-picker>${currentBgImage ? 'Change' : 'Pick'}</button>
            ${currentBgImage ? `<button class="gstrap-sm-pill gstrap-sm-clear" data-bg-clear>Clear</button>` : ''}
          </div>
          <div class="gstrap-sm-bg-picker" data-bg-picker hidden>
            ${images.length === 0
              ? `<div class="gstrap-sm-hint">No images in project assets yet. Drop files into the Assets panel.</div>`
              : `<div class="gstrap-sm-bg-grid">
                  ${images.map(rel => `
                    <button class="gstrap-sm-bg-tile ${currentBgImage === rel ? 'is-active' : ''}"
                            data-bg-pick="${escAttr(rel)}" title="${escAttr(rel)}">
                      ${imagePreviewMarkup(rel)}
                      <span class="gstrap-sm-bg-tile-name">${escHtml(basename(rel))}</span>
                    </button>
                  `).join('')}
                </div>`}
          </div>
        </div>
        ${currentBgImage ? `
          <div class="gstrap-sm-bg-controls">
            ${selectRow('Size',     'bg-size',     BG_SIZES,     currentBgSize)}
            ${selectRow('Position', 'bg-position', BG_POSITIONS, currentBgPosition)}
            ${selectRow('Repeat',   'bg-repeat',   BG_REPEATS,   currentBgRepeat)}
          </div>
        ` : ''}
      `}
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

  // ── Background image controls ────────────────────────────────────────────
  host.querySelector('[data-bg-toggle-picker]')?.addEventListener('click', () => {
    const picker = host.querySelector('[data-bg-picker]')
    if (picker) picker.hidden = !picker.hidden
  })
  host.querySelectorAll('[data-bg-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      writeBgRule(selector, {
        'background-image':    `url("${btn.dataset.bgPick}")`,
        'background-size':     currentBgSize     || 'cover',
        'background-position': currentBgPosition || 'center',
        'background-repeat':   currentBgRepeat   || 'no-repeat'
      })
      requestRender()
    })
  })
  host.querySelector('[data-bg-clear]')?.addEventListener('click', () => {
    writeBgRule(selector, {})
    requestRender()
  })
  host.querySelectorAll('[data-bg-prop]').forEach(sel => {
    sel.addEventListener('change', () => {
      const prop = sel.dataset.bgProp
      const val  = sel.value
      const next = { ...bgRule }
      if (val) next[prop] = val
      else delete next[prop]
      writeBgRule(selector, next)
      requestRender()
    })
  })
}

function writeBgRule(selector, props) {
  if (!selector || !projectState.current) return
  // Reading the existing rule preserves any non-background properties the
  // user might have written from elsewhere (pseudo editor doesn't touch
  // the bare-state rule, but a hand-edited globalCSS could).
  const css = projectState.current.globalCSS || ''
  const existing = readBareRule(css, selector) || {}
  // Strip every `background-*` key first so a Clear truly clears.
  for (const k of Object.keys(existing)) {
    if (k.startsWith('background-')) delete existing[k]
  }
  const merged = { ...existing, ...props }
  projectState.current.globalCSS = writeBareRule(css, selector, merged)
  projectState.markCssDirty()
  eventBus.emit('project:css-changed')
}

// Read a bare-state `<selector> { ... }` rule (no pseudo). css-rule-utils'
// readRule appends `:${pseudo}` to the selector regex, so passing an empty
// pseudo produces a broken regex that requires a literal `:` after the
// selector and never matches actual bare-state rules. Parallel function
// here keeps the bare-state path self-contained.
function readBareRule(globalCSS, selector) {
  if (!globalCSS || !selector) return {}
  const escSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${escSel}(?!:)\\s*\\{([^}]*)\\}`, 'm')
  const match = re.exec(globalCSS)
  if (!match) return {}
  const out = {}
  for (const decl of match[1].split(';')) {
    const idx = decl.indexOf(':')
    if (idx === -1) continue
    const k = decl.slice(0, idx).trim()
    const v = decl.slice(idx + 1).trim()
    if (k) out[k] = v
  }
  return out
}

// Bare-state rule writer. Mirrors css-rule-utils' writeRule but without the
// `:${pseudo}` suffix. We deliberately don't extend writeRule to handle
// pseudo='' because the regex engineering for "match selector NOT followed
// by a colon-pseudo" is finicky enough that a parallel function is clearer.
function writeBareRule(globalCSS, selector, props) {
  const escSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Match `<selector> { ... }` but NOT `<selector>:hover { ... }` etc.
  const re = new RegExp(`${escSel}(?!:)\\s*\\{[^}]*\\}\\s*`, 'm')
  const lines = Object.entries(props || {})
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `  ${k}: ${v};`)
  const body = lines.join('\n')
  if (!body) {
    if (!re.test(globalCSS || '')) return globalCSS || ''
    return (globalCSS || '').replace(re, '').replace(/\n{3,}/g, '\n\n')
  }
  const newRule = `${selector} {\n${body}\n}\n`
  if (re.test(globalCSS || '')) return (globalCSS || '').replace(re, newRule)
  const base = globalCSS || ''
  const sep = base.length === 0 ? '' : (base.endsWith('\n') ? '\n' : '\n\n')
  return base + sep + newRule
}

function listProjectImages() {
  const projectDir = projectState.current?.projectDir
  if (!projectDir) return []
  // We don't synchronously list disk; rely on a window-level cache the
  // Asset Manager refreshes via 'assets:changed'. If unavailable, fall
  // back to walking projectState.current.snippets etc — but for v0.0.2
  // we just kick a refresh and read what's there last.
  const cache = window.__gstrap_assets || { images: [] }
  return (cache.images || []).map(name => `assets/images/${name}`)
}

function imagePreviewMarkup(relPath) {
  const projectDir = projectState.current?.projectDir
  if (!projectDir) return ''
  const url = `file://${projectDir}/site/${relPath}`
  return `<img src="${escAttr(url)}" alt="" loading="lazy">`
}

function basename(p) {
  return String(p).split('/').filter(Boolean).pop() || p
}

function selectRow(label, prop, options, value) {
  return `
    <label class="gstrap-sm-bg-control">
      <span>${label}</span>
      <select data-bg-prop="background-${prop.replace(/^bg-/, '')}" class="gstrap-sm-pseudo-input">
        ${options.map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o || '—'}</option>`).join('')}
      </select>
    </label>
  `
}

function escAttr(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;') }
function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]) }
