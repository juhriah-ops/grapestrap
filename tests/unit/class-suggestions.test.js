/**
 * GrapeStrap — Unit: class-name suggestion source (F6 typeahead)
 *
 * PATH: tests/unit/class-suggestions.test.js
 * ROLE: Pins the two pure functions behind the add-class typeahead:
 *       extractClassSelectors (what counts as a "class" written in a real
 *       stylesheet — comments stripped, pseudo/attribute selectors and
 *       declaration-value noise like `.75rem` excluded) and rankSuggestions
 *       (prefix-then-substring ordering, case-insensitive matching, exact-
 *       value dedupe, exclusion of classes already on the element). The
 *       stateful shell (getClassSuggestions — project state + editor wrapper
 *       walk + caches) is integration surface, covered by
 *       tests/e2e/class-typeahead.spec.js instead.
 * DEPENDS: node:test, node:assert,
 *          src/renderer/panels/properties-side/class-suggestions.js
 * CREATED: 2026-08-18
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractClassSelectors, rankSuggestions } from '../../src/renderer/panels/properties-side/class-suggestions.js'

// ─── extractClassSelectors ───────────────────────────────────────────────────

test('extractClassSelectors: comments are stripped before matching', () => {
  const css = '/* .ghost { color: red; } */\n.real { color: blue; }\n'
  assert.deepEqual([...extractClassSelectors(css)], ['real'])
})

test('extractClassSelectors: pseudo-classes and attribute selectors are not themselves classes', () => {
  const css = '.btn:hover { color: red; }\na[href^="https"] { color: teal; }\n.card[data-active] { color: green; }\n'
  const classes = extractClassSelectors(css)
  assert.equal(classes.has('btn'), true)
  assert.equal(classes.has('hover'), false)
  assert.equal(classes.has('href'), false)
  assert.equal(classes.has('card'), true)
  assert.equal(classes.has('data-active'), false)
})

test('extractClassSelectors: a leading digit after the dot never matches (declaration values like .75rem)', () => {
  const css = '.item { margin: .75rem; padding: .5em; }\n'
  assert.deepEqual([...extractClassSelectors(css)], ['item'])
})

test('extractClassSelectors: escaped selector characters are not unescaped (documented non-goal)', () => {
  // The backslash isn't in the allowed character class, so the match stops
  // right after "foo" — "bar" is never reached because nothing preceding it
  // is a literal ".". Bootstrap 5.3's own sheet has no escaped selectors, so
  // this is a known, accepted limitation rather than a bug.
  const css = '.foo\\:bar { color: red; }\n'
  assert.deepEqual([...extractClassSelectors(css)], ['foo'])
})

test('extractClassSelectors: compound selectors contribute each class once, deduped across rules', () => {
  const css = '.btn { } .btn:hover { } .btn.active { }'
  assert.deepEqual([...extractClassSelectors(css)].sort(), ['active', 'btn'])
})

test('extractClassSelectors: empty, missing, and no-match input all return an empty set', () => {
  assert.deepEqual([...extractClassSelectors('')], [])
  assert.deepEqual([...extractClassSelectors(undefined)], [])
  assert.deepEqual([...extractClassSelectors('body { color: red; }')], [])
})

// ─── rankSuggestions ──────────────────────────────────────────────────────────

test('rankSuggestions: prefix matches rank before substring matches, shortest-first within each bucket', () => {
  const candidates = [
    { value: 'btn-primary' }, { value: 'btn' }, { value: 'my-btn-group' }, { value: 'card' }
  ]
  const ranked = rankSuggestions('btn', candidates, [])
  assert.deepEqual(ranked.map(r => r.value), ['btn', 'btn-primary', 'my-btn-group'])
})

test('rankSuggestions: matching is case-insensitive', () => {
  const candidates = [{ value: 'Card' }, { value: 'card-body' }]
  const ranked = rankSuggestions('CARD', candidates, [])
  assert.deepEqual(ranked.map(r => r.value), ['Card', 'card-body'])
})

test('rankSuggestions: dedupes exact-value repeats, first occurrence wins its hint', () => {
  const candidates = [{ value: 'btn', hint: 'from-bootstrap' }, { value: 'btn', hint: 'from-project' }]
  const ranked = rankSuggestions('b', candidates, [])
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].hint, 'from-bootstrap')
})

test('rankSuggestions: drops classes already on the element', () => {
  const candidates = [{ value: 'btn' }, { value: 'btn-primary' }]
  const ranked = rankSuggestions('btn', candidates, ['btn'])
  assert.deepEqual(ranked.map(r => r.value), ['btn-primary'])
})

test('rankSuggestions: an empty query matches every candidate as a trivial prefix match', () => {
  const candidates = [{ value: 'zzz' }, { value: 'aaa' }]
  const ranked = rankSuggestions('', candidates, [])
  assert.deepEqual(ranked.map(r => r.value), ['aaa', 'zzz'])
})

test('rankSuggestions: a query nothing matches returns an empty array', () => {
  const candidates = [{ value: 'btn' }, { value: 'card' }]
  assert.deepEqual(rankSuggestions('xyz', candidates, []), [])
})

test('rankSuggestions: missing candidates/exclude arguments do not throw', () => {
  assert.deepEqual(rankSuggestions('a', undefined, undefined), [])
})
