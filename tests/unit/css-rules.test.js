/**
 * GrapeStrap — Unit: css-rule-utils selector anchoring
 *
 * PATH: tests/unit/css-rules.test.js
 * ROLE: Pins the boundary-anchored rule matching in css-rule-utils.js —
 *       a target selector must only read/replace a rule whose ENTIRE
 *       selector matches. Regression for the v0.1.0 acceptance forensics
 *       (2026-08-03): unanchored, `.carousel-item` matched the tail of
 *       Graphite's `.hero-carousel .carousel-item { … }` and the Background
 *       panel rewrote the theme's compound rule in place.
 * DEPENDS: node:test, node:assert,
 *          src/renderer/panels/style-manager/css-rule-utils.js
 * CREATED: 2026-08-03
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readRule, writeRule, readBareRule, writeBareRule
} from '../../src/renderer/panels/style-manager/css-rule-utils.js'

// Tab-indented like starter theme stylesheets — byte-identity assertions
// below depend on the writers never touching this block.
const COMPOUND_RULE = `\t.hero-carousel .carousel-item {
\t\tmin-height: 30em;
\t\tbackground-position: center center;
\t}
`

// ─── Bare-state rules ────────────────────────────────────────────────────────

test('writeBareRule: compound-tail selector is NOT rewritten — new rule appends', () => {
  const out = writeBareRule(COMPOUND_RULE, '.carousel-item', {
    'background-image': 'url("../images/pick.jpg")'
  })
  assert.ok(out.startsWith(COMPOUND_RULE), 'compound rule must stay byte-identical')
  assert.match(out, /\n\.carousel-item \{\n {2}background-image: url\("\.\.\/images\/pick\.jpg"\);\n\}\n/)
})

test('readBareRule: compound-tail selector reads nothing', () => {
  assert.deepEqual(readBareRule(COMPOUND_RULE, '.carousel-item'), {})
})

test('readBareRule/writeBareRule: exact whole-selector rule round-trips in place', () => {
  const css = `.hero { color: red; }\n.carousel-item {\n  height: 10em;\n}\n.footer { color: blue; }\n`
  assert.deepEqual(readBareRule(css, '.carousel-item'), { height: '10em' })
  const out = writeBareRule(css, '.carousel-item', { height: '12em' })
  assert.equal(out, `.hero { color: red; }\n.carousel-item {\n  height: 12em;\n}\n.footer { color: blue; }\n`)
})

test('writeBareRule: empty props removes only the exact rule', () => {
  const css = `${COMPOUND_RULE}.carousel-item {\n  height: 10em;\n}\n`
  const out = writeBareRule(css, '.carousel-item', {})
  assert.equal(out, COMPOUND_RULE)
})

test('bare rule matches at sheet start, after }, and after a comment close', () => {
  assert.deepEqual(readBareRule('\n\n.item { color: red; }\n', '.item'), { color: 'red' })
  assert.deepEqual(readBareRule('.a{x:1}.item { color: red; }', '.item'), { color: 'red' })
  assert.deepEqual(readBareRule('/* hd */ .item { color: red; }', '.item'), { color: 'red' })
})

test('bare rule never matches suffix-compound or pseudo forms', () => {
  assert.deepEqual(readBareRule('.item.active { color: red; }', '.item'), {})
  assert.deepEqual(readBareRule('.item:hover { color: red; }', '.item'), {})
})

test('first rule inside an @media block is not treated as the base rule', () => {
  const css = `@media (max-width: 767px) {\n\t.item {\n\t\tcolor: red;\n\t}\n}\n`
  assert.deepEqual(readBareRule(css, '.item'), {})
  const out = writeBareRule(css, '.item', { color: 'blue' })
  assert.ok(out.startsWith(css), 'media-scoped rule must stay untouched')
  assert.match(out, /\n\.item \{\n {2}color: blue;\n\}\n$/)
})

test('writeBareRule: a $ inside a CSS value is written literally', () => {
  const css = `.item {\n  color: red;\n}\n`
  const out = writeBareRule(css, '.item', { content: '"$&"' })
  assert.match(out, /content: "\$&";/)
})

// ─── Pseudo rules ────────────────────────────────────────────────────────────

test('writeRule: compound-tail pseudo selector is NOT rewritten — new rule appends', () => {
  const css = `\t.hero-zone .cta-link:hover {\n\t\tcolor: #123456;\n\t}\n`
  const out = writeRule(css, '.cta-link', 'hover', { 'background-color': '#ff0066' })
  assert.ok(out.startsWith(css), 'compound pseudo rule must stay byte-identical')
  assert.match(out, /\n\.cta-link:hover \{\n {2}background-color: #ff0066;\n\}\n/)
})

test('readRule: compound-tail pseudo selector reads nothing; exact rule reads', () => {
  const css = `.hero-zone .cta-link:hover { color: red; }\n.cta-link:hover { color: blue; }\n`
  assert.deepEqual(readRule(css, '.cta-link', 'hover'), { color: 'blue' })
  assert.deepEqual(readRule('.hero-zone .cta-link:hover { color: red; }', '.cta-link', 'hover'), {})
})

test('writeRule: exact pseudo rule replaces in place and empty props removes it', () => {
  const css = `.a { x: 1; }\n.cta-link:hover {\n  color: red;\n}\n.b { y: 2; }\n`
  const replaced = writeRule(css, '.cta-link', 'hover', { color: 'blue' })
  assert.equal(replaced, `.a { x: 1; }\n.cta-link:hover {\n  color: blue;\n}\n.b { y: 2; }\n`)
  const removed = writeRule(css, '.cta-link', 'hover', {})
  assert.equal(removed, `.a { x: 1; }\n.b { y: 2; }\n`)
})
