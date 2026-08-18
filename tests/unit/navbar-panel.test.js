/**
 * GrapeStrap — Unit: Navbar sub-panel resolution + threshold clamp
 *
 * PATH: tests/unit/navbar-panel.test.js
 * ROLE: Pins the two pure decisions the Navbar sub-panel makes before it
 *       touches anything: WHICH component a gesture writes to, and WHAT number
 *       a typed threshold becomes. resolveNavbar's narrowness is the load-
 *       bearing half — an over-eager walk would put navbar controls in front
 *       of a user who selected a paragraph three sections down the page, and
 *       every write in the panel would then target a navbar they never
 *       selected. The clamp is shared by the reader and the input handler, so
 *       a drift between them would show 40px in the box while the page
 *       carried something else.
 * DEPENDS: node:test, node:assert,
 *          ../../src/renderer/panels/style-manager/navbar.js
 * CREATED: 2026-08-18
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveNavbar, clampScrollOffset } from '../../src/renderer/panels/style-manager/navbar.js'

// ─── Backbone-shaped stubs ──────────────────────────────────────────────────
// Only the four calls resolveNavbar makes: get('tagName'), getClasses(),
// parent(), components(). Children are linked to their parent on construction
// so a stub tree behaves like the real one in both directions.

function makeComponent(tagName, classes = [], children = []) {
  const component = {
    parentComponent: null,
    get: key => (key === 'tagName' ? tagName : undefined),
    getClasses: () => [...classes],
    parent: () => component.parentComponent,
    components: () => children
  }
  for (const child of children) child.parentComponent = component
  return component
}

const navbar = (children = []) => makeComponent('nav', ['navbar', 'navbar-expand-lg'], children)

test('resolveNavbar: the selection itself, when it is the navbar', () => {
  const nav = navbar()
  assert.equal(resolveNavbar(nav), nav)
})

test('resolveNavbar: walks up from a descendant of the navbar', () => {
  const link = makeComponent('a', ['nav-link'])
  const item = makeComponent('li', ['nav-item'], [link])
  const list = makeComponent('ul', ['navbar-nav'], [item])
  const collapse = makeComponent('div', ['collapse', 'navbar-collapse'], [list])
  const nav = navbar([collapse])
  makeComponent('body', [], [nav])   // wrapper, to prove the walk stops in time

  assert.equal(resolveNavbar(link), nav)
})

test('resolveNavbar: a selected <header> whose DIRECT child is the navbar', () => {
  // The shape every harvested navbar section ships as — clicking the band
  // selects the header, and the controls must still apply.
  const nav = navbar()
  const header = makeComponent('header', ['gs-sec'], [nav])
  assert.equal(resolveNavbar(header), nav)
})

test('resolveNavbar: a <header> with the navbar buried deeper is NOT accepted', () => {
  // Direct child only. Anything looser turns "select the page band" into
  // "find me a navbar somewhere below", which is how a paragraph ends up
  // editing chrome it does not belong to.
  const nav = navbar()
  const inner = makeComponent('div', ['container'], [nav])
  const header = makeComponent('header', [], [inner])
  assert.equal(resolveNavbar(header), null)
})

test('resolveNavbar: a sibling navbar elsewhere on the page is not resolved', () => {
  const paragraph = makeComponent('p')
  const article = makeComponent('section', ['content'], [paragraph])
  makeComponent('body', [], [navbar(), article])

  assert.equal(resolveNavbar(paragraph), null)
})

test('resolveNavbar: <nav> without the Bootstrap navbar class does not count', () => {
  const breadcrumbs = makeComponent('nav', ['breadcrumb-bar'])
  assert.equal(resolveNavbar(breadcrumbs), null)
})

test('resolveNavbar: null selection, and a cyclic chain, both end at null', () => {
  assert.equal(resolveNavbar(null), null)
  assert.equal(resolveNavbar(undefined), null)

  // A malformed tree must exhaust the step bound and return, not spin.
  const loop = makeComponent('div')
  loop.parentComponent = loop
  assert.equal(resolveNavbar(loop), null)
})

test('clampScrollOffset: empty, junk and non-positive values fall back to the runtime default', () => {
  // 40 is DEFAULT_NAV_OFFSET in assets/behaviors/gstrap-behaviors.js — the
  // number the runtime uses when the markup names none.
  for (const raw of ['', '   ', 'abc', null, undefined, '0', '-12']) {
    assert.equal(clampScrollOffset(raw), 40, `expected the default for ${JSON.stringify(raw)}`)
  }
})

test('clampScrollOffset: real values pass through, absurd ones are capped', () => {
  assert.equal(clampScrollOffset('120'), 120)
  assert.equal(clampScrollOffset(120), 120)
  assert.equal(clampScrollOffset('80px'), 80)   // parseInt tolerance, same as the runtime's
  assert.equal(clampScrollOffset('999999'), 2000)
  assert.equal(clampScrollOffset('40'), 40)
})
