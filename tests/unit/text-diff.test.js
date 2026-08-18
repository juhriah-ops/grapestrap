/**
 * GrapeStrap — Unit: minimal single-range text edit
 *
 * PATH: tests/unit/text-diff.test.js
 * ROLE: Pins computeMinimalTextEdit, the primitive that lets the design→code
 *       sync stop calling Monaco's `setValue` (which clears the model's undo
 *       stack and resets the caret — the split-view undo bug diagnosed
 *       2026-08-17). Every case here is "apply the returned range to oldText
 *       and you must get newText back", plus the minimality and inverted-range
 *       traps that a naive prefix/suffix trim falls into.
 * DEPENDS: node:test, node:assert, ../../src/shared/text-diff.js
 * CREATED: 2026-08-17
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMinimalTextEdit } from '../../src/shared/text-diff.js'

/** Apply a computed edit to `before` the way Monaco would, for round-trip checks. */
function applyEdit(before, edit) {
  if (!edit) return before
  return before.slice(0, edit.startOffset) + edit.text + before.slice(edit.endOffset)
}

test('identical text returns null so the caller can skip the write entirely', () => {
  assert.equal(computeMinimalTextEdit('<p>x</p>', '<p>x</p>'), null)
  assert.equal(computeMinimalTextEdit('', ''), null)
})

test('a mid-document change is trimmed to just the changed span', () => {
  const before = '<div>\n  <p>old</p>\n</div>'
  const after = '<div>\n  <p>new</p>\n</div>'
  const edit = computeMinimalTextEdit(before, after)
  assert.equal(applyEdit(before, edit), after)
  assert.equal(edit.text, 'new')
  assert.equal(before.slice(edit.startOffset, edit.endOffset), 'old')
})

test('an append touches only the tail — prefix is never re-written', () => {
  const before = '<p>a</p>'
  const after = '<p>a</p><p>b</p>'
  const edit = computeMinimalTextEdit(before, after)
  assert.equal(applyEdit(before, edit), after)
  assert.equal(edit.startOffset, before.length)
  assert.equal(edit.endOffset, before.length)
  assert.equal(edit.text, '<p>b</p>')
})

test('a prepend never rewrites the tail', () => {
  const before = '<p>b</p>'
  const after = '<p>a</p><p>b</p>'
  const edit = computeMinimalTextEdit(before, after)
  assert.equal(applyEdit(before, edit), after)
  // Offsets land at 3, not 0: the two strings genuinely share the '<p>'
  // prefix, so the trim keeps it. What matters is that the edit is anchored
  // at the head — the trailing 'b</p>' the user may have their caret in is
  // outside the replaced span.
  assert.equal(edit.endOffset, edit.startOffset, 'a pure insertion replaces nothing')
  assert.ok(edit.endOffset < before.length, 'the tail must sit outside the edit range')
})

test('an insertion in a repeated-sibling list stays anchored to one region', () => {
  const before = '<li>1</li><li>3</li>'
  const after = '<li>1</li><li>2</li><li>3</li>'
  const edit = computeMinimalTextEdit(before, after)
  assert.equal(applyEdit(before, edit), after)
  assert.equal(edit.text.length, after.length - before.length, 'inserts exactly the new characters')
  assert.equal(edit.endOffset, edit.startOffset)
})

test('a pure deletion produces an empty replacement over the removed span', () => {
  const before = '<p>a</p><p>gone</p><p>b</p>'
  const after = '<p>a</p><p>b</p>'
  const edit = computeMinimalTextEdit(before, after)
  assert.equal(applyEdit(before, edit), after)
  assert.equal(edit.text, '')
})

test('repeated characters cannot produce an inverted range (prefix/suffix overlap)', () => {
  // The classic trap: naive independent prefix and suffix scans both claim the
  // same 'aaa', giving endOffset < startOffset and a corrupt edit.
  for (const [before, after] of [
    ['aaa', 'aaaa'],
    ['aaaa', 'aaa'],
    ['', 'aaa'],
    ['aaa', ''],
    ['\n\n\n', '\n\n\n\n']
  ]) {
    const edit = computeMinimalTextEdit(before, after)
    assert.ok(edit.endOffset >= edit.startOffset, `inverted range for ${JSON.stringify([before, after])}`)
    assert.ok(edit.startOffset >= 0 && edit.endOffset <= before.length)
    assert.equal(applyEdit(before, edit), after)
  }
})

test('a completely different document still round-trips as one full-range edit', () => {
  const before = '<html><body><p>one</p></body></html>'
  const after = 'totally different'
  const edit = computeMinimalTextEdit(before, after)
  assert.equal(applyEdit(before, edit), after)
})

test('nullish input is coerced to empty string rather than throwing', () => {
  assert.equal(computeMinimalTextEdit(null, null), null)
  assert.equal(applyEdit('', computeMinimalTextEdit(null, 'x')), 'x')
  assert.equal(applyEdit('x', computeMinimalTextEdit('x', null)), '')
})

test('a realistic full-page sync only rewrites the body region it changed', () => {
  const head = '<!doctype html>\n<html lang="en">\n<head>\n  <title>t</title>\n</head>\n<body>\n'
  const tail = '\n</body>\n</html>\n'
  const before = `${head}  <main><h1>Hello</h1></main>${tail}`
  const after = `${head}  <main><h1>Hello</h1><p>added</p></main>${tail}`
  const edit = computeMinimalTextEdit(before, after)
  assert.equal(applyEdit(before, edit), after)
  // The untouched <head> and closing tags must sit outside the replaced span —
  // that is exactly what keeps Monaco's caret and folding state alive.
  assert.ok(edit.startOffset > head.length, 'head must not be inside the edit range')
  assert.ok(edit.endOffset < before.length - tail.length + 1, 'tail must not be inside the edit range')
})
