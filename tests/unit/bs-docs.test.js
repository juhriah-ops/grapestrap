/**
 * GrapeStrap — Unit: Bootstrap docs lookup table
 *
 * PATH: tests/unit/bs-docs.test.js
 * ROLE: Pins the class → docs-page mapping behind the "More info" context
 *       items (canvas right-click, Properties class chips): representative
 *       classes land on the right page, ordering/dedup/cap behave, and
 *       non-Bootstrap classes contribute nothing.
 * DEPENDS: node:test, node:assert, src/shared/bs-docs.js
 * CREATED: 2026-08-07
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bsDocForClass, bsDocsForClasses, MAX_TOPICS } from '../../src/shared/bs-docs.js'

const url = path => `https://getbootstrap.com/docs/5.3/${path}`

test('representative classes map to their docs pages', () => {
  const cases = [
    ['col-md-6',       url('layout/columns/')],
    ['col',            url('layout/columns/')],
    ['row',            url('layout/grid/')],
    ['g-3',            url('layout/grid/')],
    ['container-fluid', url('layout/containers/')],
    ['btn-primary',    url('components/buttons/')],
    ['btn-group',      url('components/button-group/')],
    ['card-body',      url('components/card/')],
    ['navbar-expand-lg', url('components/navbar/')],
    ['mt-3',           url('utilities/spacing/')],
    ['px-auto',        url('utilities/spacing/')],
    ['d-flex',         url('utilities/display/')],
    ['justify-content-between', url('utilities/flex/')],
    ['text-center',    url('utilities/text/')],
    ['text-primary',   url('utilities/colors/')],
    ['bg-dark',        url('utilities/background/')],
    ['w-50',           url('utilities/sizing/')],
    ['rounded-3',      url('utilities/borders/')],
    ['form-control',   url('forms/form-control/')],
    ['form-check',     url('forms/checks-radios/')],
    ['table-striped',  url('content/tables/')],
    ['img-fluid',      url('content/images/')]
  ]
  for (const [cls, want] of cases) {
    assert.equal(bsDocForClass(cls)?.url, want, cls)
  }
})

test('non-Bootstrap classes return null / contribute nothing', () => {
  assert.equal(bsDocForClass('my-custom-thing'), null)
  assert.equal(bsDocForClass('hero-carousel'), null)
  assert.equal(bsDocForClass(''), null)
  assert.deepEqual(bsDocsForClasses(['my-custom-thing', 'hero']), [])
})

test('class lists dedupe by page, keep class order, and cap at MAX_TOPICS', () => {
  const docs = bsDocsForClasses(['btn', 'btn-primary', 'col-md-6', 'mt-3'])
  assert.deepEqual(docs.map(d => d.topic), ['Buttons', 'Columns', 'Spacing'])

  const capped = bsDocsForClasses(['col-md-6', 'btn', 'card', 'navbar', 'alert'])
  assert.equal(capped.length, MAX_TOPICS)
  assert.deepEqual(capped.map(d => d.topic), ['Columns', 'Buttons', 'Cards'])
})
