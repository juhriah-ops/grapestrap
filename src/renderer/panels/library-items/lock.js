/**
 * GrapeStrap — Library Items: canvas-side lock
 *
 * Library wrappers in pages look like:
 *   <div data-grpstr-library="<id>" data-grpstr-library-name="<name>">…inner…</div>
 *
 * The wrapper itself stays selectable (so the user can detach), but every
 * descendant is locked from selection / inline edit / drag / delete. Editing
 * a library instance has to happen by opening the library item in its own
 * tab — that's the whole Dreamweaver-Library promise.
 *
 * GrapesJS doesn't propagate `selectable: false` from a parent to its
 * descendants for free. We listen on `component:add` and walk the new tree
 * to apply the lock; a subsequent `component:add` inside the wrapper (e.g.
 * when GrapesJS re-renders or a plugin manipulates the tree) re-applies.
 */

import { eventBus } from '../../state/event-bus.js'
import { getEditor } from '../../editor/grapesjs-init.js'

const WRAPPER_ATTR = 'data-grpstr-library'

let wired = false

export function wireLibraryLock() {
  if (wired) return
  wired = true
  eventBus.on('canvas:ready', editor => attachLockHandlers(editor))
  // If GrapesJS was already up before this module wired in, attach now too.
  const editor = getEditor()
  if (editor) attachLockHandlers(editor)
}

function attachLockHandlers(editor) {
  // Component-add fires for the new component AND every nested component
  // GrapesJS adds during a setComponents() storm. Walk from each addition
  // upward to find a library wrapper ancestor; if found, lock the new
  // component itself.
  editor.on('component:add', component => {
    if (!component) return
    if (insideLibraryWrapper(component)) lockComponent(component)
    // The wrapper itself: ensure it's still selectable but children we just
    // walked over have been locked. New: also walk descendants for the case
    // where a wrapper is added as a single subtree (via setComponents).
    if (isLibraryWrapper(component)) {
      walkChildren(component, lockComponent)
    }
  })

  // On project load, GrapesJS sometimes paints components without firing
  // component:add per child. Walk the entire wrapper tree post-load.
  editor.on('canvas:frame:load', () => relockAll(editor))
  editor.on('storage:end:load', () => relockAll(editor))
}

export function relockAll(editor) {
  if (!editor) return
  const wrapper = editor.getWrapper?.()
  if (!wrapper) return
  walkAll(wrapper, c => {
    if (insideLibraryWrapper(c) && c !== wrapper) lockComponent(c)
  })
}

function isLibraryWrapper(component) {
  const attrs = component.getAttributes?.() || {}
  return Object.prototype.hasOwnProperty.call(attrs, WRAPPER_ATTR)
}

function insideLibraryWrapper(component) {
  let cur = component.parent?.()
  while (cur) {
    if (isLibraryWrapper(cur)) return true
    cur = cur.parent?.()
  }
  return false
}

function lockComponent(component) {
  // Idempotent — set is a no-op if the value is unchanged.
  component.set('selectable', false)
  component.set('hoverable',  false)
  component.set('editable',   false)
  component.set('removable',  false)
  component.set('draggable',  false)
  component.set('copyable',   false)
}

function walkChildren(component, fn) {
  const kids = component.components?.() || []
  kids.forEach(k => { fn(k); walkChildren(k, fn) })
}

function walkAll(root, fn) {
  fn(root)
  walkChildren(root, fn)
}

export const LIBRARY_WRAPPER_ATTR = WRAPPER_ATTR
