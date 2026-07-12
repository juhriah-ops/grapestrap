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
  if (!editor || !activeTemplateName()) return
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
