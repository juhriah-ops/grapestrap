// =============================================================
// PATH: src/renderer/editor/canvas-context-target.js
// ROLE: Answer "which component did the user just right-click on?" for the
//       canvas iframe, and make GrapesJS's selection agree with the answer.
//       The canvas context-menu handler (editor/grapesjs-init.js) builds its
//       whole component section from that component, so getting it wrong
//       silently strips menu rows instead of throwing.
// DEPENDS: (nothing — the editor is passed in, so this stays importable under
//          `node --test` alongside editor/component-lock.js)
// CREATED: 2026-08-18
//
// ── Why this module exists (the bug it was cut from) ──────────────────────
// grapesjs-init.js used to resolve the right-clicked component by dispatching
// a synthetic `mousedown` at the cursor and reading `editor.getSelected()` a
// microtask later, on the stated assumption that "mousedown is what GrapesJS
// listens on for selection". It is not. In grapesjs 0.21.13 the select-comp
// command binds selection to **click**:
//     methods[method](body, 'click', this.onClick)     // dist/grapes.mjs
// and a real right-click never produces a `click` event at all. So the
// synthetic mousedown selected nothing, and the microtask-later read returned
// whatever had been selected BEFORE the right-click — null on a freshly
// opened page. A null component makes buildComponentMenuItems() emit only its
// always-on rows: the Select Parent / Select Child block (and the class-rule
// block) vanish entirely, which is exactly what the user reported. A stale
// non-null component was worse: the menu built, but Parent/Child pointed at
// the previously selected element.
//
// The fix is to resolve the component from the event target directly and
// select it synchronously, mirroring what GrapesJS's own onClick does:
//   - walk UP from the target element until an element owns a component
//     (the target is often a non-component child or a raw text node's parent),
//   - hand it to editor.select() with `useValid` so a `selectable: false`
//     component hands off to its nearest selectable ancestor exactly as a
//     left-click would,
//   - freeze selection while an RTE session is open, the same carve-out
//     onClick makes for text editing.
// =============================================================

/**
 * The component that owns `element`, or the nearest ancestor element's
 * component.
 *
 * Resolution is by element identity against the live component tree rather
 * than through GrapesJS's internal `__gjsv` view marker: the marker is not
 * public API, and one indexing pass over a page's components costs nothing at
 * human right-click rate.
 *
 * @param {object} editor - GrapesJS editor instance
 * @param {Element|null} element - Event target inside the canvas iframe
 * @returns {object|null} the owning component, or null when the element sits
 *          outside the component tree entirely (injected overlay chrome, or a
 *          right-click that landed after the frame was torn down)
 */
export function componentAtElement(editor, element) {
  const wrapper = editor?.getWrapper?.()
  if (!wrapper || !element) return null
  const byElement = new Map()
  indexComponentElements(wrapper, byElement)
  // Element.parentElement stops at the document root on its own, so a target
  // that belongs to nothing walks out of the loop rather than spinning.
  for (let node = element; node; node = node.parentElement) {
    const owner = byElement.get(node)
    if (owner) return owner
  }
  return null
}

/**
 * Index a component subtree by the DOM element each component renders to.
 *
 * @param {object} component - Component to index, together with its descendants
 * @param {Map<Element, object>} out - Accumulator, mutated in place
 * @returns {void} — components with no rendered element (never mounted, or
 *          mounted in a frame that has since been rebuilt) are skipped
 */
function indexComponentElements(component, out) {
  const element = component?.getEl?.()
  if (element) out.set(element, component)
  for (const child of component?.components?.()?.models || []) {
    indexComponentElements(child, out)
  }
}

/**
 * Select whatever the user right-clicked and report what GrapesJS settled on.
 *
 * Right-click SELECTS the element under the cursor and then menus it — that
 * targeting contract predates this module (see the grapesjs-init.js header)
 * and is deliberately preserved; only the mechanism changed.
 *
 * @param {object} editor - GrapesJS editor instance
 * @param {Element|null} element - Event target of the contextmenu event
 * @returns {object|null} the component the menu should be built for: what
 *          editor.getSelected() reports AFTER the selection call, so a
 *          `selectable: false` component reports the ancestor that actually
 *          took the selection. Falls back to the current selection when the
 *          target resolves to nothing (a right-click on chrome should not
 *          blank a selection the user already made) and to null when there is
 *          no editor at all.
 */
export function selectContextTarget(editor, element) {
  if (!editor) return null
  // An open RTE session owns the selection: GrapesJS's own onClick refuses to
  // re-target while `getEditing()` is set, and re-selecting here would tear
  // down the text session the user is right-clicking inside of.
  if (editor.getEditing?.()) return editor.getSelected?.() || null
  const target = componentAtElement(editor, element)
  if (!target) return editor.getSelected?.() || null
  // No `event` in the options on purpose: passing the mouse event through
  // would let a Ctrl/Shift right-click toggle multi-selection, which is a
  // left-click gesture. `useValid` is the one flag onClick relies on.
  editor.select?.(target, { useValid: true })
  return editor.getSelected?.() || target
}
