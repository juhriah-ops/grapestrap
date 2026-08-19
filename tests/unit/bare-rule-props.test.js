/**
 * GrapeStrap — Unit: bare-rule prop-group merge
 *
 * PATH: tests/unit/bare-rule-props.test.js
 * ROLE: Pins mergeBareRuleProps — the read → merge → write discipline the
 *       Custom colour chip and the Opacity slider use to own ONE property
 *       inside a rule they share with the Background image row and with
 *       whatever the user hand-wrote. The contract that matters: unrelated
 *       declarations survive every write, and an empty value removes exactly
 *       one property rather than the whole rule.
 * DEPENDS: node:test, node:assert,
 *          src/renderer/panels/style-manager/css-rule-utils.js
 * CREATED: 2026-08-17
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeBareRuleProps, readBareRule
} from '../../src/renderer/panels/style-manager/css-rule-utils.js'

test('mergeBareRuleProps: adds a property to an existing rule, leaving the rest alone', () => {
  const css = `.cta-link {\n  background-image: url("../images/hero.jpg");\n  background-size: cover;\n}\n`
  const out = mergeBareRuleProps(css, '.cta-link', { 'background-color': '#ff0066' })
  assert.deepEqual(readBareRule(out, '.cta-link'), {
    'background-image': 'url("../images/hero.jpg")',
    'background-size': 'cover',
    'background-color': '#ff0066'
  })
})

test('mergeBareRuleProps: creates the rule when the selector has none yet', () => {
  const out = mergeBareRuleProps('', '.cta-link', { color: '#3fb950' })
  assert.deepEqual(readBareRule(out, '.cta-link'), { color: '#3fb950' })
})

test('mergeBareRuleProps: an empty value removes only that property', () => {
  const css = `.cta-link {\n  color: #ff0066;\n  border-color: #123456;\n}\n`
  const out = mergeBareRuleProps(css, '.cta-link', { color: '' })
  assert.deepEqual(readBareRule(out, '.cta-link'), { 'border-color': '#123456' })
})

test('mergeBareRuleProps: clearing the last property drops the whole rule', () => {
  const css = `.hero { color: red; }\n.cta-link {\n  opacity: 0.5;\n}\n`
  const out = mergeBareRuleProps(css, '.cta-link', { opacity: '' })
  assert.deepEqual(readBareRule(out, '.cta-link'), {})
  assert.match(out, /\.hero \{ color: red; \}/)
})

test('mergeBareRuleProps: null and undefined values remove, "0" is written', () => {
  const css = `.cta-link {\n  color: red;\n  border-color: blue;\n  opacity: 0.5;\n}\n`
  const out = mergeBareRuleProps(css, '.cta-link', {
    color: null, 'border-color': undefined, opacity: '0'
  })
  // '0' is a legitimate opacity — it must survive the falsy-looking value.
  assert.deepEqual(readBareRule(out, '.cta-link'), { opacity: '0' })
})

test('mergeBareRuleProps: a null selector is a no-op on the sheet', () => {
  const css = `.hero { color: red; }\n`
  assert.equal(mergeBareRuleProps(css, null, { color: 'blue' }), css)
})

test('mergeBareRuleProps: rewriting the same value is byte-identical (no false dirty)', () => {
  const css = `.cta-link {\n  opacity: 0.5;\n}\n`
  assert.equal(mergeBareRuleProps(css, '.cta-link', { opacity: '0.5' }), css)
})

test('mergeBareRuleProps: does not touch a compound rule that ends in the selector', () => {
  const compound = `.hero-zone .cta-link {\n  color: #123456;\n}\n`
  const out = mergeBareRuleProps(compound, '.cta-link', { color: '#ff0066' })
  assert.ok(out.startsWith(compound), 'compound rule must stay byte-identical')
  assert.match(out, /\n\.cta-link \{\n {2}color: #ff0066;\n\}\n/)
})

// ─── Round-trips for the two properties the new affordances own ─────────────

test('custom colour round-trip: set → read back → clear, per property', () => {
  let css = ''
  for (const [prop, value] of [
    ['background-color', 'rgb(255, 0, 102)'],
    ['color', 'var(--bs-primary)'],
    ['border-color', '#3fb950']
  ]) {
    css = mergeBareRuleProps(css, '.cta-link', { [prop]: value })
    assert.equal(readBareRule(css, '.cta-link')[prop], value)
  }
  css = mergeBareRuleProps(css, '.cta-link', { color: '' })
  assert.deepEqual(readBareRule(css, '.cta-link'), {
    'background-color': 'rgb(255, 0, 102)',
    'border-color': '#3fb950'
  })
})

test('opacity round-trip: every slider step lands as a 0–1 number and reads back', () => {
  for (const percent of [0, 1, 33, 50, 99, 100]) {
    const value = String(Number((percent / 100).toFixed(2)))
    const css = mergeBareRuleProps('', '.cta-link', { opacity: value })
    assert.equal(readBareRule(css, '.cta-link').opacity, value)
    assert.equal(Math.round(Number.parseFloat(value) * 100), percent)
  }
})

// ─── Winning the cascade, not just landing in the sheet (2026-08-18) ─────────

test('mergeBareRuleProps: a later same-selector rule does not swallow the write', () => {
  // The masking shape the acceptance report hit: the property was merged into
  // the FIRST rule, and the second one — same selector, `background` shorthand,
  // further down the sheet — overrode it. The write has to end up in the rule
  // that actually wins.
  const css = `.hero {\n  padding: 2em;\n}\n.hero {\n  background: #1b1b1b;\n}\n`
  const out = mergeBareRuleProps(css, '.hero', { 'background-color': '#101820' })
  assert.equal(out, `.hero {\n  padding: 2em;\n}\n.hero {\n  background: #1b1b1b;\n  background-color: #101820;\n}\n`)
  assert.equal(readBareRule(out, '.hero')['background-color'], '#101820')
})

test('mergeBareRuleProps: a section chunk is overridden, never edited', () => {
  const chunked = `\n/* gs-sec:orbit-hero */\n.gs-orbit-hero {\n  background: #1b1b1b;\n}\n`
  const out = mergeBareRuleProps(chunked, '.gs-orbit-hero', { 'background-color': '#101820' })
  assert.ok(out.startsWith(chunked), 'the chunk must stay byte-identical')
  assert.match(out, /\n\.gs-orbit-hero \{\n {2}background-color: #101820;\n\}\n$/)

  // A second property joins the SAME override rule rather than starting
  // another one, and re-writing a value already there changes nothing.
  const both = mergeBareRuleProps(out, '.gs-orbit-hero', { opacity: '0.9' })
  assert.match(both, /\n\.gs-orbit-hero \{\n {2}background-color: #101820;\n {2}opacity: 0\.9;\n\}\n$/)
  assert.equal(mergeBareRuleProps(both, '.gs-orbit-hero', { opacity: '0.9' }), both)

  // Clearing hands the element back to the chunk's own value.
  const cleared = mergeBareRuleProps(both, '.gs-orbit-hero', { 'background-color': '', opacity: '' })
  assert.equal(cleared, chunked)
})
