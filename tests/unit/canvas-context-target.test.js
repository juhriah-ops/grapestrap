/**
 * GrapeStrap — Unit: canvas right-click target resolution
 *
 * PATH: tests/unit/canvas-context-target.test.js
 * ROLE: Pins the decision the canvas context-menu handler makes before the
 *       menu is built: WHICH component a right-click is on. Getting it wrong
 *       is silent — a null or stale component still produces a menu, just one
 *       missing every row that depends on the component (Select Parent /
 *       Select Child, the class-rule jumps), which is exactly how the shipped
 *       bug presented. The three load-bearing cases are here: resolution walks
 *       UP from a non-component target, a `selectable: false` component hands
 *       off to its nearest selectable ancestor, and an open RTE session freezes
 *       the selection instead of stealing it.
 * DEPENDS: node:test, node:assert,
 *          ../../src/renderer/editor/canvas-context-target.js
 * CREATED: 2026-08-18
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { componentAtElement, selectContextTarget } from '../../src/renderer/editor/canvas-context-target.js'

/**
 * Minimal stand-in for a GrapesJS component: just the four members the
 * resolver touches (getEl, components, get, parent).
 */
function makeComponent({ element = null, children = [], flags = {} } = {}) {
  const component = {
    getEl: () => element,
    components: () => ({ models: children }),
    get: key => flags[key],
    parent: () => component.parentRef || null
  }
  for (const child of children) child.parentRef = component
  return component
}

/** Stand-in DOM element with just parentElement, which is all the walk uses. */
function makeElement(parentElement = null) {
  return { parentElement }
}

/**
 * Editor stub recording what got selected. `selectable: false` is honoured the
 * way EditorModel.setSelected does under `useValid` — walk to the nearest
 * selectable ancestor — so the handoff assertion tests real behaviour and not
 * just the call.
 */
function makeEditor(wrapper, { editing = null } = {}) {
  let selected = null
  return {
    getWrapper: () => wrapper,
    getEditing: () => editing,
    getSelected: () => selected,
    select: (component, options) => {
      let target = component
      while (target && target.get('selectable') === false && options?.useValid) {
        target = target.parent()
      }
      selected = target
    },
    setSelectedForTest: component => { selected = component }
  }
}

test('componentAtElement walks up from a target that owns no component', () => {
  const sectionEl = makeElement()
  const headingEl = makeElement(sectionEl)
  const spanInsideHeading = makeElement(headingEl)   // e.g. an <em> GrapesJS never modelled

  const heading = makeComponent({ element: headingEl })
  const section = makeComponent({ element: sectionEl, children: [heading] })
  const wrapper = makeComponent({ element: makeElement(), children: [section] })

  assert.equal(componentAtElement(makeEditor(wrapper), spanInsideHeading), heading)
  assert.equal(componentAtElement(makeEditor(wrapper), sectionEl), section)
})

test('componentAtElement returns null for an element outside the component tree', () => {
  const wrapper = makeComponent({ element: makeElement() })
  // Overlay chrome injected into the iframe (drag-resize handles) has no
  // component — the caller must get null, not the wrapper by accident.
  assert.equal(componentAtElement(makeEditor(wrapper), makeElement()), null)
  assert.equal(componentAtElement(makeEditor(wrapper), null), null)
  assert.equal(componentAtElement(null, makeElement()), null)
})

test('selectContextTarget selects the component under the cursor', () => {
  const headingEl = makeElement()
  const heading = makeComponent({ element: headingEl })
  const wrapper = makeComponent({ element: makeElement(), children: [heading] })
  const editor = makeEditor(wrapper)

  assert.equal(selectContextTarget(editor, headingEl), heading)
  assert.equal(editor.getSelected(), heading)
})

test('selectContextTarget reports the ancestor a non-selectable component hands off to', () => {
  const lockedEl = makeElement()
  const bandEl = makeElement()
  const locked = makeComponent({ element: lockedEl, flags: { selectable: false } })
  const band = makeComponent({ element: bandEl, children: [locked] })
  const wrapper = makeComponent({ element: makeElement(), children: [band] })
  const editor = makeEditor(wrapper)

  // A locked library item is selectable:false; GrapesJS's own click path lands
  // the selection on the nearest selectable ancestor, and the menu has to be
  // built for THAT component, not for the one under the pointer.
  assert.equal(selectContextTarget(editor, lockedEl), band)
})

test('selectContextTarget leaves the selection alone while text is being edited', () => {
  const headingEl = makeElement()
  const paragraph = makeComponent({ element: makeElement() })
  const heading = makeComponent({ element: headingEl })
  const wrapper = makeComponent({ element: makeElement(), children: [heading, paragraph] })
  const editor = makeEditor(wrapper, { editing: paragraph })
  editor.setSelectedForTest(paragraph)

  // Right-clicking inside an open RTE session must not tear it down by
  // re-selecting — same carve-out GrapesJS's onClick makes.
  assert.equal(selectContextTarget(editor, headingEl), paragraph)
  assert.equal(editor.getSelected(), paragraph)
})

test('selectContextTarget keeps the current selection when the target resolves to nothing', () => {
  const paragraph = makeComponent({ element: makeElement() })
  const wrapper = makeComponent({ element: makeElement(), children: [paragraph] })
  const editor = makeEditor(wrapper)
  editor.setSelectedForTest(paragraph)

  assert.equal(selectContextTarget(editor, makeElement()), paragraph)
  assert.equal(selectContextTarget(null, makeElement()), null)
})
