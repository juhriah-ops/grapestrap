/**
 * GrapeStrap — Unit: marker-guarded CSS chunks (editor/css-chunks.js)
 *
 * PATH: tests/unit/css-chunks.test.js
 * ROLE: Pins the idempotency contract the bundled-section insert path depends
 *       on — append-once, byte-identical no-op on the second call, per-marker
 *       (not per-array) presence, and the guarantee that user edits INSIDE an
 *       existing chunk are never diffed or clobbered. The insert path that
 *       consumes this (editor/insert-section.js) touches GrapesJS + IPC and is
 *       covered e2e instead.
 * DEPENDS: node:test, node:assert, ../../src/renderer/editor/css-chunks.js
 * CREATED: 2026-08-17
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendCssChunks, hasChunk } from '../../src/renderer/editor/css-chunks.js'

const HERO = { marker: 'orbit-hero', text: '.gs-orbit-hero { padding: 4rem 0; }' }
const BASE = { marker: 'orbit-base', text: '.gs-orbit { --gs-accent: #2f6feb; }' }

test('appendCssChunks: appends a chunk under its marker line', () => {
  const { css, changed } = appendCssChunks('/* Project-global custom CSS */\n', [HERO])

  assert.equal(changed, true)
  assert.equal(
    css,
    '/* Project-global custom CSS */\n' +
    '\n/* gs-sec:orbit-hero */\n.gs-orbit-hero { padding: 4rem 0; }\n'
  )
  // The marker is on a line of its own — that is what the presence check reads.
  assert.ok(css.split('\n').includes('/* gs-sec:orbit-hero */'))
})

test('appendCssChunks: a second call with the same chunk changes nothing at all', () => {
  const first = appendCssChunks('body { margin: 0; }\n', [HERO])
  const second = appendCssChunks(first.css, [HERO])

  assert.equal(second.changed, false)
  // Byte-identical, not merely "equivalent": no re-append, no reformat, no
  // trailing-newline drift. A false `changed` must mean the project is not
  // dirtied and no 'project:css-changed' is emitted.
  assert.equal(second.css, first.css)
  // And the marker still appears exactly once.
  assert.equal(occurrences(second.css, '/* gs-sec:orbit-hero */'), 1)
})

test('appendCssChunks: mixed present/absent markers appends only the missing ones', () => {
  const seeded = appendCssChunks('', [BASE]).css
  const { css, changed } = appendCssChunks(seeded, [BASE, HERO])

  assert.equal(changed, true)
  assert.equal(occurrences(css, '/* gs-sec:orbit-base */'), 1)
  assert.equal(occurrences(css, '/* gs-sec:orbit-hero */'), 1)
  // The already-present chunk keeps its original position ahead of the new one.
  assert.ok(css.indexOf('/* gs-sec:orbit-base */') < css.indexOf('/* gs-sec:orbit-hero */'))
})

test('appendCssChunks: a marker repeated within one call is appended once', () => {
  const { css, changed } = appendCssChunks('', [HERO, HERO, HERO])

  assert.equal(changed, true)
  assert.equal(occurrences(css, '/* gs-sec:orbit-hero */'), 1)
})

test('appendCssChunks: user edits inside an existing chunk survive a re-insert', () => {
  // The user opened Custom CSS and retuned the rules under the marker — the
  // marker line is all that is checked, the body is never compared. This is
  // the "re-insert must not clobber my theming" guarantee.
  const edited =
    '\n/* gs-sec:orbit-hero */\n' +
    '.gs-orbit-hero { padding: 8rem 0; background: rebeccapurple; }\n' +
    '.gs-orbit-hero h1 { letter-spacing: -0.02em; }\n'

  const { css, changed } = appendCssChunks(edited, [HERO])

  assert.equal(changed, false)
  assert.equal(css, edited)
  // Explicitly: the shipped text was NOT restored over the user's version.
  assert.ok(!css.includes('padding: 4rem 0;'))
  assert.ok(css.includes('rebeccapurple'))
})

test('appendCssChunks: deleting the marker line makes the next insert re-append', () => {
  const withChunk = appendCssChunks('', [HERO]).css
  const markerRemoved = withChunk
    .split('\n')
    .filter(line => line.trim() !== '/* gs-sec:orbit-hero */')
    .join('\n')

  const { changed } = appendCssChunks(markerRemoved, [HERO])
  assert.equal(changed, true)
})

test('appendCssChunks: empty/absent chunk lists are a no-op on the original string', () => {
  const original = '.thing { color: red; }'
  for (const chunks of [[], null, undefined, 'not-an-array']) {
    const result = appendCssChunks(original, chunks)
    assert.equal(result.changed, false)
    assert.equal(result.css, original)
  }
  // Nullish css normalises to '' rather than throwing or stringifying null.
  assert.deepEqual(appendCssChunks(null, []), { css: '', changed: false })
})

test('appendCssChunks: malformed markers are skipped, never written into the fence', () => {
  // Each of these would break out of the CSS comment or produce an
  // unmatchable line — skipping keeps the stylesheet parseable.
  const bad = [
    { marker: '', text: '.a{}' },
    { marker: '   ', text: '.a{}' },
    { marker: 'has space padding ', text: '.a{}' },   // untrimmed
    { marker: 'two\nlines', text: '.a{}' },
    { marker: 'escapes*/here', text: '.a{}' },
    { marker: 42, text: '.a{}' },
    { text: '.a{}' }                                   // no marker at all
  ]
  const { css, changed } = appendCssChunks('body{}', bad)
  assert.equal(changed, false)
  assert.equal(css, 'body{}')
})

test('appendCssChunks: a chunk with no text still records its marker', () => {
  // Presence is the marker, so an empty-bodied chunk is legal and stays
  // idempotent on the next pass.
  const { css, changed } = appendCssChunks('', [{ marker: 'orbit-noop' }])
  assert.equal(changed, true)
  assert.equal(hasChunk(css, 'orbit-noop'), true)
  assert.equal(appendCssChunks(css, [{ marker: 'orbit-noop' }]).changed, false)
})

test('hasChunk: truth table', () => {
  const css = appendCssChunks('.a { color: red; }\n', [HERO]).css

  assert.equal(hasChunk(css, 'orbit-hero'), true)
  assert.equal(hasChunk(css, 'orbit-base'), false)          // never appended
  assert.equal(hasChunk('', 'orbit-hero'), false)
  assert.equal(hasChunk(null, 'orbit-hero'), false)
  assert.equal(hasChunk(undefined, 'orbit-hero'), false)
  assert.equal(hasChunk(css, ''), false)                    // unusable marker
  assert.equal(hasChunk(css, null), false)
  assert.equal(hasChunk(css, 42), false)

  // Indented marker line still counts (the line is trimmed before comparing).
  assert.equal(hasChunk('    /* gs-sec:orbit-hero */\n', 'orbit-hero'), true)

  // Substring lookalikes must NOT count:
  //  - marker mentioned in prose inside another comment
  assert.equal(hasChunk('/* see gs-sec:orbit-hero for the hero rules */\n', 'orbit-hero'), false)
  //  - a longer marker that merely starts with the one we asked about
  assert.equal(hasChunk('/* gs-sec:orbit-hero-wide */\n', 'orbit-hero'), false)
  //  - the marker line sharing a line with a rule
  assert.equal(hasChunk('.a{} /* gs-sec:orbit-hero */\n', 'orbit-hero'), false)
})

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1
}
