/**
 * GrapeStrap — Unit: bs-version (Bootstrap-major compat gate)
 *
 * PATH: tests/unit/bs-version.test.js
 * ROLE: Pins parseMajor/isMajorMismatch's exact semantics — the matrix from
 *       the A-WP2 plan (§4): minor drift never warns, major drift always
 *       does, an unstamped item never warns regardless of the project, and
 *       an unknown project ('legacy'/'unknown'/absent) warns against any
 *       numerically-stamped item.
 * DEPENDS: node:test, node:assert, src/shared/bs-version.js
 * CREATED: 2026-08-18
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMajor, isMajorMismatch } from '../../src/shared/bs-version.js'

test('parseMajor: dotted version strings return the leading major', () => {
  assert.equal(parseMajor('5.3.3'), 5)
  assert.equal(parseMajor('4.6.0'), 4)
  assert.equal(parseMajor('5.9.0'), 5)
  assert.equal(parseMajor('12.0.1'), 12)
})

test('parseMajor: non-numeric sentinels and absence all return null', () => {
  assert.equal(parseMajor('legacy'), null)
  assert.equal(parseMajor('unknown'), null)
  assert.equal(parseMajor(undefined), null)
  assert.equal(parseMajor(null), null)
  assert.equal(parseMajor(''), null)
})

test('isMajorMismatch: same major, different minor/patch — no warn', () => {
  assert.equal(isMajorMismatch('5.3.3', '5.9.0'), false)
})

test('isMajorMismatch: different major — warns', () => {
  assert.equal(isMajorMismatch('5.3.3', '4.6.0'), true)
})

test('isMajorMismatch: numeric item vs legacy project — warns (unknown project)', () => {
  assert.equal(isMajorMismatch('5.3.3', 'legacy'), true)
})

test('isMajorMismatch: numeric item vs unknown project — warns', () => {
  assert.equal(isMajorMismatch('5.3.3', 'unknown'), true)
})

test('isMajorMismatch: numeric item vs absent project field — warns', () => {
  assert.equal(isMajorMismatch('5.3.3', undefined), true)
})

test('isMajorMismatch: unstamped item never warns, regardless of project state', () => {
  assert.equal(isMajorMismatch(undefined, '5.3.3'), false)
  assert.equal(isMajorMismatch(undefined, '4.6.0'), false)
  assert.equal(isMajorMismatch(undefined, 'legacy'), false)
  assert.equal(isMajorMismatch(undefined, undefined), false)
  assert.equal(isMajorMismatch('unknown', '4.6.0'), false)
})

test('isMajorMismatch: both projects unknown — still no warn without a numeric item', () => {
  assert.equal(isMajorMismatch('legacy', 'legacy'), false)
})

test('isMajorMismatch: identical majors — no warn even at the exact same version', () => {
  assert.equal(isMajorMismatch('5.3.3', '5.3.3'), false)
})
