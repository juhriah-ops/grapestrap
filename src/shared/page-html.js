/**
 * GrapeStrap — Page HTML compose / extract (shared between main + renderer)
 *
 * Pages on disk are FULL HTML documents — `<!doctype html><html><head>…</head>
 * <body>…</body></html>` — so each page file is standalone, transferable to
 * any server, and viewable in any text editor as a real web page.
 *
 * In memory + in the canvas iframe, only the body content is editable (the
 * GrapesJS convention). The head is managed via the manifest's `page.head`
 * fields (title, description, favicon, customMeta, customLinks, customScripts)
 * and via project-wide framework injection (Bootstrap + Bootstrap Icons + FA).
 *
 * Compose: body + head metadata → full HTML for disk + Code-view display.
 * Extract: full HTML → { body, head } for canvas + manifest.
 *
 * A project may VENDOR ITS OWN framework instead of GrapeStrap's bundled one
 * (the Graphite starter ships its own Bootstrap + Font Awesome + webfonts).
 * Such a project carries `manifest.framework = { css: [...], js: [...] }`, and
 * that list is emitted in place of the bundled set — see resolveFrameworkAssets.
 * Every emitted tag stays marked `data-grpstr-fw` either way, so extraction is
 * identical for both kinds of project.
 *
 * This module is plain JS — no Node-only or browser-only APIs at module
 * scope — so it imports cleanly from main/, renderer/, and tests.
 */

// Framework links emitted into every page's head. Default to the un-minified
// versions: matches Dreamweaver, gives a real browser-devtools experience
// (readable rules, source maps work, F12 → "scroll to" lands at a sensible
// line). Both un-min + min ship in site/assets/ so a production deploy can
// swap to .min by editing these hrefs (or via a future export-minify
// preference). These paths match the project's own site/assets/ tree
// (copied in at project creation by project-manager.js#copyFrameworkAssets)
// so the same paths work in canvas preview AND on a deployed server.
export const FRAMEWORK_LINKS = [
  { rel: 'stylesheet', href: 'assets/css/bootstrap.css',       gstrap: 'bs'  },
  { rel: 'stylesheet', href: 'assets/css/bootstrap-icons.css', gstrap: 'bsi' },
  { rel: 'stylesheet', href: 'assets/css/all.css',             gstrap: 'fa'  }
]
export const FRAMEWORK_SCRIPTS = [
  { src: 'assets/js/bootstrap.bundle.js', defer: true, gstrap: 'bsjs' }
]
export const PROJECT_STYLESHEET = { rel: 'stylesheet', href: 'assets/css/style.css', gstrap: 'project-css' }

// project-manager.js#createProject seeds the manifest with the pre-alpha.2
// root-level stylesheet pointer and only rewrites it to the real in-assets
// path AFTER the project's pages have been composed; legacy manifests on disk
// can carry the same pointer persistently. It never names a file createProject
// actually writes, so composing it verbatim would emit a dead link — it
// resolves to PROJECT_STYLESHEET.href instead, which is what every build
// before vendored frameworks emitted unconditionally.
const LEGACY_ROOT_STYLESHEET = 'style.css'

/**
 * Pick the framework <link>/<script> set for a project.
 *
 * A `manifest.framework` of any shape means the project vendors its own
 * framework, so the bundled set is suppressed entirely — a project that
 * declares an empty list gets no framework tags at all, which is a legitimate
 * authoring choice, not a fallback to the bundle.
 *
 * @param {object} manifest - Project manifest (may be a partial stub)
 * @returns {{css: Array<{rel: string, href: string, marker: string}>,
 *            js: Array<{src: string, defer: boolean, marker: string}>}}
 *          Tag descriptors in emit order, each carrying its data-grpstr-fw value
 */
function resolveFrameworkAssets(manifest) {
  const vendored = manifest && typeof manifest.framework === 'object' && manifest.framework !== null
    ? manifest.framework
    : null

  if (!vendored) {
    return {
      css: FRAMEWORK_LINKS.map(link => ({ rel: link.rel, href: link.href, marker: link.gstrap })),
      js:  FRAMEWORK_SCRIPTS.map(script => ({ src: script.src, defer: script.defer, marker: script.gstrap }))
    }
  }

  // Indexed markers keep each vendored tag recognisable to the extractor,
  // which strips on the presence of data-grpstr-fw and ignores its value.
  const cssList = Array.isArray(vendored.css) ? vendored.css : []
  const jsList  = Array.isArray(vendored.js)  ? vendored.js  : []
  return {
    css: cssList.filter(isNonEmptyString).map((href, index) => ({ rel: 'stylesheet', href, marker: `fwx-${index}` })),
    js:  jsList.filter(isNonEmptyString).map((src, index)  => ({ src, defer: true, marker: `fwjs-${index}` }))
  }
}

/**
 * Resolve the href for the project's own stylesheet link.
 * @param {object} manifest - Project manifest (may be a partial stub)
 * @returns {string} Site-relative stylesheet path
 */
function projectStylesheetHref(manifest) {
  const declared = typeof manifest?.globalCSS === 'string' ? manifest.globalCSS.trim() : ''
  if (!declared || declared === LEGACY_ROOT_STYLESHEET) return PROJECT_STYLESHEET.href
  return declared
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Wrap a body-only page fragment + manifest head into a full HTML document.
 * Output is deterministic so the round-trip parser can recognise the
 * GrapeStrap-managed sections via the `data-grpstr-*` markers.
 */
export function composeFullPageHtml(bodyHtml, page = {}, manifest = {}) {
  const head = page.head || {}
  const meta = manifest.metadata || {}
  const favicon = head.favicon || meta.favicon || ''
  const customMeta    = Array.isArray(head.customMeta)    ? head.customMeta    : []
  const customLinks   = Array.isArray(head.customLinks)   ? head.customLinks   : []
  const customScripts = Array.isArray(head.customScripts) ? head.customScripts : []

  const faviconLink = favicon
    ? `<link rel="icon" href="${escapeHtml(favicon)}"${faviconType(favicon)} data-grpstr-favicon>`
    : ''
  const metaTags = customMeta
    .filter(m => m && m.name && m.content)
    .map(m => `<meta name="${escapeHtml(m.name)}" content="${escapeHtml(m.content)}" data-grpstr-meta>`)
    .join('\n  ')
  const customLinkTags = customLinks
    .filter(l => l && l.href)
    .map(l => `<link${l.rel ? ` rel="${escapeHtml(l.rel)}"` : ''} href="${escapeHtml(l.href)}"${l.type ? ` type="${escapeHtml(l.type)}"` : ''} data-grpstr-link>`)
    .join('\n  ')
  const customScriptTags = customScripts
    .filter(s => s && s.src)
    .map(s => `<script src="${escapeHtml(s.src)}"${s.defer ? ' defer' : ''}${s.async ? ' async' : ''} data-grpstr-script></script>`)
    .join('\n  ')

  const framework = resolveFrameworkAssets(manifest)
  const fwLinks = framework.css
    .map(l => `<link rel="${l.rel}" href="${escapeHtml(l.href)}" data-grpstr-fw="${l.marker}">`)
    .join('\n  ')
  const fwScripts = framework.js
    .map(s => `<script src="${escapeHtml(s.src)}"${s.defer ? ' defer' : ''} data-grpstr-fw="${s.marker}"></script>`)
    .join('\n  ')
  const projCss = `<link rel="${PROJECT_STYLESHEET.rel}" href="${escapeHtml(projectStylesheetHref(manifest))}" data-grpstr-fw="${PROJECT_STYLESHEET.gstrap}">`

  const headLines = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(head.title || page.name || meta.name || 'Untitled')}</title>`,
    head.description ? `<meta name="description" content="${escapeHtml(head.description)}" data-grpstr-description>` : '',
    metaTags,
    faviconLink,
    fwLinks,
    projCss,
    customLinkTags
  ].filter(Boolean).join('\n  ')

  // Either half can be empty — a project vendoring a CSS-only framework emits
  // no framework scripts at all, and joining blindly would leave a stray blank
  // line before the user's own scripts.
  const bodyEnd = [fwScripts, customScriptTags].filter(Boolean).join('\n  ')

  return `<!doctype html>
<html lang="en">
<head>
  ${headLines}
</head>
<body>
${bodyHtml || ''}
  ${bodyEnd}
</body>
</html>
`
}

/**
 * Parse a full HTML page back into its body + head fields.
 *
 * Forgiving: if the input is body-only HTML (e.g. a pre-alpha.7 page file
 * that hasn't been re-saved yet), returns the input as the body and an
 * empty head. The framework + project-managed tags marked with
 * `data-grpstr-fw=…` are stripped from the head extraction (they're
 * regenerated on every compose), so they don't leak into customLinks.
 */
export function extractPageFromFullHtml(fullHtml) {
  const html = String(fullHtml ?? '')
  const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body\s*>/i.exec(html)
  if (!bodyMatch) {
    // No <body> tag → body-only fragment. Strip a stray wrapper anyway —
    // fragments captured by pre-fix builds can carry one.
    return { body: stripBodyWrapper(html), head: emptyHead() }
  }
  // Trim trailing framework scripts injected by composeFullPageHtml, then
  // heal nested wrappers: pre-fix builds captured GrapesJS's `<body>`-wrapped
  // serialization into the fragment, and compose wrapped it AGAIN — every
  // saved page carried `<body><body>`. Loading is the healing moment.
  const rawBody = bodyMatch[1]
  const body = stripBodyWrapper(stripGstrapBodyTrailers(rawBody))

  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(html)
  const headInner = headMatch ? headMatch[1] : ''
  return { body: body.trim() + '\n', head: parseHead(headInner) }
}

/**
 * Unwrap top-level `<body …>…</body>` shells from a fragment, repeatedly.
 *
 * GrapesJS's editor.getHtml() wraps its serialization in a `<body>` tag, but
 * every GrapeStrap fragment (page/template/library html in memory, on disk,
 * and in the Code view) is body-INNER by contract — composeFullPageHtml adds
 * the real tag at write time. Applied at the canvas capture boundary
 * (grapesjs-init getCanvasHtml, canvas-sync) and at load (above + template/
 * library reads) so legacy nested-body files self-heal. Anchored: a body tag
 * that isn't the outermost shell (user content) is never touched.
 */
export function stripBodyWrapper(html) {
  const original = String(html ?? '')
  let out = original
  let unwrapped = false
  for (;;) {
    const m = /^\s*<body\b[^>]*>([\s\S]*)<\/body\s*>\s*$/i.exec(out)
    if (!m) break
    out = m[1]
    unwrapped = true
  }
  // Byte-identical pass-through when there was nothing to unwrap — callers
  // (template/library load) compare fragments verbatim.
  return unwrapped ? out.trim() : original
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyHead() {
  return {
    title: '',
    description: '',
    favicon: '',
    customMeta: [],
    customLinks: [],
    customScripts: []
  }
}

function stripGstrapBodyTrailers(bodyHtml) {
  // Walk back from end, removing GrapeStrap-managed framework <script> /
  // user customScript tags (data-grpstr-*) plus surrounding whitespace.
  let s = bodyHtml
  // Remove trailing managed script tags (any order).
  s = s.replace(/\s*<script\b[^>]*\sdata-grpstr-(?:fw|script)\b[^>]*>[\s\S]*?<\/script\s*>\s*$/gi, '')
  // Repeatedly strip — multiple managed scripts may be concatenated.
  let prev = ''
  while (prev !== s) {
    prev = s
    s = s.replace(/\s*<script\b[^>]*\sdata-grpstr-(?:fw|script)\b[^>]*>[\s\S]*?<\/script\s*>\s*$/gi, '')
  }
  return s
}

function parseHead(headInner) {
  const out = emptyHead()

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(headInner)
  if (titleMatch) out.title = decodeHtml(titleMatch[1].trim())

  // Description meta — preserved if marked as ours, but also detected by
  // name="description" if the user typed it directly.
  const descMatch =
    /<meta[^>]*\sname=["']description["'][^>]*\scontent=["']([^"']*)["'][^>]*>/i.exec(headInner) ||
    /<meta[^>]*\scontent=["']([^"']*)["'][^>]*\sname=["']description["'][^>]*>/i.exec(headInner)
  if (descMatch) out.description = decodeHtml(descMatch[1])

  // Favicon
  const faviconMatch =
    /<link[^>]*\srel=["'](?:icon|shortcut icon)["'][^>]*\shref=["']([^"']*)["'][^>]*>/i.exec(headInner) ||
    /<link[^>]*\shref=["']([^"']*)["'][^>]*\srel=["'](?:icon|shortcut icon)["'][^>]*>/i.exec(headInner)
  if (faviconMatch) out.favicon = decodeHtml(faviconMatch[1])

  // Custom meta tags — anything name=… content=… that isn't description and
  // isn't `viewport` / `charset`. We mark our own with data-grpstr-meta when
  // we emit, so we can also use that to round-trip cleanly.
  const metaRe = /<meta\b([^>]*)>/gi
  let m
  while ((m = metaRe.exec(headInner))) {
    const attrs = parseAttrs(m[1])
    if (!attrs.name || !attrs.content) continue
    if (attrs.name === 'description') continue
    if (attrs.name === 'viewport') continue
    out.customMeta.push({ name: attrs.name, content: attrs.content })
  }

  // Custom links — anything that isn't framework (data-grpstr-fw) or favicon.
  const linkRe = /<link\b([^>]*)>/gi
  while ((m = linkRe.exec(headInner))) {
    const attrs = parseAttrs(m[1])
    if (!attrs.href) continue
    if (attrs['data-grpstr-fw']) continue       // framework — regenerated
    if ((attrs.rel || '').toLowerCase() === 'icon') continue
    if ((attrs.rel || '').toLowerCase() === 'shortcut icon') continue
    out.customLinks.push({
      rel: attrs.rel || '',
      href: attrs.href,
      type: attrs.type || ''
    })
  }

  // Custom scripts in head — framework <script> we emit at end-of-body, so
  // anything in head with src is user-supplied unless data-grpstr-fw.
  const scriptRe = /<script\b([^>]*?)(?:\s*\/\s*>|>[\s\S]*?<\/script\s*>)/gi
  while ((m = scriptRe.exec(headInner))) {
    const attrs = parseAttrs(m[1])
    if (!attrs.src) continue
    if (attrs['data-grpstr-fw']) continue
    out.customScripts.push({
      src: attrs.src,
      defer: 'defer' in attrs,
      async: 'async' in attrs
    })
  }

  return out
}

function parseAttrs(attrString) {
  const out = {}
  // name="value" | name='value' | name=value | bare attribute
  const re = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  let m
  while ((m = re.exec(attrString))) {
    const k = m[1].toLowerCase()
    const v = m[2] ?? m[3] ?? m[4] ?? ''
    out[k] = decodeHtml(v)
  }
  return out
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

function decodeHtml(s) {
  return String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function faviconType(path) {
  const ext = (path.split('.').pop() || '').toLowerCase()
  if (ext === 'png')  return ' type="image/png"'
  if (ext === 'svg')  return ' type="image/svg+xml"'
  if (ext === 'ico')  return ' type="image/x-icon"'
  if (ext === 'webp') return ' type="image/webp"'
  return ''
}

/**
 * Detect whether a string looks like a full HTML document (vs. a body-only
 * fragment). Used during loadProject to decide between body-only legacy
 * pages and alpha.7+ full-doc pages.
 */
export function isFullHtmlDocument(html) {
  return /<\s*html\b/i.test(html) || /<!doctype\s+html/i.test(html)
}
