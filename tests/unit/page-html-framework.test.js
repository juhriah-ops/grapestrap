/**
 * GrapeStrap — Unit: page-html framework/globalCSS resolution
 *
 * PATH: tests/unit/page-html-framework.test.js
 * ROLE: node:test coverage for src/shared/page-html.js's manifest.framework /
 *       manifest.globalCSS resolution — the piece the Graphite starter wave
 *       added so a project can vendor its own Bootstrap/FA set instead of
 *       GrapeStrap's bundled one (composeFullPageHtml#resolveFrameworkAssets,
 *       #projectStylesheetHref). Covers: framework-present emits the vendored
 *       hrefs in declared order and suppresses the bundled default set;
 *       framework-absent emits the bundled default set; legacy
 *       globalCSS:'style.css' manifests still resolve to
 *       assets/css/style.css; and the compose→extract round trip, including
 *       the documented customScripts contract (emitted at end-of-body, so
 *       extraction alone always comes back empty — project-manager.js
 *       #loadProject merges the manifest's own page.head back in, which this
 *       test replicates rather than importing the main-process module).
 * DEPENDS: node:test, node:assert, ../../src/shared/page-html.js
 * CREATED: 2026-08-02
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composeFullPageHtml, extractPageFromFullHtml } from '../../src/shared/page-html.js'

// Mirrors src/main/starters/graphite.js's manifest overrides exactly (5 CSS,
// 1 JS, in registration order) so a drift in the starter's own list would
// also break this test — the two are meant to move together.
const FRAMEWORK_MANIFEST = {
  globalCSS: 'assets/css/theme.css',
  framework: {
    css: [
      'assets/vendor/bootstrap/bootstrap.min.css',
      'assets/vendor/fontawesome/css/fontawesome.min.css',
      'assets/vendor/fontawesome/css/solid.min.css',
      'assets/vendor/fontawesome/css/brands.min.css',
      'assets/vendor/fonts/graphite-fonts.css'
    ],
    js: ['assets/vendor/bootstrap/bootstrap.bundle.min.js']
  },
  metadata: { starter: 'graphite' }
}

const FRAMEWORK_PAGE = {
  name: 'index',
  head: {
    title: 'Graphite',
    customScripts: [{ src: 'assets/js/main.js' }]
  }
}

// ─── manifest.framework present ────────────────────────────────────────────

test('composeFullPageHtml: manifest.framework emits vendored hrefs in declared order', () => {
  const html = composeFullPageHtml('<p>hi</p>', FRAMEWORK_PAGE, FRAMEWORK_MANIFEST)

  const order = [
    'assets/vendor/bootstrap/bootstrap.min.css',
    'assets/vendor/fontawesome/css/fontawesome.min.css',
    'assets/vendor/fontawesome/css/solid.min.css',
    'assets/vendor/fontawesome/css/brands.min.css',
    'assets/vendor/fonts/graphite-fonts.css'
  ].map(href => html.indexOf(href))

  assert.ok(order.every(idx => idx !== -1), 'every vendored css href must appear')
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] > order[i - 1], 'vendored css hrefs must appear in declared order')
  }

  assert.ok(html.includes('assets/vendor/bootstrap/bootstrap.bundle.min.js'))
  assert.match(html, /data-grpstr-fw="fwx-0"[\s\S]*data-grpstr-fw="fwx-4"/)
  assert.match(html, /data-grpstr-fw="fwjs-0"/)
})

test('composeFullPageHtml: manifest.framework suppresses the bundled default CSS/JS set', () => {
  const html = composeFullPageHtml('<p>hi</p>', FRAMEWORK_PAGE, FRAMEWORK_MANIFEST)

  assert.ok(!html.includes('href="assets/css/bootstrap.css"'))
  assert.ok(!html.includes('href="assets/css/bootstrap-icons.css"'))
  assert.ok(!html.includes('href="assets/css/all.css"'))
  assert.ok(!html.includes('src="assets/js/bootstrap.bundle.js"'))
})

test('composeFullPageHtml: manifest.framework project stylesheet resolves to globalCSS', () => {
  const html = composeFullPageHtml('<p>hi</p>', FRAMEWORK_PAGE, FRAMEWORK_MANIFEST)
  assert.ok(html.includes('href="assets/css/theme.css" data-grpstr-fw="project-css"'))
  assert.ok(!html.includes('href="assets/css/style.css"'))
})

// ─── manifest.framework absent (default bundled set) ───────────────────────

test('composeFullPageHtml: no manifest.framework emits the bundled default CSS/JS set', () => {
  const html = composeFullPageHtml('<p>hi</p>', { name: 'index', head: {} }, { globalCSS: 'assets/css/style.css' })

  assert.ok(html.includes('href="assets/css/bootstrap.css"'))
  assert.ok(html.includes('href="assets/css/bootstrap-icons.css"'))
  assert.ok(html.includes('href="assets/css/all.css"'))
  assert.ok(html.includes('src="assets/js/bootstrap.bundle.js"'))
  assert.ok(html.includes('href="assets/css/style.css" data-grpstr-fw="project-css"'))
  assert.ok(!html.includes('data-grpstr-fw="fwx-'))
  assert.ok(!html.includes('data-grpstr-fw="fwjs-'))
})

// ─── legacy globalCSS fallback ──────────────────────────────────────────────

test('composeFullPageHtml: legacy globalCSS "style.css" manifest falls back to assets/css/style.css', () => {
  const html = composeFullPageHtml('<p>hi</p>', { name: 'index', head: {} }, { globalCSS: 'style.css' })
  assert.ok(html.includes('href="assets/css/style.css"'))
  assert.ok(!html.includes('href="style.css"'))
})

// ─── compose → extract round trip ───────────────────────────────────────────

test('round-trip: extract of a framework-composed page carries no framework tags in the body', () => {
  const html = composeFullPageHtml('<p>hello</p>', FRAMEWORK_PAGE, FRAMEWORK_MANIFEST)
  const { body } = extractPageFromFullHtml(html)

  assert.ok(body.includes('<p>hello</p>'))
  assert.ok(!body.includes('data-grpstr-fw'))
  assert.ok(!body.includes('data-grpstr-script'))
})

test('round-trip: customScripts are not recovered from extraction alone (end-of-body emission), but survive the documented manifest merge', () => {
  const html = composeFullPageHtml('<p>hello</p>', FRAMEWORK_PAGE, FRAMEWORK_MANIFEST)
  const { head } = extractPageFromFullHtml(html)

  // composeFullPageHtml emits customScripts at end-of-body (not in <head>),
  // and stripGstrapBodyTrailers removes them from the extracted body — so a
  // bare extract always comes back empty. This is the exact gap
  // project-manager.js#loadProject documents and works around.
  assert.deepEqual(head.customScripts, [])

  // The same merge loadProject performs: the manifest's own page.head is the
  // source of truth for customScripts whenever the parsed value is empty.
  const merged = {
    ...FRAMEWORK_PAGE.head,
    ...head,
    customScripts: head.customScripts.length ? head.customScripts : FRAMEWORK_PAGE.head.customScripts
  }
  assert.deepEqual(merged.customScripts, [{ src: 'assets/js/main.js' }])
})
