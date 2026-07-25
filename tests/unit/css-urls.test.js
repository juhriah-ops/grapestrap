/**
 * GrapeStrap — Unit: CSS url() resolution helpers
 *
 * PATH: tests/unit/css-urls.test.js
 * ROLE: node:test coverage for src/shared/css-urls.js — canvas rewrite shapes
 *       (quote styles, skip list, legacy passthrough, @import url()), path
 *       resolution edges, and the one-shot legacy migration. Runs via
 *       `npm run test:unit` (plain node — no Electron, no Playwright).
 * DEPENDS: node:test, node:assert, ../../src/shared/css-urls.js
 * CREATED: 2026-07-25
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stylesheetDirOf,
  shouldSkipCssUrl,
  resolveAgainstBase,
  toDocumentRelativeUrl,
  rewriteCssUrls,
  migrateLegacyAssetUrls
} from '../../src/shared/css-urls.js'

const BASE = 'assets/css/'

// ─── stylesheetDirOf ─────────────────────────────────────────────────────────

test('stylesheetDirOf: nested path keeps trailing slash, bare filename is empty', () => {
  assert.equal(stylesheetDirOf('assets/css/style.css'), 'assets/css/')
  assert.equal(stylesheetDirOf('style.css'), '')
  assert.equal(stylesheetDirOf(''), '')
})

// ─── shouldSkipCssUrl ────────────────────────────────────────────────────────

test('shouldSkipCssUrl: absolute, protocol, protocol-relative, fragment, empty', () => {
  assert.equal(shouldSkipCssUrl('/images/x.png'), true)
  assert.equal(shouldSkipCssUrl('//cdn.example.com/x.png'), true)
  assert.equal(shouldSkipCssUrl('http://example.com/x.png'), true)
  assert.equal(shouldSkipCssUrl('https://example.com/x.png'), true)
  assert.equal(shouldSkipCssUrl('file:///tmp/x.png'), true)
  assert.equal(shouldSkipCssUrl('data:image/png;base64,AAAA'), true)
  assert.equal(shouldSkipCssUrl('blob:abc-123'), true)
  assert.equal(shouldSkipCssUrl('#gradient-stop'), true)
  assert.equal(shouldSkipCssUrl(''), true)
  assert.equal(shouldSkipCssUrl('../images/x.png'), false)
  assert.equal(shouldSkipCssUrl('x.png'), false)
})

// ─── resolveAgainstBase ──────────────────────────────────────────────────────

test('resolveAgainstBase: dot-dot, sibling, dot, and above-root edges', () => {
  assert.equal(resolveAgainstBase('../images/x.png', BASE), 'assets/images/x.png')
  assert.equal(resolveAgainstBase('x.png', BASE), 'assets/css/x.png')
  assert.equal(resolveAgainstBase('./x.png', BASE), 'assets/css/x.png')
  assert.equal(resolveAgainstBase('../../x.png', BASE), 'x.png')
  // Climbing above the document root keeps the leftover `..` verbatim.
  assert.equal(resolveAgainstBase('../../../x.png', BASE), '../x.png')
  // Query/fragment suffixes ride along on the last segment.
  assert.equal(resolveAgainstBase('../fonts/f.woff2?v=1#iefix', BASE), 'assets/fonts/f.woff2?v=1#iefix')
})

// ─── toDocumentRelativeUrl ───────────────────────────────────────────────────

test('toDocumentRelativeUrl: rewrites relative, passes through skip-list and legacy assets/', () => {
  assert.equal(toDocumentRelativeUrl('../images/x.png', BASE), 'assets/images/x.png')
  assert.equal(toDocumentRelativeUrl('assets/images/x.png', BASE), 'assets/images/x.png')
  assert.equal(toDocumentRelativeUrl('https://example.com/x.png', BASE), 'https://example.com/x.png')
  assert.equal(toDocumentRelativeUrl('/x.png', BASE), '/x.png')
})

// ─── rewriteCssUrls ──────────────────────────────────────────────────────────

test('rewriteCssUrls: double, single, and no quotes', () => {
  const css = '.a { background-image: url("../images/a.png"); }\n' +
              ".b { background-image: url('../images/b.png'); }\n" +
              '.c { background-image: url(../images/c.png); }\n'
  const out = rewriteCssUrls(css, BASE)
  assert.ok(out.includes('url("assets/images/a.png")'))
  assert.ok(out.includes("url('assets/images/b.png')"))
  assert.ok(out.includes('url(assets/images/c.png)'))
})

test('rewriteCssUrls: stylesheet-sibling url resolves into the stylesheet dir', () => {
  assert.equal(
    rewriteCssUrls('.a { background: url("x.png"); }', BASE),
    '.a { background: url("assets/css/x.png"); }'
  )
})

test('rewriteCssUrls: skip list stays byte-identical', () => {
  const css = '.a { background: url(/abs.png); }\n' +
              '.b { background: url("http://example.com/x.png"); }\n' +
              '.c { background: url("https://example.com/x.png"); }\n' +
              '.d { background: url("file:///tmp/x.png"); }\n' +
              '.e { background: url(data:image/png;base64,AAAA); }\n' +
              '.f { background: url("blob:abc"); }\n' +
              '.g { background: url("//cdn.example.com/x.png"); }\n' +
              '.h { filter: url(#blur); }\n'
  assert.equal(rewriteCssUrls(css, BASE), css)
})

test('rewriteCssUrls: legacy site-root-relative assets/ urls pass through unchanged', () => {
  const css = '.hero { background-image: url("assets/images/legacy.png"); }'
  assert.equal(rewriteCssUrls(css, BASE), css)
})

test('rewriteCssUrls: @import url() forms are rewritten too', () => {
  const css = '@import url("../css/extra.css");\n@import url(fonts.css);\n'
  const out = rewriteCssUrls(css, BASE)
  assert.ok(out.includes('@import url("assets/css/extra.css")'))
  assert.ok(out.includes('@import url(assets/css/fonts.css)'))
})

test('rewriteCssUrls: string-form @import is left alone (documented limitation)', () => {
  const css = '@import "../css/extra.css";'
  assert.equal(rewriteCssUrls(css, BASE), css)
})

test('rewriteCssUrls: whitespace inside url() is tolerated, empty input yields empty string', () => {
  assert.equal(
    rewriteCssUrls('.a { background: url( "../images/x.png" ); }', BASE),
    '.a { background: url("assets/images/x.png"); }'
  )
  assert.equal(rewriteCssUrls('', BASE), '')
  assert.equal(rewriteCssUrls(null, BASE), '')
})

// ─── migrateLegacyAssetUrls ──────────────────────────────────────────────────

test('migrateLegacyAssetUrls: rewrites exactly the historical app shapes', () => {
  const css = '.hero { background-image: url("assets/images/bg.png"); }\n' +
              "@font-face { src: url('assets/fonts/brand.woff2'); }\n" +
              '.clip { background: url(assets/videos/loop.mp4); }\n'
  const { css: out, changed } = migrateLegacyAssetUrls(css)
  assert.equal(changed, true)
  assert.ok(out.includes('url("../images/bg.png")'))
  assert.ok(out.includes("url('../fonts/brand.woff2')"))
  assert.ok(out.includes('url(../videos/loop.mp4)'))
})

test('migrateLegacyAssetUrls: everything else is untouched, changed=false', () => {
  const css = '.a { background: url("../images/already.png"); }\n' +
              '.b { background: url("https://example.com/assets/images/x.png"); }\n' +
              '.c { background: url("/assets/images/abs.png"); }\n' +
              '.d { background: url("assets/css/x.png"); }\n' +  // not a media dir
              '.e { color: red; }\n'
  const { css: out, changed } = migrateLegacyAssetUrls(css)
  assert.equal(changed, false)
  assert.equal(out, css)
})

test('migrateLegacyAssetUrls: empty/null input round-trips safely', () => {
  assert.deepEqual(migrateLegacyAssetUrls(''), { css: '', changed: false })
  assert.deepEqual(migrateLegacyAssetUrls(null), { css: '', changed: false })
})
