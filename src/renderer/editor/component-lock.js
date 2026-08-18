// =============================================================
// PATH: src/renderer/editor/component-lock.js
// ROLE: One answer to "may the user change this component?" — the predicate
//       every panel and command uses before it renders a control enabled or
//       commits a mutation. Lives on its own because getting it wrong is
//       silent: a false positive greys out controls the user can see no
//       reason for, and a false negative lets an edit land on locked
//       template chrome.
// DEPENDS: (nothing — pure model-flag reads, so it stays importable under
//          `node --test` alongside panels/element-fields.js)
// CREATED: 2026-08-18
//
// ── Why `editable === false` is NOT the test ──────────────────────────────
// GrapesJS's `editable` flag means "this component's text can be edited
// INLINE on the canvas", and its factory default is FALSE for every
// structural component: a <div>, <table>, <tr>, <td>, <ul> all report
// editable:false on a brand-new page (measured against grapesjs 0.21.13 —
// `editable: false` in the Component defaults; only text-ish types, <a>,
// <img> and the like default to true). Reading that flag as a lock therefore
// declared every table on every page locked, which is what disabled the whole
// Table context-menu group and every Attributes-section table control.
// tests/e2e/templates.spec.js:306 records the same finding from the templates
// side ("editable ... can't distinguish locked from unlocked chrome").
//
// The flags that DO carry the signal are the ones whose unlocked default is
// true and which both lock modules flip together:
//   - panels/templates/lock.js#lockOne     → editable, draggable, removable,
//                                            copyable, droppable = false
//   - panels/library-items/lock.js#lockComponent → selectable, hoverable,
//                                            editable, removable, draggable,
//                                            copyable = false
// `removable` is in both sets, defaults to true, and is never false on an
// ordinary component — so it is the reliable lock marker.
// =============================================================

/**
 * True when a component is locked against user edits.
 *
 * Two independent signals, either of which means locked:
 *   1. `removable === false` — the flag both lock modules set on template
 *      chrome, template regions and library items (and the one GrapesJS
 *      itself sets on the wrapper/body root, which is equally not editable).
 *   2. `editable === false` on a component whose TYPE defaults it to true —
 *      an explicitly revoked inline-text lock (`<a>`, headings, text blocks).
 *      Comparing against the component's own `defaults` is what keeps this
 *      clause from firing on the structural components GrapesJS ships with
 *      `editable: false` out of the box.
 *
 * @param {object} component - GrapesJS component (Backbone model)
 * @returns {boolean} true when locked; false for a missing component — a
 *          caller with nothing selected has its own guard, and reporting
 *          "locked" there would disable controls for the wrong reason
 */
export function isComponentLocked(component) {
  if (!component) return false
  if (component.get?.('removable') === false) return true
  return component.get?.('editable') === false && defaultEditable(component) !== false
}

/**
 * The `editable` value this component's TYPE ships with, before any flag the
 * app wrote on the instance.
 *
 * @param {object} component - GrapesJS component
 * @returns {*} the default, or undefined when the model exposes no defaults
 *          (a hand-built test stub) — read by isComponentLocked() as "this
 *          type is editable by default", which keeps an explicit
 *          `editable: false` on a stub meaningful
 */
function defaultEditable(component) {
  const defaults = typeof component.defaults === 'function'
    ? component.defaults()
    : component.defaults
  return defaults ? defaults.editable : undefined
}
