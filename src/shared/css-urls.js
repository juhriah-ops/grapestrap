/**
 * GrapeStrap — CSS url() resolution helpers (shared between main + renderer)
 *
 * PATH: src/shared/css-urls.js
 * ROLE: Rewrites relative url() values in the project's globalCSS between the
 *       two bases the app must serve:
 *         - AUTHORED (canonical, on disk): file-relative to the stylesheet at
 *           assets/css/style.css — e.g. `url("../images/foo.png")`. Export
 *           ships this byte-identical; pages link the stylesheet via
 *           `<link href="assets/css/style.css">` so the browser resolves the
 *           urls against assets/css/ and they just work.
 *         - CANVAS (in-memory only): the canvas iframe injects globalCSS as an
 *           inline <style>, so its urls resolve against the document base
 *           (`<base href="file://<projectDir>/site/">`). rewriteCssUrls()
 *           converts stylesheet-relative → document-relative at inject time;
 *           the user's CSS is never modified.
 *       Also provides the one-shot legacy migration (pre-rc.3 the app wrote
 *       site-root-relative `url("assets/images/…")`, which broke on export).
 *
 *       Known limitation: url values containing an unescaped `)` or a quote
 *       of the other kind are not matched (they pass through untouched), and
 *       string-form `@import "…"` is deliberately left alone — only
 *       `@import url(…)` is covered, via the same url() pattern.
 * DEPENDS: nothing (plain JS — importable from main/, renderer/, and tests)
 * CREATED: 2026-07-25
 */

// Matches url(…) with double, single, or no quotes. Case-insensitive (URL()
// is legal CSS). The backreference keeps open/close quotes paired; the
// character class excludes quotes and `)` so an unquoted value can't swallow
// the closing paren. Also matches the url() form of @import.
const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")]*?)\1\s*\)/gi

// url() values the canvas rewrite must never touch: empty, absolute-path
// (`/…` — also covers protocol-relative `//…`), fragment-only (`#…` — SVG
// filter/gradient references), and any protocol form (`http:`, `https:`,
// `file:`, `data:`, `blob:`, …).
const PROTOCOL_PATTERN = /^[a-z][a-z0-9+.-]*:/i

// The exact shapes the app itself historically wrote into globalCSS
// (background.js picker + hand edits following its example): site-root-
// relative urls into the three asset media dirs. Nothing else in user CSS
// is a known-app shape, so nothing else is migrated.
const LEGACY_ASSET_URL_PATTERN = /url\(\s*(['"]?)assets\/(images|fonts|videos)\/([^'")]*?)\1\s*\)/gi

/**
 * Directory prefix of a stylesheet path, trailing slash included.
 * 'assets/css/style.css' → 'assets/css/'; a bare filename → ''.
 * @param {string} stylesheetPath - Path of the stylesheet relative to the document root
 * @returns {string} The base to resolve the stylesheet's relative urls against
 */
export function stylesheetDirOf(stylesheetPath) {
  const path = String(stylesheetPath || '')
  const lastSlash = path.lastIndexOf('/')
  return lastSlash === -1 ? '' : path.slice(0, lastSlash + 1)
}

/**
 * True when a url() value must pass through any rewrite untouched.
 * @param {string} url - Trimmed url() value
 * @returns {boolean}
 */
export function shouldSkipCssUrl(url) {
  if (!url) return true
  return url.startsWith('/') || url.startsWith('#') || PROTOCOL_PATTERN.test(url)
}

/**
 * Resolve a relative url against a base directory, collapsing `.` and `..`
 * segments. `..` that would climb above the document root is kept verbatim
 * (best effort — the canvas <base> is the site root, nothing above it can
 * resolve anyway). Query/fragment suffixes ride along on the last segment.
 * @param {string} url - Relative url (e.g. '../images/foo.png')
 * @param {string} fromBase - Base directory with trailing slash (e.g. 'assets/css/'), or ''
 * @returns {string} Document-relative path (e.g. 'assets/images/foo.png')
 */
export function resolveAgainstBase(url, fromBase) {
  const resolved = []
  for (const segment of (String(fromBase || '') + String(url || '')).split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (resolved.length > 0 && resolved[resolved.length - 1] !== '..') resolved.pop()
      else resolved.push(segment)
    } else {
      resolved.push(segment)
    }
  }
  return resolved.join('/')
}

/**
 * Map one url() value from stylesheet-relative to document-relative.
 * Skip-listed urls and legacy site-root-relative `assets/…` urls (the
 * pre-rc.3 picker shape — already document-relative) pass through unchanged.
 * @param {string} url - Trimmed url() value
 * @param {string} fromBase - The stylesheet's directory (see stylesheetDirOf)
 * @returns {string}
 */
export function toDocumentRelativeUrl(url, fromBase) {
  if (shouldSkipCssUrl(url)) return url
  if (url.startsWith('assets/')) return url  // legacy compat heuristic
  return resolveAgainstBase(url, fromBase)
}

/**
 * Rewrite every relative url() in a stylesheet from stylesheet-relative to
 * document-relative, for injecting the CSS inline where the stylesheet's own
 * directory no longer anchors resolution (the canvas iframe). Pure — the
 * input string is never mutated and non-matching text is preserved verbatim.
 * @param {string} css - Stylesheet text (the project's globalCSS)
 * @param {string} fromBase - The stylesheet's directory (e.g. 'assets/css/')
 * @returns {string} CSS safe to inject as an inline <style> at the document root
 */
export function rewriteCssUrls(css, fromBase) {
  if (!css) return ''
  return css.replace(CSS_URL_PATTERN, (match, quote, url) => {
    const trimmed = url.trim()
    const resolved = toDocumentRelativeUrl(trimmed, fromBase)
    if (resolved === trimmed) return match
    return `url(${quote}${resolved}${quote})`
  })
}

/**
 * One-shot legacy migration, run when a project loads: rewrite the exact
 * site-root-relative shapes the app historically wrote —
 * `url("assets/(images|fonts|videos)/…")` → `url("../(images|fonts|videos)/…")`
 * — so old projects become export-correct under the file-relative convention.
 * Everything else in the user's CSS is left byte-identical.
 * @param {string} css - Stylesheet text as loaded from disk
 * @returns {{css: string, changed: boolean}} Migrated text + whether anything was rewritten
 */
export function migrateLegacyAssetUrls(css) {
  if (!css) return { css: css || '', changed: false }
  let changed = false
  const migrated = css.replace(LEGACY_ASSET_URL_PATTERN, (match, quote, mediaDir, rest) => {
    changed = true
    return `url(${quote}../${mediaDir}/${rest}${quote})`
  })
  return { css: migrated, changed }
}
