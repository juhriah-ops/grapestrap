/**
 * GrapeStrap — Style Manager: Background sub-panel
 *
 * Color (BS theme tokens), subtle variants (BS5.3+), a Custom row for any
 * colour outside the theme palette (see custom-color.js — writes
 * `background-color` into the same rule), gradient toggle, and a
 * "Background image" row that lets the user pick from project assets and
 * writes a CSS rule into the project's globalCSS scoped by the selected
 * component's first non-BS class (or id) — same pattern the pseudo-class
 * editor uses, so behavior stays predictable: no inline styles, edits are
 * portable, round-trip via globalCSS reads.
 *
 * url() values are written FILE-RELATIVE to the stylesheet
 * (`../images/foo.png` from assets/css/style.css) — the canonical convention
 * shared with export and the canvas rewrite (src/shared/css-urls.js).
 */

import {
  BG_COLOR, BG_SUBTLE,
  bgColorPattern
} from './bs-classes.js'
import { applyGroup, readGroup, toggleClass } from './class-utils.js'
import { projectState } from '../../state/project-state.js'
import { eventBus } from '../../state/event-bus.js'
import { pickSelector, isBsUtility, readBareRule, writeBareRule } from './css-rule-utils.js'
import { customColorRowMarkup, wireCustomColorRow, clearCustomColor } from './custom-color.js'
import { toDocumentRelativeUrl, stylesheetDirOf } from '../../../shared/css-urls.js'
import { t } from '../../i18n.js'

export const id = 'background'
export const labelKey = 'sm.panel.background'

const BG_SIZES = ['', 'cover', 'contain', 'auto']
const BG_POSITIONS = ['', 'center', 'top', 'bottom', 'left', 'right']
const BG_REPEATS = ['', 'no-repeat', 'repeat', 'repeat-x', 'repeat-y']
const BG_ATTACHMENTS = ['', 'scroll', 'fixed', 'local']

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
  const currentBgAttachment = bgRule['background-attachment'] || ''
  const currentBgColor    = bgRule['background-color']    || ''

  // Project images for the picker.
  const images = listProjectImages()

  host.innerHTML = `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${escHtml(t('sm.label.color'))}</label>
      <div class="gstrap-sm-swatches">
        ${BG_COLOR.map(c => {
          const cls = `bg-${c.value}`
          return `<button class="gstrap-sm-swatch ${cur === cls ? 'is-active' : ''}"
                          data-color="${c.value}" style="--swatch:${c.swatch}" title="${cls}"></button>`
        }).join('')}
      </div>
    </div>
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${escHtml(t('sm.label.subtle'))}</label>
      <div class="gstrap-sm-grid">
        ${BG_SUBTLE.map(s => {
          const cls = `bg-${s}`
          return `<button class="gstrap-sm-pill ${cur === cls ? 'is-active' : ''}"
                          data-subtle="${s}" title="${cls}">${s.replace('-subtle','')}</button>`
        }).join('')}
        <button class="gstrap-sm-pill gstrap-sm-clear" data-clear>${escHtml(t('action.clear'))}</button>
      </div>
    </div>
    ${customColorRowMarkup({ selector, value: currentBgColor })}
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${escHtml(t('sm.label.effect'))}</label>
      <div class="gstrap-sm-grid">
        <button class="gstrap-sm-pill ${hasGradient ? 'is-active' : ''}" data-gradient
                title="bg-gradient">${escHtml(t('sm.gradient'))}</button>
      </div>
    </div>

    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${escHtml(t('sm.label.image'))}</label>
      ${!selector ? `
        <div class="gstrap-sm-hint">
          ${escHtml(t('sm.bg-needs-selector'))}
        </div>
      ` : `
        <div class="gstrap-sm-bg-image">
          ${currentBgImage
            ? `<div class="gstrap-sm-bg-current" data-bg-current title="${escAttr(currentBgImage)}">
                 ${imagePreviewMarkup(currentBgImage)}
                 <span class="gstrap-sm-bg-name">${escHtml(basename(currentBgImage))}</span>
               </div>`
            : `<div class="gstrap-sm-bg-empty">${escHtml(t('sm.no-image'))}</div>`}
          <div class="gstrap-sm-bg-actions">
            <button class="gstrap-sm-pill" data-bg-toggle-picker>${escHtml(currentBgImage ? t('sm.change') : t('sm.pick'))}</button>
            ${currentBgImage ? `<button class="gstrap-sm-pill gstrap-sm-clear" data-bg-clear>${escHtml(t('action.clear'))}</button>` : ''}
          </div>
          <div class="gstrap-sm-bg-picker" data-bg-picker hidden>
            ${images.length === 0
              ? `<div class="gstrap-sm-hint">${escHtml(t('sm.no-project-images'))}</div>`
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
            ${selectRow(t('sm.label.size'),     'bg-size',     BG_SIZES,     currentBgSize)}
            ${selectRow(t('sm.label.position'), 'bg-position', BG_POSITIONS, currentBgPosition)}
            ${selectRow(t('sm.label.repeat'),   'bg-repeat',   BG_REPEATS,   currentBgRepeat)}
            ${selectRow(t('sm.label.attachment'), 'bg-attachment', BG_ATTACHMENTS, currentBgAttachment)}
          </div>
        ` : ''}
      `}
    </div>
  `

  // Picking a predetermined token drops any free colour written to the rule,
  // so the two surfaces can never both claim the element's background.
  host.querySelectorAll('[data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `bg-${btn.dataset.color}`
      applyGroup(component, bgColorPattern(), cur === cls ? null : cls)
      clearCustomColor(selector, 'background-color')
      requestRender()
    })
  })
  host.querySelectorAll('[data-subtle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = `bg-${btn.dataset.subtle}`
      applyGroup(component, bgColorPattern(), cur === cls ? null : cls)
      clearCustomColor(selector, 'background-color')
      requestRender()
    })
  })
  wireCustomColorRow(host, {
    component, selector,
    prop: 'background-color',
    classPattern: bgColorPattern(),
    requestRender
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
        'background-repeat':   currentBgRepeat   || 'no-repeat',
        // Re-picking an image shouldn't drop a chosen attachment, since it's
        // now one of the five declarations this row strips-then-rewrites.
        ...(currentBgAttachment ? { 'background-attachment': currentBgAttachment } : {})
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

// The five declarations the background-image row owns. Stripping exactly
// these (rather than every `background-*` key, as this did before 2026-08-17)
// keeps a Clear honest without eating `background-color`, which the Custom
// colour row owns in the same rule.
const BG_IMAGE_PROPS = [
  'background-image', 'background-size', 'background-position', 'background-repeat',
  'background-attachment'
]

function writeBgRule(selector, props) {
  if (!selector || !projectState.current) return
  // Reading the existing rule preserves any non-background properties the
  // user might have written from elsewhere (pseudo editor doesn't touch
  // the bare-state rule, but a hand-edited globalCSS could).
  const css = projectState.current.globalCSS || ''
  const existing = readBareRule(css, selector) || {}
  for (const k of BG_IMAGE_PROPS) delete existing[k]
  const merged = { ...existing, ...props }
  projectState.current.globalCSS = writeBareRule(css, selector, merged)
  projectState.markCssDirty()
  eventBus.emit('project:css-changed')
}

// readBareRule / writeBareRule moved to css-rule-utils.js (2026-08-03) with
// the boundary-anchored selector matching + its unit tests.

function listProjectImages() {
  const projectDir = projectState.current?.projectDir
  if (!projectDir) return []
  // We don't synchronously list disk; rely on a window-level cache the
  // Asset Manager refreshes via 'assets:changed'. If unavailable, fall
  // back to walking projectState.current.snippets etc — but for v0.0.2
  // we just kick a refresh and read what's there last.
  //
  // Paths are FILE-RELATIVE to the project stylesheet (assets/css/style.css)
  // — the canonical url() convention — so the written rule resolves both in
  // export (<link href="assets/css/style.css">) and in the canvas (rewritten
  // to document-relative at inject time by grapesjs-init.js).
  const cache = window.__gstrap_assets || { images: [] }
  return (cache.images || []).map(name => `../images/${name}`)
}

// The stylesheet's directory relative to the site root — the base every
// stylesheet-relative url() resolves against.
function stylesheetBase() {
  return stylesheetDirOf(projectState.current?.manifest?.globalCSS || 'assets/css/style.css')
}

function imagePreviewMarkup(relPath) {
  const projectDir = projectState.current?.projectDir
  if (!projectDir) return ''
  // relPath is stylesheet-relative (`../images/foo.png`) — or the legacy
  // site-root-relative shape when read back from an unmigrated rule. Resolve
  // to site-root-relative before anchoring at the project's site/ dir.
  const siteRelative = toDocumentRelativeUrl(relPath, stylesheetBase())
  const url = `file://${projectDir}/site/${siteRelative}`
  return `<img src="${escAttr(url)}" alt="" loading="lazy">`
}

function basename(p) {
  return String(p).split('/').filter(Boolean).pop() || p
}

function selectRow(label, prop, options, value) {
  return `
    <label class="gstrap-sm-bg-control">
      <span>${escHtml(label)}</span>
      <select data-bg-prop="background-${prop.replace(/^bg-/, '')}" class="gstrap-sm-pseudo-input">
        ${options.map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o || '—'}</option>`).join('')}
      </select>
    </label>
  `
}

function escAttr(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;') }
function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]) }
