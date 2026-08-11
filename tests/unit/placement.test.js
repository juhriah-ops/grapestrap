/**
 * GrapeStrap — Unit: canvas insertion placement (editor/placement.js)
 *
 * PATH: tests/unit/placement.test.js
 * ROLE: Pins the pure zone/index math extracted for chunk A1 — the edge-band
 *       clamp (8px floor / 24px ceiling), the container inside-zone vs.
 *       leaf midpoint-split branches of decideDropPlacement, and the
 *       wrapperIndexForY boundary cases (above-first, below-last, empty).
 *       resolvePlacement/insertAtPlacement are integration-level (they call
 *       real GrapesJS component methods) and are covered by the e2e specs
 *       instead — see tests/e2e/insert-zones.spec.js.
 * DEPENDS: node:test, node:assert, ../../src/renderer/editor/placement.js
 * CREATED: 2026-08-11
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONTAINER_TAGS, isContainerTag, tagOf,
  decideDropPlacement, wrapperIndexForY
} from '../../src/renderer/editor/placement.js'

test('CONTAINER_TAGS / isContainerTag cover the canonical container set', () => {
  assert.deepEqual(
    [...CONTAINER_TAGS].sort(),
    ['article', 'aside', 'div', 'footer', 'form', 'header', 'main', 'nav', 'ol', 'section', 'ul'].sort()
  )
  assert.equal(isContainerTag('div'), true)
  assert.equal(isContainerTag('DIV'), true) // case-insensitive
  assert.equal(isContainerTag('p'), false)
  assert.equal(isContainerTag('li'), false)  // deliberately excluded — typed by its parent
  assert.equal(isContainerTag(''), false)
  assert.equal(isContainerTag(undefined), false)
})

test('tagOf reads a GrapesJS component\'s tagName, lowercased', () => {
  const component = { get: key => (key === 'tagName' ? 'SECTION' : undefined) }
  assert.equal(tagOf(component), 'section')
  assert.equal(tagOf(null), '')
  assert.equal(tagOf({}), '')
})

test('decideDropPlacement: edge band clamps to an 8px floor and 24px ceiling', () => {
  // height * 0.25 would be 0px for a zero-height rect — clamped up to 8px,
  // so a clientY exactly at rect.top must still read as 'before'.
  const tinyRect = { top: 100, bottom: 100, height: 0 }
  assert.equal(decideDropPlacement({ tag: 'div', rect: tinyRect, clientY: 100 }), 'before')
  assert.equal(decideDropPlacement({ tag: 'div', rect: tinyRect, clientY: 108 }), 'after') // 100+8 floor already past top

  // height * 0.25 would be 50px for a 200px-tall rect — clamped down to 24px,
  // so a point 30px inside the top edge must read as 'inside', not 'before'.
  const tallRect = { top: 0, bottom: 200, height: 200 }
  assert.equal(decideDropPlacement({ tag: 'div', rect: tallRect, clientY: 10 }), 'before')  // within 24px band
  assert.equal(decideDropPlacement({ tag: 'div', rect: tallRect, clientY: 30 }), 'inside')  // past the clamped 24px edge
  assert.equal(decideDropPlacement({ tag: 'div', rect: tallRect, clientY: 190 }), 'after')  // within 24px of bottom
})

test('decideDropPlacement: container with an unclamped mid-size edge band', () => {
  // 48px tall → edge = 48*0.25 = 12px exactly, no clamping either direction.
  const rect = { top: 100, bottom: 148, height: 48 }
  assert.equal(decideDropPlacement({ tag: 'main', rect, clientY: 105 }), 'before') // < 112
  assert.equal(decideDropPlacement({ tag: 'main', rect, clientY: 143 }), 'after')  // > 136
  assert.equal(decideDropPlacement({ tag: 'main', rect, clientY: 124 }), 'inside') // dead center
})

test('decideDropPlacement: leaf tags split at the midpoint, never "inside"', () => {
  const rect = { top: 100, bottom: 120, height: 20 } // midpoint = 110
  assert.equal(decideDropPlacement({ tag: 'p', rect, clientY: 100 }), 'before')
  assert.equal(decideDropPlacement({ tag: 'p', rect, clientY: 109 }), 'before')
  assert.equal(decideDropPlacement({ tag: 'p', rect, clientY: 110 }), 'after') // exactly on the line falls to 'after'
  assert.equal(decideDropPlacement({ tag: 'p', rect, clientY: 120 }), 'after')
  // Unrecognized tag falls through the same leaf branch as a known leaf.
  assert.equal(decideDropPlacement({ tag: 'span', rect, clientY: 100 }), 'before')
})

test('wrapperIndexForY: pointer above the first child lands at index 0', () => {
  const childRects = [
    { top: 100, bottom: 150 },
    { top: 150, bottom: 200 },
    { top: 200, bottom: 250 }
  ]
  assert.equal(wrapperIndexForY(childRects, 50), 0)
})

test('wrapperIndexForY: pointer below the last child lands at childRects.length', () => {
  const childRects = [
    { top: 100, bottom: 150 },
    { top: 150, bottom: 200 },
    { top: 200, bottom: 250 }
  ]
  assert.equal(wrapperIndexForY(childRects, 400), childRects.length)
  assert.equal(wrapperIndexForY(childRects, 400), 3)
})

test('wrapperIndexForY: empty child list always returns 0', () => {
  assert.equal(wrapperIndexForY([], 100), 0)
  assert.equal(wrapperIndexForY(null, 100), 0)
  assert.equal(wrapperIndexForY(undefined, 100), 0)
})

test('wrapperIndexForY: pointer between two children lands at the lower child\'s index', () => {
  const childRects = [
    { top: 0,   bottom: 100 }, // midpoint 50
    { top: 100, bottom: 200 }, // midpoint 150
    { top: 200, bottom: 300 }  // midpoint 250
  ]
  // Between child 0 and child 1 (past midpoint 50, before midpoint 150).
  assert.equal(wrapperIndexForY(childRects, 90), 1)
  // Between child 1 and child 2.
  assert.equal(wrapperIndexForY(childRects, 190), 2)
})
