/**
 * GrapeStrap — Unit: extractPageFromFullHtml stray-content relocation
 *
 * PATH: tests/unit/page-html-stray-content.test.js
 * ROLE: Pins the Workstream A chunk A5 fix — markup a user (or an external
 *       tool) leaves between </head> and <body> is exactly what a real
 *       browser's HTML parser silently hoists to the top of <body>. This
 *       locks extractPageFromFullHtml's explicit version of that same
 *       relocation, plus the strayContentMoved flag callers use to warn the
 *       user instead of the content just vanishing on the next round-trip.
 * DEPENDS: node:test, node:assert, ../../src/shared/page-html.js
 * CREATED: 2026-08-11
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractPageFromFullHtml, composeFullPageHtml } from '../../src/shared/page-html.js'

test('extractPageFromFullHtml: markup between </head> and <body> relocates to the top of body, flag true', () => {
  const full = [
    '<!doctype html>',
    '<html lang="en">',
    '<head><title>t</title></head>',
    '<header class="stray">Stray header</header>',
    '<body>',
    '<main><h1>content</h1></main>',
    '</body>',
    '</html>'
  ].join('\n')

  const { body, strayContentMoved } = extractPageFromFullHtml(full)
  assert.equal(strayContentMoved, true)
  // Relocated markup is PREPENDED — it must appear before the real body content.
  const strayIndex = body.indexOf('Stray header')
  const contentIndex = body.indexOf('<h1>content</h1>')
  assert.ok(strayIndex !== -1, `stray header missing from extracted body: ${body}`)
  assert.ok(contentIndex !== -1, `page content missing from extracted body: ${body}`)
  assert.ok(strayIndex < contentIndex, 'stray header was not moved to the top of body')
})

test('extractPageFromFullHtml: a clean full document round-trips byte-stable, flag false', () => {
  const full = composeFullPageHtml('<main><h1>page</h1></main>\n', { name: 'p' }, {})
  const { body, strayContentMoved } = extractPageFromFullHtml(full)
  assert.equal(strayContentMoved, false)
  assert.ok(body.includes('<main><h1>page</h1></main>'))

  // Re-composing the extracted body with the SAME page/manifest args used to
  // build `full` must reproduce it byte-for-byte — a no-op extraction adds,
  // drops, or reorders nothing.
  const recomposed = composeFullPageHtml(body, { name: 'p' }, {})
  assert.equal(recomposed, full)
})

test('extractPageFromFullHtml: a body-only fragment (no <head>/<body> tags) is untouched, flag false', () => {
  const fragment = '<main><h1>fragment</h1></main>'
  const { body, strayContentMoved } = extractPageFromFullHtml(fragment)
  assert.equal(strayContentMoved, false)
  assert.equal(body, fragment)
})
