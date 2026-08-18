/**
 * GrapeStrap — Unit: behaviors runtime tags in page compose/extract
 *
 * PATH: tests/unit/page-html-behaviors.test.js
 * ROLE: node:test coverage for the `manifest.behaviors` half of
 *       src/shared/page-html.js (composeFullPageHtml's BEHAVIORS_LINK /
 *       BEHAVIORS_SCRIPT emission). Covers: both tags present with their
 *       markers when the flag is set and absent when it is not; the two
 *       load-bearing orderings (stylesheet after the project stylesheet,
 *       script after the framework scripts and before the user's own); a clean
 *       compose→extract round trip, which works only because extraction strips
 *       on `data-grpstr-fw`'s PRESENCE rather than its value; and the vendored-
 *       framework case, where the bundled framework set is suppressed but the
 *       behaviors pair must still be emitted (that independence is the reason
 *       behaviors is its own manifest key instead of part of manifest.framework).
 *       Finally, a guard that both bundled runtime files still carry the
 *       machine-readable version tag main's `behaviors:ensure` reads.
 * DEPENDS: node:test, node:assert, node:fs, ../../src/shared/page-html.js
 * CREATED: 2026-08-18
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  BEHAVIORS_LINK,
  BEHAVIORS_SCRIPT,
  composeFullPageHtml,
  extractPageFromFullHtml
} from '../../src/shared/page-html.js'

// A bundled-framework project with behaviors on, plus one custom link and one
// custom script — the ordering assertions need both neighbours present.
const BEHAVIORS_MANIFEST = {
  globalCSS: 'assets/css/style.css',
  behaviors: { version: 1 }
}

const PAGE = {
  name: 'index',
  head: {
    title: 'Behaviors',
    customLinks: [{ rel: 'stylesheet', href: 'assets/css/mine.css' }],
    customScripts: [{ src: 'assets/js/mine.js', defer: true }]
  }
}

// Mirrors a starter that vendors its own framework (Graphite/Orbit): the
// bundled set is suppressed, which must not take behaviors down with it.
const VENDORED_BEHAVIORS_MANIFEST = {
  globalCSS: 'assets/css/theme.css',
  framework: {
    css: ['assets/vendor/bootstrap/bootstrap.min.css'],
    js: ['assets/vendor/bootstrap/bootstrap.bundle.min.js']
  },
  behaviors: { version: 1 }
}

// ─── flag present / absent ──────────────────────────────────────────────────

test('composeFullPageHtml: manifest.behaviors emits the runtime link + script with their markers', () => {
  const html = composeFullPageHtml('<p>hi</p>', PAGE, BEHAVIORS_MANIFEST)

  assert.ok(html.includes(`href="${BEHAVIORS_LINK.href}" data-grpstr-fw="gsb-css"`))
  assert.ok(html.includes(`src="${BEHAVIORS_SCRIPT.src}" defer data-grpstr-fw="gsb-js"`))
})

test('composeFullPageHtml: no manifest.behaviors emits neither runtime tag', () => {
  const html = composeFullPageHtml('<p>hi</p>', PAGE, { globalCSS: 'assets/css/style.css' })

  assert.ok(!html.includes(BEHAVIORS_LINK.href))
  assert.ok(!html.includes(BEHAVIORS_SCRIPT.src))
  assert.ok(!html.includes('gsb-css'))
  assert.ok(!html.includes('gsb-js'))
})

// ─── ordering ───────────────────────────────────────────────────────────────

test('composeFullPageHtml: runtime stylesheet lands after the project stylesheet, before custom links', () => {
  const html = composeFullPageHtml('<p>hi</p>', PAGE, BEHAVIORS_MANIFEST)

  const projCssAt    = html.indexOf('data-grpstr-fw="project-css"')
  const behaviorsAt  = html.indexOf(BEHAVIORS_LINK.href)
  const customLinkAt = html.indexOf('assets/css/mine.css')

  assert.ok(projCssAt !== -1 && behaviorsAt !== -1 && customLinkAt !== -1)
  assert.ok(behaviorsAt > projCssAt, 'behaviors css must follow the project stylesheet')
  assert.ok(behaviorsAt < customLinkAt, 'behaviors css must precede the user\'s own links')
})

test('composeFullPageHtml: runtime script lands after the framework scripts, before custom scripts', () => {
  const html = composeFullPageHtml('<p>hi</p>', PAGE, BEHAVIORS_MANIFEST)

  const frameworkJsAt = html.indexOf('assets/js/bootstrap.bundle.js')
  const behaviorsAt   = html.indexOf(BEHAVIORS_SCRIPT.src)
  const customJsAt    = html.indexOf('assets/js/mine.js')

  assert.ok(frameworkJsAt !== -1 && behaviorsAt !== -1 && customJsAt !== -1)
  // Bootstrap must be parsed first: the runtime listens for its dropdown
  // events and drives its Collapse/Offcanvas instances.
  assert.ok(behaviorsAt > frameworkJsAt, 'behaviors js must follow the framework scripts')
  assert.ok(behaviorsAt < customJsAt, 'behaviors js must precede the user\'s own scripts')
})

// ─── round trip ─────────────────────────────────────────────────────────────

test('round-trip: extract of a behaviors page keeps the runtime tags out of body, customLinks and customScripts', () => {
  const html = composeFullPageHtml('<p>hello</p>', PAGE, BEHAVIORS_MANIFEST)
  const { body, head } = extractPageFromFullHtml(html)

  assert.ok(body.includes('<p>hello</p>'))
  assert.ok(!body.includes('data-grpstr-fw'))
  assert.ok(!body.includes(BEHAVIORS_SCRIPT.src))

  // The user's own <link> survives; neither runtime tag leaks into either list
  // (the script never reaches <head>, and the link carries data-grpstr-fw).
  assert.deepEqual(head.customLinks, [{ rel: 'stylesheet', href: 'assets/css/mine.css', type: '' }])
  assert.deepEqual(head.customScripts, [])
})

// ─── vendored framework ─────────────────────────────────────────────────────

test('composeFullPageHtml: vendored framework suppresses the bundled set but still emits behaviors', () => {
  const html = composeFullPageHtml('<p>hi</p>', PAGE, VENDORED_BEHAVIORS_MANIFEST)

  assert.ok(!html.includes('href="assets/css/bootstrap.css"'), 'bundled framework css stays suppressed')
  assert.ok(!html.includes('src="assets/js/bootstrap.bundle.js"'), 'bundled framework js stays suppressed')
  assert.ok(html.includes('assets/vendor/bootstrap/bootstrap.min.css'))

  assert.ok(html.includes(`data-grpstr-fw="${BEHAVIORS_LINK.gstrap}"`))
  assert.ok(html.includes(`data-grpstr-fw="${BEHAVIORS_SCRIPT.gstrap}"`))

  // Still after the vendored bundle, for the same reason as above.
  assert.ok(html.indexOf(BEHAVIORS_SCRIPT.src) > html.indexOf('assets/vendor/bootstrap/bootstrap.bundle.min.js'))
})

// ─── bundled runtime files ──────────────────────────────────────────────────

test('assets/behaviors: both runtime files open with the machine-readable version tag', () => {
  // The IPC copier reads only the first 40 bytes to decide whether a project's
  // copy is stale, so the tag has to be at the very top of both files.
  const behaviorsDir = new URL('../../assets/behaviors/', import.meta.url)
  const tag = /^\/\*! gstrap-behaviors v\d+ \*\//

  for (const file of ['gstrap-behaviors.js', 'gstrap-behaviors.css']) {
    const head = readFileSync(fileURLToPath(new URL(file, behaviorsDir)), 'utf8').slice(0, 40)
    assert.match(head, tag, `${file} must open with the version tag`)
  }
})
