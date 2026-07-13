/**
 * GrapeStrap — Master Templates: canvas-side region locking
 *
 * PATH: src/renderer/panels/templates/lock.js
 * ROLE: On a templated PAGE, lock template chrome (editable/draggable/
 *       removable/copyable/droppable: false) while regions and their
 *       descendants stay editable; re-apply after every component-tree
 *       rebuild. In TEMPLATE-editing tabs nothing locks (v4 §14: open
 *       template directly → all elements editable).
 * DEPENDS: state/event-bus.js, state/project-state.js, state/page-state.js,
 *          editor/grapesjs-init.js, ./propagate.js (REGION_ATTR)
 * CREATED: 2026-07-12
 *
 * Divergences from library-items/lock.js, both deliberate (PLAN.md §3.5):
 *   - chrome stays selectable/hoverable — the context menu ("Edit Master
 *     Template", "Detach") and the status-bar region indicator both resolve
 *     the clicked component via editor.getSelected(); unselectable chrome
 *     would kill them.
 *   - droppable:false on chrome + wrapper — an Insert-panel drop into chrome
 *     would be silently deleted by the next propagation (chrome is recomposed
 *     wholesale from the template).
 *
 * Locks are Backbone model flags — they never serialize into getHtml() output
 * and they DIE on every setComponents. Re-application points:
 *   1. canvas:frame:load           (full walk — project open, GL re-parent)
 *   2. component:add               (per-component during setComponents storms
 *                                   — covers tab swap; pageState mutates
 *                                   activeIndex before emitting tab:focused,
 *                                   so the gate resolves the INCOMING tab)
 *   3. eventBus 'sync:code-to-canvas' (after every rebuildCanvasFromCode —
 *                                   emitted inside its undo fence, so lock
 *                                   writes are never recorded as undo steps)
 *
 * All flag writes go through withUndoPaused: component.set fires
 * component:update, and while re-application is a no-op (Backbone set with an
 * unchanged value emits nothing), the FIRST application on a fresh tree
 * shouldn't land in undo history either.
 */

import { eventBus } from '../../state/event-bus.js'
import { getEditor } from '../../editor/grapesjs-init.js'
import { projectState } from '../../state/project-state.js'
import { pageState } from '../../state/page-state.js'
import { REGION_ATTR } from './propagate.js'

let wired = false

export function wireTemplateLock() {
  if (wired) return
  wired = true
  eventBus.on('canvas:ready', editor => attachLockHandlers(editor))
  // If GrapesJS was already up before this module wired in, attach now too.
  const editor = getEditor()
  if (editor) attachLockHandlers(editor)
  // Re-apply after every code→design rebuild — the RISK #1 seam. The emit
  // happens inside rebuildCanvasFromCode's undo fence (canvas-sync.js), so
  // these writes can never become undo steps.
  eventBus.on('sync:code-to-canvas', () => relockTemplateChrome(getEditor()))
  // Chrome-dim visual (Wave 5): the lock flags themselves live only on
  // Backbone models, invisible in the canvas — the dim class is the one
  // DOM-visible marker and needs syncing on every tab swap (component:add
  // locking covers the flags but never touches the canvas root) and on GL
  // re-parents that skip canvas:frame:load (same seam grapesjs-init.js
  // resyncs <base>/globalCSS on).
  eventBus.on('tab:focused', () => syncChromeDim(getEditor(), !!activeTemplateName()))
  eventBus.on('canvas:gl-state-changed', () => syncChromeDim(getEditor(), !!activeTemplateName()))
}

function attachLockHandlers(editor) {
  editor.on('component:add', component => {
    if (!component) return
    if (!activeTemplateName()) return
    withUndoPaused(editor, () => lockOne(component))
  })
  editor.on('canvas:frame:load', () => relockTemplateChrome(editor))
}

/** templateName when the ACTIVE tab is a page built from a template; else null. */
function activeTemplateName() {
  const tab = pageState.active()
  if (!tab || (tab.kind || 'page') !== 'page') return null
  return projectState.getPage(tab.pageName)?.templateName || null
}

/** Full-tree lock pass. Safe no-op on non-templated tabs / missing editor. */
export function relockTemplateChrome(editor) {
  if (!editor) return
  const locked = !!activeTemplateName()
  syncChromeDim(editor, locked)
  if (!locked) return
  const wrapper = editor.getWrapper?.()
  if (!wrapper) return
  withUndoPaused(editor, () => {
    // Root drops land in chrome-space; propagation would erase them (§3.5).
    wrapper.set('droppable', false)
    walkChildren(wrapper, lockOne)
  })
}

/** Clear every template-lock flag (detach). Restores GrapesJS defaults. */
export function unlockAll(editor) {
  const wrapper = editor?.getWrapper?.()
  if (!wrapper) return
  syncChromeDim(editor, false)
  withUndoPaused(editor, () => {
    wrapper.set('droppable', true)
    walkChildren(wrapper, c => {
      c.set('editable', true)
      c.set('draggable', true)
      c.set('removable', true)
      c.set('copyable', true)
      c.set('droppable', true)
    })
  })
}

// ─── Chrome-dim visual (Wave 5 polish) ──────────────────────────────────────
//
// Locked template chrome had no visual cue — the flags above are Backbone
// model state that never reaches the canvas DOM. The only template marker
// that DOES exist in the canvas is REGION_ATTR on region elements, so the
// dim is pure CSS keyed on it, gated by one class on the canvas <html>
// (outside GrapesJS's managed body — never serialized, never re-rendered).
//
// Selector logic: dim exactly the "topmost" chrome subtrees — elements that
// are not a region, contain no region, and whose parent is the body or an
// element that does contain a region. The two rules select disjoint
// subtrees, so the opacity never compounds through nesting. Content inside
// a region is untouched (its ancestors either contain the region — excluded
// by :not(:has()) — or sit inside it, and regions don't nest, per
// propagate.js's top-level-regions walk). Visual only: no behavior change,
// no model writes, no undo interaction.
const DIM_CLASS = 'gstrap-tpl-locked'
const DIM_STYLE_ATTR = 'data-grapestrap-tpl-lock-css'
const DIM_CSS = `
html.${DIM_CLASS} body > *:not([${REGION_ATTR}]):not(:has([${REGION_ATTR}])),
html.${DIM_CLASS} body :has([${REGION_ATTR}]) > *:not([${REGION_ATTR}]):not(:has([${REGION_ATTR}])) {
  opacity: 0.6;
}
`

/** Toggle the chrome-dim class (+ inject its stylesheet once per canvas doc). */
function syncChromeDim(editor, locked) {
  // Canvas.getDocument() stays null until later than canvas:frame:load —
  // getFrameEl().contentDocument is the reliable form (see drag-resize.js).
  const doc = editor?.Canvas?.getFrameEl?.()?.contentDocument
  if (!doc?.documentElement) return
  if (locked && !doc.querySelector(`style[${DIM_STYLE_ATTR}]`)) {
    const tag = doc.createElement('style')
    tag.setAttribute(DIM_STYLE_ATTR, '')
    tag.textContent = DIM_CSS
    doc.head.appendChild(tag)
  }
  doc.documentElement.classList.toggle(DIM_CLASS, locked)
}

function lockOne(component) {
  if (isRegionEl(component)) {
    // The region element's PLACE in the chrome is template-owned; its content
    // is the page's. Keep it a drop zone (droppable default = true).
    component.set('removable', false)
    component.set('draggable', false)
    component.set('copyable', false)
    return
  }
  if (findRegionId(component)) return   // inside a region — page-local, free
  component.set('editable', false)
  component.set('draggable', false)
  component.set('removable', false)
  component.set('copyable', false)
  component.set('droppable', false)
}

export function isRegionEl(component) {
  const attrs = component?.getAttributes?.() || {}
  return typeof attrs[REGION_ATTR] === 'string' && attrs[REGION_ATTR] !== ''
}

/**
 * Region id for a component that sits INSIDE a region (ancestors only — the
 * region element itself returns its own id when includeSelf). Used by the
 * lock walk and the status-bar indicator.
 */
export function findRegionId(component, { includeSelf = false } = {}) {
  let cur = includeSelf ? component : component?.parent?.()
  while (cur) {
    const attrs = cur.getAttributes?.() || {}
    if (attrs[REGION_ATTR]) return attrs[REGION_ATTR]
    cur = cur.parent?.()
  }
  return null
}

/**
 * Run fn with the UndoManager stopped (no clear) — flag writes stay out of
 * history. Depth-counted because GrapesJS's stop()/start() are bare toggles
 * with no public is-active query (verified against grapesjs 0.21 typings:
 * UndoManagerModule exposes start/stop/clear/hasUndo but no isActive).
 *
 * KNOWN INTERLEAVE with the swapToTab / rebuildCanvasFromCode manual fences:
 * when a component:add fires inside one of those um.stop() windows, our
 * finally-start() re-enables tracking for the REST of that setComponents
 * storm. Both outer fences end with um.clear(), which wipes anything recorded
 * in between — end state is correct. If anyone ever removes those clear()
 * calls, revisit this (that's also why the depth counter can't simply absorb
 * the outer fences: they don't run through this helper).
 */
let pauseDepth = 0
export function withUndoPaused(editor, fn) {
  const um = editor?.UndoManager
  pauseDepth++
  if (pauseDepth === 1) um?.stop()
  try { fn() }
  finally {
    pauseDepth--
    if (pauseDepth === 0) um?.start()
  }
}

function walkChildren(component, fn) {
  const kids = component.components?.() || []
  kids.forEach(k => { fn(k); walkChildren(k, fn) })
}
