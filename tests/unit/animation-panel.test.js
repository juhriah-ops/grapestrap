/**
 * GrapeStrap — Unit: Animation sub-panel attribute maths
 *
 * PATH: tests/unit/animation-panel.test.js
 * ROLE: Pins the pure decisions the Animation sub-panel makes before it touches
 *       a component: WHICH attributes a gesture removes, and WHAT number a
 *       dragged slider becomes. The two removal sets are the load-bearing half
 *       — they share the `data-gs-anim` prefix, so a reveal switched off must
 *       take exactly the reveal family (never the hover or loop preset sitting
 *       beside it) while "Remove all animation" must take the lot in one call,
 *       or "one gesture, one undo entry" stops being true. The clamps are
 *       shared by the reader and the slider handler, so a drift between them
 *       would park the thumb at 600ms while the page carried something else.
 * DEPENDS: node:test, node:assert,
 *          ../../src/renderer/panels/style-manager/animation.js
 * CREATED: 2026-08-18
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampDuration, clampDelay, animationAttributeNames,
  revealAttributesPresent, previewTimingFor
} from '../../src/renderer/panels/style-manager/animation.js'

// A component wearing one of everything: the whole reveal family, a hover
// preset, a loop preset and its speed — plus unrelated attributes that must
// survive every removal.
const FULLY_ANIMATED = {
  id: 'promo-band',
  class: 'card shadow-sm',
  'data-gs-anim': 'fade-up',
  'data-gs-anim-trigger': 'load',
  'data-gs-anim-duration': '900',
  'data-gs-anim-delay': '150',
  'data-gs-anim-once': '0',
  'data-gs-anim-hover': 'lift',
  'data-gs-anim-loop': 'marquee',
  'data-gs-anim-loop-speed': 'slow',
  'data-bs-toggle': 'collapse'
}

test('animationAttributeNames: every data-gs-anim attribute, and nothing else', () => {
  assert.deepEqual(animationAttributeNames(FULLY_ANIMATED), [
    'data-gs-anim',
    'data-gs-anim-delay',
    'data-gs-anim-duration',
    'data-gs-anim-hover',
    'data-gs-anim-loop',
    'data-gs-anim-loop-speed',
    'data-gs-anim-once',
    'data-gs-anim-trigger'
  ])
})

test('animationAttributeNames: near-misses on the prefix are left alone', () => {
  // `data-gs-nav-*` is the navbar panel's namespace and `data-gs-animate` is
  // somebody else's attribute entirely — a prefix match that swallowed either
  // would make "Remove all animation" delete settings it never showed.
  assert.deepEqual(animationAttributeNames({
    'data-gs-nav-scroll': 'solid',
    'data-gs-animate': 'true',
    'data-gs-anim': 'fade',
    'data-gs-anim-hover': 'grow'
  }), ['data-gs-anim', 'data-gs-anim-hover'])
})

test('animationAttributeNames: nothing animated, and no attributes at all', () => {
  assert.deepEqual(animationAttributeNames({ class: 'card', href: '#' }), [])
  assert.deepEqual(animationAttributeNames({}), [])
  assert.deepEqual(animationAttributeNames(null), [])
  assert.deepEqual(animationAttributeNames(undefined), [])
})

test('revealAttributesPresent: the reveal family only — hover and loop stay put', () => {
  // The whole point of listing the reveal family instead of prefix-matching it.
  assert.deepEqual(revealAttributesPresent(FULLY_ANIMATED), [
    'data-gs-anim',
    'data-gs-anim-trigger',
    'data-gs-anim-duration',
    'data-gs-anim-delay',
    'data-gs-anim-once'
  ])
})

test('revealAttributesPresent: filtered to what is actually there', () => {
  // A removeAttributes call naming absent attributes still rewrites the map,
  // which registers an undo entry for a gesture that changed nothing.
  assert.deepEqual(revealAttributesPresent({
    'data-gs-anim': 'zoom-in',
    'data-gs-anim-delay': '200',
    'data-gs-anim-hover': 'glow'
  }), ['data-gs-anim', 'data-gs-anim-delay'])

  assert.deepEqual(revealAttributesPresent({ 'data-gs-anim-loop': 'pulse' }), [])
  assert.deepEqual(revealAttributesPresent({}), [])
  assert.deepEqual(revealAttributesPresent(null), [])
})

test('clampDuration: empty and junk fall back to the runtime default', () => {
  // 600 is the `var(--gs-anim-duration, 600ms)` fallback in
  // assets/behaviors/gstrap-behaviors.css — what a page with no attribute does.
  for (const raw of ['', '   ', 'abc', null, undefined]) {
    assert.equal(clampDuration(raw), 600, `expected the default for ${JSON.stringify(raw)}`)
  }
})

test('clampDuration: real values pass through, out-of-range values are pulled in', () => {
  assert.equal(clampDuration('900'), 900)
  assert.equal(clampDuration(900), 900)
  assert.equal(clampDuration('600ms'), 600)   // parseInt tolerance, same as the runtime's
  assert.equal(clampDuration('10'), 150)      // below the slider's floor
  assert.equal(clampDuration('-400'), 150)
  assert.equal(clampDuration('99999'), 2000)  // above its ceiling
})

test('clampDelay: floor is zero, and zero is the default rather than a fallback', () => {
  assert.equal(clampDelay(''), 0)
  assert.equal(clampDelay('junk'), 0)
  assert.equal(clampDelay('-250'), 0)
  assert.equal(clampDelay('0'), 0)
  assert.equal(clampDelay('250'), 250)
  assert.equal(clampDelay('99999'), 2000)
})

test('previewTimingFor: reads the element\'s own timing, tail included', () => {
  // totalMs is the deadline the preview falls back on when transitionend never
  // arrives (no behaviors stylesheet in the canvas, a hidden ancestor, reduced
  // motion) — it has to outlast the transition it is insuring, never undercut it.
  const timing = previewTimingFor(FULLY_ANIMATED)
  assert.equal(timing.durationMs, 900)
  assert.equal(timing.delayMs, 150)
  assert.equal(timing.totalMs, 900 + 150 + 200)
  assert.ok(timing.totalMs > timing.durationMs + timing.delayMs)
})

test('previewTimingFor: an element with no timing attributes previews at the defaults', () => {
  const timing = previewTimingFor({ 'data-gs-anim': 'fade' })
  assert.equal(timing.durationMs, 600)
  assert.equal(timing.delayMs, 0)
  assert.equal(timing.totalMs, 800)

  // A Preview click on an element whose attributes could not be read must still
  // produce a usable deadline rather than NaN, which would never clear.
  assert.equal(previewTimingFor(null).totalMs, 800)
  assert.equal(previewTimingFor(undefined).totalMs, 800)
})
