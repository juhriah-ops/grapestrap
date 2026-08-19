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
  readRule, writeRule, readBareRule, writeBareRule, isInsideSectionChunk
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

// ─── Where a write LANDS (2026-08-18) ────────────────────────────────────────
// Anchoring says which rules are the selector's own; these say which of them a
// write may touch. A declaration written into a rule the cascade then overrules
// is invisible, which is what the acceptance report described as "the panel
// does nothing".

// A section chunk exactly as editor/css-chunks.js appends it: blank line,
// marker line, the section's rules, trailing newline.
const CHUNKED_SHEET = `.theme-band {\n  padding: 2em;\n}\n
/* gs-sec:orbit-hero */
.gs-orbit-hero {
  padding: 6em 0;
  background: #1b1b1b;
}
.gs-orbit-hero .gs-orbit-hero-title {
  font-size: 3em;
}
`

test('bare rule: the LAST rule for a selector is the one read and written', () => {
  // Same selector twice — the second wins in the browser, so the panel must
  // read it and the writer must edit it. Editing the first one is how a value
  // ended up in the sheet with nothing to show for it on screen.
  const css = `.item {\n  color: red;\n}\n.other { x: 1; }\n.item {\n  color: blue;\n}\n`
  assert.deepEqual(readBareRule(css, '.item'), { color: 'blue' })
  const out = writeBareRule(css, '.item', { color: 'green' })
  assert.equal(out, `.item {\n  color: red;\n}\n.other { x: 1; }\n.item {\n  color: green;\n}\n`)
})

test('bare rule: reads merge every occurrence in source order', () => {
  const css = `.item {\n  color: red;\n  padding: 1em;\n}\n.item {\n  color: blue;\n}\n`
  assert.deepEqual(readBareRule(css, '.item'), { color: 'blue', padding: '1em' })
})

test('bare rule: adjacent same-selector rules are both seen', () => {
  // The scanner has to rewind onto each closing brace — that brace is the
  // boundary the next rule's match needs, and matching consumed it.
  const css = `.item { color: red; }.item { color: blue; }`
  assert.deepEqual(readBareRule(css, '.item'), { color: 'blue' })
})

test('bare rule: a rule inside a gs-sec chunk is never rewritten', () => {
  const out = writeBareRule(CHUNKED_SHEET, '.gs-orbit-hero', { 'background-color': '#101820' })
  assert.ok(out.startsWith(CHUNKED_SHEET), 'the section chunk must stay byte-identical')
  // The override lands after the chunk, where source order makes it win.
  assert.match(out, /\n\.gs-orbit-hero \{\n {2}background-color: #101820;\n\}\n$/)
  // And only the user's declaration is in it — the chunk's own rules are not
  // copied forward, or a later section edit would be shadowed by the copy.
  assert.deepEqual(readBareRule(out, '.gs-orbit-hero'), {
    padding: '6em 0',
    background: '#1b1b1b',
    'background-color': '#101820'
  })
})

test('bare rule: the override rule after a chunk is rewritten in place, not duplicated', () => {
  const first = writeBareRule(CHUNKED_SHEET, '.gs-orbit-hero', { 'background-color': '#101820' })
  const second = writeBareRule(first, '.gs-orbit-hero', { 'background-color': '#3fb950' })
  assert.equal(second.match(/background-color: /g).length, 1)
  assert.match(second, /\n\.gs-orbit-hero \{\n {2}background-color: #3fb950;\n\}\n$/)
  // Byte-identical when nothing changes: the no-op guard in bare-rule-store.js
  // is what keeps a repeated write from flagging the project dirty.
  assert.equal(writeBareRule(first, '.gs-orbit-hero', { 'background-color': '#101820' }), first)
})

test('bare rule: clearing an override drops it and leaves the chunk alone', () => {
  const written = writeBareRule(CHUNKED_SHEET, '.gs-orbit-hero', { 'background-color': '#101820' })
  const cleared = writeBareRule(written, '.gs-orbit-hero', {})
  assert.equal(cleared, CHUNKED_SHEET)
})

test('isInsideSectionChunk: a blank line ends the chunk territory', () => {
  const marker = CHUNKED_SHEET.indexOf('/* gs-sec:orbit-hero */')
  assert.equal(isInsideSectionChunk(CHUNKED_SHEET, CHUNKED_SHEET.indexOf('.gs-orbit-hero {')), true)
  assert.equal(isInsideSectionChunk(CHUNKED_SHEET, marker - 1), false, 'above the marker')
  const withOverride = `${CHUNKED_SHEET}\n.gs-orbit-hero {\n  background-color: #101820;\n}\n`
  assert.equal(isInsideSectionChunk(withOverride, withOverride.lastIndexOf('.gs-orbit-hero {')), false)
})
