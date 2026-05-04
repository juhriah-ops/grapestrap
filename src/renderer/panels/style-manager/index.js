/**
 * GrapeStrap — Style Manager (right panel, "Style" accordion)
 *
 * Replaces the v0.0.1 placeholder. Renders one accordion section per sub-panel
 * (spacing, display, text in chunk A; flex/background/border/sizing in
 * chunk B; pseudo-class state bar + cascade view in chunk C).
 *
 * Each sub-panel exports `{ id, label, render(host, ctx) }`. The shell:
 *   - re-renders the active sub-panel whenever its host element appears in
 *     the DOM (initial open) or the user opens/closes a section.
 *   - re-renders ALL open sub-panels on `canvas:selected` /
 *     `canvas:component-class-changed` (so picking a class in one sub-panel
 *     refreshes "Active" state in every open sub-panel — important for the
 *     Display panel which gates Flex visibility in chunk B).
 *   - exposes a `requestRender` callback in the ctx so a sub-panel can
 *     force its own re-render after a mutation without going through the
 *     event bus.
 *
 * Open/closed state for accordion sections is *per-app-session*, not
 * persisted. The default open set is `['spacing']` — the most-used surface.
 */

import { eventBus } from '../../state/event-bus.js'

import * as spacing from './spacing.js'
import * as display from './display.js'
import * as text    from './text.js'

const SUBPANELS = [spacing, display, text]
const DEFAULT_OPEN = new Set(['spacing'])

let host = null
let openSet = new Set(DEFAULT_OPEN)
let currentComponent = null
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
    wired = true
  }
  currentComponent = typeof getComponent === 'function' ? getComponent() : null
  paint()
}

function paint() {
  if (!host) return
  if (!currentComponent) {
    host.innerHTML = `<div class="gstrap-empty">Select an element to edit its styles.</div>`
    return
  }
  host.innerHTML = SUBPANELS.map(sp => `
    <section class="gstrap-sm-section" data-sp="${sp.id}">
      <button class="gstrap-sm-toggle" data-toggle="${sp.id}" aria-expanded="${openSet.has(sp.id)}">
        <span class="gstrap-sm-caret">${openSet.has(sp.id) ? '▾' : '▸'}</span>
        <span class="gstrap-sm-title">${sp.label}</span>
      </button>
      <div class="gstrap-sm-body" data-body="${sp.id}" ${openSet.has(sp.id) ? '' : 'hidden'}></div>
    </section>
  `).join('')

  host.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggle
      if (openSet.has(id)) openSet.delete(id)
      else openSet.add(id)
      paint()
    })
  })

  rerenderOpen()
}

function rerenderOpen() {
  if (!host || !currentComponent) { paint(); return }
  for (const sp of SUBPANELS) {
    if (!openSet.has(sp.id)) continue
    const body = host.querySelector(`[data-body="${sp.id}"]`)
    if (!body) continue
    sp.render(body, {
      component: currentComponent,
      requestRender: rerenderOpen
    })
  }
}
