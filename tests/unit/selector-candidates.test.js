/**
 * GrapeStrap — Unit: selector candidates for a component
 *
 * PATH: tests/unit/selector-candidates.test.js
 * ROLE: Pins listSelectorCandidates — the list the Style Manager's "Applies to"
 *       picker offers, and the source of pickSelector's default. The rules that
 *       matter: framework vocabulary is never a target (a rule scoped to
 *       `.mt-3` or `.navbar` repaints half the project), the element's own
 *       classes keep their authored order so the default is predictable, and a
 *       GrapesJS auto-id is never offered as a selector that would survive the
 *       session.
 * DEPENDS: node:test, node:assert,
 *          src/renderer/panels/style-manager/css-rule-utils.js
 * CREATED: 2026-08-18
 *
 * Component stubs, not GrapesJS models: the functions only ever call
 * getClasses() and getId(), and standing a real editor up for that would test
 * Backbone rather than the selector rules.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  listSelectorCandidates, pickSelector, isBsUtility
} from '../../src/renderer/panels/style-manager/css-rule-utils.js'

const stub = (classes, id) => ({ getClasses: () => classes, getId: () => id })

test('candidates: every non-utility class, in the order the element wears them', () => {
  const component = stub(['gs-sec', 'gs-orbit', 'mt-3', 'gs-orbit-hero'], 'i3kf')
  assert.deepEqual(listSelectorCandidates(component, isBsUtility),
    ['.gs-sec', '.gs-orbit', '.gs-orbit-hero'])
  // The default is the first candidate — what pickSelector always returned.
  assert.equal(pickSelector(component, isBsUtility), '.gs-sec')
})

test('candidates: a real id is offered last, an auto-id not at all', () => {
  assert.deepEqual(listSelectorCandidates(stub(['cta-link'], 'main-nav'), isBsUtility),
    ['.cta-link', '#main-nav'])
  // GrapesJS mints 'i' + generated characters per session; a rule scoped to one
  // would stop matching the element the next time the project is opened.
  assert.deepEqual(listSelectorCandidates(stub(['cta-link'], 'i9x2a'), isBsUtility),
    ['.cta-link'])
})

test('candidates: an element wearing only utilities has none', () => {
  const component = stub(['mt-3', 'd-flex', 'text-center'], 'ijl9')
  assert.deepEqual(listSelectorCandidates(component, isBsUtility), [])
  // Which is the signal the rows turn into their "needs a selector" hint.
  assert.equal(pickSelector(component, isBsUtility), null)
})

test('candidates: a panel can exclude more than the BS utilities', () => {
  // The Navbar panel rules out Bootstrap's navbar vocabulary too — a colour on
  // `.navbar` would repaint every navbar in the project.
  const isSharedNavbarClass = cls =>
    isBsUtility(cls) || /^(?:navbar(?:-.+)?|(?:sticky|fixed)-(?:top|bottom))$/.test(cls)
  const component = stub(['navbar', 'navbar-expand-md', 'sticky-top', 'site-header-nav'], 'i7q')
  assert.deepEqual(listSelectorCandidates(component, isSharedNavbarClass), ['.site-header-nav'])
})

test('candidates: no component, no candidates', () => {
  assert.deepEqual(listSelectorCandidates(null, isBsUtility), [])
  assert.equal(pickSelector(null, isBsUtility), null)
})
