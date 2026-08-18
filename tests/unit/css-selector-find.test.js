/**
 * GrapeStrap — Unit: findSelectorRange (jump-to-rule selector lookup)
 *
 * PATH: tests/unit/css-selector-find.test.js
 * ROLE: Pins the read-only selector lookup that jump-to-rule (F3a) navigates
 *       with. Same anti-tail-match doctrine as css-rules.test.js — `.item`
 *       must never resolve to the tail of `.hero .item { … }`, because a
 *       caret dropped on the wrong rule is the same lie as a writer
 *       clobbering it. Also pins the deliberate widening (comma-group
 *       members ARE reachable) and the inherited @media caveat.
 * DEPENDS: node:test, node:assert,
 *          src/renderer/panels/style-manager/css-rule-utils.js
 * CREATED: 2026-08-18
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findSelectorRange } from '../../src/renderer/panels/style-manager/css-rule-utils.js'

// Same fixture shape as css-rules.test.js: tab-indented, like a starter theme.
const COMPOUND_RULE = `\t.hero-carousel .carousel-item {
\t\tmin-height: 30em;
\t}
`

/** The text the range actually covers — every assertion below reads through
 *  this so a returned range can never "pass" by pointing at the wrong bytes. */
function slice(css, range) {
  return range ? css.slice(range.start, range.end) : null
}

test('whole-selector rule: range covers the selector, not the body', () => {
  const css = `.hero { color: red; }\n.carousel-item {\n  height: 10em;\n}\n`
  const range = findSelectorRange(css, '.carousel-item')
  assert.ok(range, 'selector is present and must be found')
  assert.equal(slice(css, range), '.carousel-item')
  assert.equal(css.slice(range.end).trimStart().startsWith('{'), true)
})

test('matches at sheet start, after }, and after a comment close', () => {
  assert.equal(slice('.item { color: red; }', findSelectorRange('.item { color: red; }', '.item')), '.item')
  const afterBrace = '.a{x:1}.item { color: red; }'
  assert.equal(slice(afterBrace, findSelectorRange(afterBrace, '.item')), '.item')
  const afterComment = '/* hd */ .item { color: red; }'
  const range = findSelectorRange(afterComment, '.item')
  assert.equal(range.start, afterComment.indexOf('.item'))
})

test('comma-group member is a reachable jump target', () => {
  const css = `h1, h2, h3 {\n  font-weight: 600;\n}\n`
  const range = findSelectorRange(css, 'h2')
  assert.ok(range)
  assert.equal(slice(css, range), 'h2')
  assert.equal(range.start, css.indexOf('h2'))
  // Last member of the group (followed by `{`, not `,`) resolves too.
  assert.equal(findSelectorRange(css, 'h3').start, css.indexOf('h3'))
})

test('tail of a compound selector is NOT a match', () => {
  assert.equal(findSelectorRange(COMPOUND_RULE, '.carousel-item'), null)
  assert.equal(findSelectorRange('.hero .item, .other { color: red; }', '.item'), null)
})

test('a selector that is only a PREFIX of another is not a match', () => {
  assert.equal(findSelectorRange('.btn-primary { color: red; }', '.btn'), null)
  assert.equal(findSelectorRange('.item.active { color: red; }', '.item'), null)
  assert.equal(findSelectorRange('.item:hover { color: red; }', '.item'), null)
})

test('pseudo and attribute spellings are passed through verbatim', () => {
  const css = `.cta-link:hover {\n  color: blue;\n}\n`
  assert.equal(slice(css, findSelectorRange(css, '.cta-link:hover')), '.cta-link:hover')
  const attr = `a[href^="https"] { color: teal; }`
  assert.equal(slice(attr, findSelectorRange(attr, 'a[href^="https"]')), 'a[href^="https"]')
})

test('first rule inside an @media block is not reachable (inherited caveat)', () => {
  // Mirrors css-rules.test.js: `{` is deliberately not a boundary, so a
  // breakpoint-scoped rule is never mistaken for the base rule. A jump has no
  // way to distinguish the two either, so it declines rather than misleading.
  const css = `@media (max-width: 767px) {\n\t.item {\n\t\tcolor: red;\n\t}\n}\n`
  assert.equal(findSelectorRange(css, '.item'), null)
  // A LATER rule in the same block sits after a sibling's `}` and is found —
  // same known asymmetry the writers have.
  const twoRules = `@media (max-width: 767px) {\n\t.a { color: red; }\n\t.item { color: blue; }\n}\n`
  assert.equal(slice(twoRules, findSelectorRange(twoRules, '.item')), '.item')
})

test('missing selector, empty sheet and empty selector all return null', () => {
  assert.equal(findSelectorRange('.a { color: red; }', '.nope'), null)
  assert.equal(findSelectorRange('', '.item'), null)
  assert.equal(findSelectorRange(undefined, '.item'), null)
  assert.equal(findSelectorRange('.item { color: red; }', ''), null)
})

test('first occurrence wins, and a whole-selector hit beats a later group member', () => {
  const css = `.item { color: red; }\n.a, .item { color: blue; }\n`
  assert.equal(findSelectorRange(css, '.item').start, css.indexOf('.item'))
  const groupFirst = `.a, .item { color: blue; }\n.item { color: red; }\n`
  // The whole-selector pass runs first, so it lands on the second rule here.
  assert.equal(findSelectorRange(groupFirst, '.item').start, groupFirst.lastIndexOf('.item'))
})
