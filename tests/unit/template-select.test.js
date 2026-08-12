/**
 * GrapeStrap — Unit: template-select markup builder
 *
 * PATH: tests/unit/template-select.test.js
 * ROLE: Pins templateSelectHtml() (dialogs/template-select.js) as a pure
 *       string builder — flat-options output unchanged from before the
 *       B3 `groups` param landed, groups render as <optgroup> blocks after
 *       the flat options, and label/value text is HTML-escaped. The module
 *       has no i18n import at module scope (callers pass pre-translated
 *       label/value strings in), so it loads cleanly under node --test —
 *       see the module's own header note on why that matters for New
 *       Page's byte-stable starter-null markup.
 * DEPENDS: node:test, node:assert, ../../src/renderer/dialogs/template-select.js
 * CREATED: 2026-08-11
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { templateSelectHtml } from '../../src/renderer/dialogs/template-select.js'

test('flat options only: output matches the pre-groups shape exactly (byte-stable pin)', () => {
  const html = templateSelectHtml({
    labelText: 'Master template',
    noneText: 'None — standalone page',
    options: [{ value: 'site', label: 'site' }],
    dataAttr: 'data-np-template'
  })
  assert.equal(html, [
    '',
    '    <label class="gstrap-prompt-label">Master template</label>',
    '    <select class="gstrap-prompt-input" data-np-template>',
    '      <option value="">None — standalone page</option>',
    '      <option value="site">site</option>',
    '    </select>'
  ].join('\n'))
})

test('omitting groups entirely produces the same output as passing groups: []', () => {
  const opts = {
    labelText: 'Master template',
    noneText: 'None',
    noneValue: '',
    options: [],
    dataAttr: 'data-np-template'
  }
  assert.equal(templateSelectHtml(opts), templateSelectHtml({ ...opts, groups: [] }))
})

test('groups render as <optgroup> blocks after the flat options, in array order', () => {
  const html = templateSelectHtml({
    labelText: 'Master template',
    noneText: 'None',
    options: [{ value: 'free', label: 'Free option' }],
    groups: [
      { label: 'Graphite layouts', options: [
        { value: 'layout:index', label: 'Home (index)' },
        { value: 'layout:elements', label: 'Elements' }
      ] },
      { label: 'Master templates', options: [
        { value: 'tpl:site', label: 'site' }
      ] }
    ],
    dataAttr: 'data-np-template'
  })

  // The flat option lands before either optgroup.
  const freeIndex = html.indexOf('<option value="free">Free option</option>')
  const firstGroupIndex = html.indexOf('<optgroup label="Graphite layouts">')
  const secondGroupIndex = html.indexOf('<optgroup label="Master templates">')
  assert.ok(freeIndex >= 0 && firstGroupIndex > freeIndex)
  assert.ok(secondGroupIndex > firstGroupIndex)

  assert.match(html, /<optgroup label="Graphite layouts"><option value="layout:index">Home \(index\)<\/option><option value="layout:elements">Elements<\/option><\/optgroup>/)
  assert.match(html, /<optgroup label="Master templates"><option value="tpl:site">site<\/option><\/optgroup>/)
  assert.ok(html.trim().endsWith('</select>'))
})

test('an empty options array inside a group renders an optgroup with no <option> children', () => {
  const html = templateSelectHtml({
    labelText: 'x', noneText: 'None',
    groups: [{ label: 'Empty group', options: [] }],
    dataAttr: 'data-x'
  })
  assert.match(html, /<optgroup label="Empty group"><\/optgroup>/)
})

test('label and value text is HTML-escaped for both flat options and group options', () => {
  const html = templateSelectHtml({
    labelText: '<b>Label</b>',
    noneText: 'None & such',
    options: [{ value: '"quoted"', label: 'A <script>&amp;</script>' }],
    groups: [{ label: 'Group <b>"x"</b>', options: [{ value: 'v"1', label: 'L<1>' }] }],
    dataAttr: 'data-x'
  })
  assert.match(html, /<label class="gstrap-prompt-label">&lt;b&gt;Label&lt;\/b&gt;<\/label>/)
  assert.match(html, /<option value="">None &amp; such<\/option>/)
  assert.match(html, /<option value="&quot;quoted&quot;">A &lt;script&gt;&amp;amp;&lt;\/script&gt;<\/option>/)
  assert.match(html, /<optgroup label="Group &lt;b&gt;&quot;x&quot;&lt;\/b&gt;">/)
  assert.match(html, /<option value="v&quot;1">L&lt;1&gt;<\/option>/)
})
