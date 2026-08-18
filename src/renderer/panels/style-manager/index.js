/**
 * GrapeStrap — Style Manager (right panel, "Style" accordion)
 *
 * Replaces the v0.0.1 placeholder. A pseudo-class state bar lives at the top
 * of the panel; below it, an accordion with one section per sub-panel (chunk
 * A: spacing/display/text; chunk B: flex/background/border/sizing; chunk C:
 * pseudo-state editor + cascade view).
 *
 * Architecture:
 *   - Each sub-panel exports `{ id, label, render(host, ctx) }`. The shell
 *     re-renders the active sub-panel whenever its host element appears in
 *     the DOM (initial open) or the user opens/closes a section.
 *   - All open sub-panels re-render on `canvas:selected`,
 *     `canvas:component-class-changed`, and pseudo-state changes — sub-panels
 *     decide what to do with the new state from `ctx`.
 *   - `requestRender(ctx)` lets sub-panels force a re-render after a mutation
 *     without going through the event bus.
 *
 * Pseudo-class state bar (chunk C):
 *   - Buttons: normal | :hover | :focus | :active | :disabled
 *   - When non-normal, the Pseudo-class Styles sub-panel renders a property
 *     editor that writes a `selector:state` rule to project `style.css`.
 *   - Other sub-panels keep editing classes (BS utilities apply across all
 *     states). The bar tells the user *which* state's project-CSS rule the
 *     Pseudo-class Styles sub-panel is bound to.
 *   - Picking a non-normal state on an element with no usable selector toasts
 *     a warning and the bar reverts to Normal.
 *
 * Open/closed state for accordion sections is *per-app-session*, not
 * persisted. Default open set is `['spacing']` — the most-used surface.
 *
 * UPDATED: 2026-08-18 — Navbar sub-panel registered between sizing and pseudo
 *          (behavior settings for a selected `nav.navbar`; renders a hint row
 *          for every other selection, so its position in the list costs
 *          nothing when it does not apply), and Animation right after it
 *          (reveal / hover / loop `data-gs-anim-*` settings, which apply to
 *          any selection at all).
 */

import { eventBus } from '../../state/event-bus.js'
import { projectState } from '../../state/project-state.js'
import { t } from '../../i18n.js'

import * as spacing    from './spacing.js'
import * as display    from './display.js'
import * as flex       from './flex.js'
import * as columns    from './columns.js'
import * as text       from './text.js'
import * as background from './background.js'
import * as border     from './border.js'
import * as sizing     from './sizing.js'
import * as navbar     from './navbar.js'
import * as animation  from './animation.js'
import * as pseudo     from './pseudo-class.js'
import * as cascade    from './cascade.js'

import { pickSelector, isBsUtility } from './css-rule-utils.js'

const SUBPANELS = [spacing, display, flex, columns, text, background, border, sizing, navbar, animation, pseudo, cascade]
const DEFAULT_OPEN = new Set(['spacing'])

// 'Normal' is prose (labelKey); the ':hover'-style labels are CSS syntax and
// stay literal — translating pseudo-class names would mislead.
const PSEUDO_STATES = [
  { value: 'normal',   labelKey: 'sm.pseudo-normal' },
  { value: 'hover',    label: ':hover'    },
  { value: 'focus',    label: ':focus'    },
  { value: 'active',   label: ':active'   },
  { value: 'disabled', label: ':disabled' }
]

let host = null
let openSet = new Set(DEFAULT_OPEN)
let currentComponent = null
let pseudoState = 'normal'
let wired = false

export function renderStyleManager(target, getComponent) {
  host = target
  host.classList.add('gstrap-sm-host')
  if (!wired) {
    eventBus.on('canvas:selected',   c => { currentComponent = c; rerenderOpen() })
    eventBus.on('canvas:deselected', () => { currentComponent = null; rerenderOpen() })
    // Class chip mutations from the Properties panel (or Quick Tag, or any
    // other surface) don't fire selection events, so re-render-on-class
    // change keeps every sub-panel's "Active" state honest.
    eventBus.on('canvas:component-class-changed', () => rerenderOpen())
    // Project lifecycle: on close, drop pseudo state back to normal so the
    // next-opened project doesn't inherit a hover-editing context.
    eventBus.on('project:closed', () => { pseudoState = 'normal'; paint() })
    eventBus.on('project:css-changed', () => rerenderOpen())
    // Background sub-panel reads the project's image list — refresh on
    // every asset change so newly-dropped images show up in the picker.
    eventBus.on('assets:changed', () => rerenderOpen())
    wired = true
  }
  currentComponent = typeof getComponent === 'function' ? getComponent() : null
  paint()
}

function paint() {
  if (!host) return
  if (!currentComponent) {
    host.innerHTML = `<div class="gstrap-empty">${escHtml(t('sm.empty'))}</div>`
    return
  }
  host.innerHTML = `
    ${renderPseudoBar()}
    ${SUBPANELS.map(sp => `
      <section class="gstrap-sm-section" data-sp="${sp.id}">
        <button class="gstrap-sm-toggle" data-toggle="${sp.id}" aria-expanded="${openSet.has(sp.id)}">
          <span class="gstrap-sm-caret">${openSet.has(sp.id) ? '▾' : '▸'}</span>
          <span class="gstrap-sm-title">${escHtml(t(sp.labelKey))}</span>
        </button>
        <div class="gstrap-sm-body" data-body="${sp.id}" ${openSet.has(sp.id) ? '' : 'hidden'}></div>
      </section>
    `).join('')}
  `

  host.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggle
      if (openSet.has(id)) openSet.delete(id)
      else openSet.add(id)
      paint()
    })
  })

  host.querySelectorAll('[data-pseudo-state]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.pseudoState
      setPseudoState(next)
    })
  })

  rerenderOpen()
}

function renderPseudoBar() {
  return `
    <div class="gstrap-sm-pseudo-bar" data-pseudo-bar>
      ${PSEUDO_STATES.map(s => `
        <button class="gstrap-sm-pseudo-btn ${s.value === pseudoState ? 'is-active' : ''}"
                data-pseudo-state="${s.value}">${s.labelKey ? escHtml(t(s.labelKey)) : s.label}</button>
      `).join('')}
    </div>
  `
}

function setPseudoState(next) {
  if (next === pseudoState) return
  if (next !== 'normal') {
    if (!projectState.current) {
      eventBus.emit('toast', {
        type: 'warning',
        message: t('sm.toast.pseudo-needs-project')
      })
      return
    }
    const sel = pickSelector(currentComponent, isBsUtility)
    if (!sel) {
      eventBus.emit('toast', {
        type: 'warning',
        message: t('sm.toast.pseudo-needs-selector')
      })
      return
    }
  }
  pseudoState = next
  // Auto-open the pseudo-state sub-panel when entering a non-normal state so
  // the editor is visible immediately. Don't auto-close on returning to
  // normal — user may want to keep the hint visible.
  if (next !== 'normal') openSet.add('pseudo')
  paint()
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

function rerenderOpen() {
  if (!host || !currentComponent) { paint(); return }
  for (const sp of SUBPANELS) {
    if (!openSet.has(sp.id)) continue
    const body = host.querySelector(`[data-body="${sp.id}"]`)
    if (!body) continue
    sp.render(body, {
      component: currentComponent,
      pseudoState,
      requestRender: rerenderOpen,
      onClearPseudoState: () => { pseudoState = 'normal'; paint() }
    })
  }
}
