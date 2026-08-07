/**
 * GrapeStrap — Unit: stripBodyWrapper + nested-body healing
 *
 * PATH: tests/unit/body-wrapper.test.js
 * ROLE: Pins the fix for the nola1 2026-08-07 "double body tags" report:
 *       GrapesJS's getHtml() wraps its serialization in <body>, fragments
 *       are body-inner by contract, and composeFullPageHtml wrapped the
 *       wrapped fragment again — every saved page carried <body><body>.
 *       Covers the unwrapper itself (single, nested, attributes, anchored
 *       non-shell bodies untouched) and extractPageFromFullHtml healing
 *       legacy nested files on load.
 * DEPENDS: node:test, node:assert, ../../src/shared/page-html.js
 * CREATED: 2026-08-07
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stripBodyWrapper, extractPageFromFullHtml, composeFullPageHtml
} from '../../src/shared/page-html.js'

test('stripBodyWrapper unwraps single and nested shells, keeps content', () => {
  assert.equal(stripBodyWrapper('<body><p>x</p></body>'), '<p>x</p>')
  assert.equal(stripBodyWrapper('<body>\n<body>\n<p>x</p>\n</body>\n</body>'), '<p>x</p>')
  assert.equal(stripBodyWrapper('<body class="hero" data-a="1"><p>x</p></body>'), '<p>x</p>')
  assert.equal(stripBodyWrapper('<p>x</p>'), '<p>x</p>')
  assert.equal(stripBodyWrapper(''), '')
  assert.equal(stripBodyWrapper(null), '')
})

test('a body tag that is not the outermost shell is user content — untouched', () => {
  const partial = '<p>before</p><body><p>x</p></body>'
  assert.equal(stripBodyWrapper(partial), partial)
})

test('extractPageFromFullHtml heals a legacy nested-body page file', () => {
  const legacy = [
    '<!doctype html>', '<html>', '<head><title>t</title></head>',
    '<body>', '<body>', '<main><h1>content</h1></main>', '</body>', '</body>', '</html>'
  ].join('\n')
  const { body } = extractPageFromFullHtml(legacy)
  assert.ok(!/<body\b/i.test(body), `no body tag expected, got: ${body}`)
  assert.ok(body.includes('<main><h1>content</h1></main>'))
})

test('compose → extract round trip stays at exactly one body forever', () => {
  let fragment = '<main><h1>page</h1></main>\n'
  for (let cycle = 0; cycle < 3; cycle++) {
    const full = composeFullPageHtml(fragment, { name: 'p' }, {})
    assert.equal((full.match(/<body\b/gi) || []).length, 1, `cycle ${cycle}`)
    fragment = extractPageFromFullHtml(full).body
    assert.ok(!/<body\b/i.test(fragment), `cycle ${cycle} fragment clean`)
  }
})
