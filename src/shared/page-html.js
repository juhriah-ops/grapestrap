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
 * This module is plain JS — no Node-only or browser-only APIs at module
 * scope — so it imports cleanly from main/, renderer/, and tests.
 */

// Framework links emitted into every page's head. These match the project's
// own site/assets/ tree (copied in at project creation by project-manager.js#
// copyFrameworkAssets) so the same paths work in canvas preview AND on a
// deployed server. Don't edit one without the other.
export const FRAMEWORK_LINKS = [
  { rel: 'stylesheet', href: 'assets/css/bootstrap.min.css',       gstrap: 'bs'  },
  { rel: 'stylesheet', href: 'assets/css/bootstrap-icons.min.css', gstrap: 'bsi' },
  { rel: 'stylesheet', href: 'assets/css/all.min.css',             gstrap: 'fa'  }
]
export const FRAMEWORK_SCRIPTS = [
  { src: 'assets/js/bootstrap.bundle.min.js', defer: true, gstrap: 'bsjs' }
]
export const PROJECT_STYLESHEET = { rel: 'stylesheet', href: 'assets/css/style.css', gstrap: 'project-css' }

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

  const fwLinks = FRAMEWORK_LINKS
    .map(l => `<link rel="${l.rel}" href="${l.href}" data-grpstr-fw="${l.gstrap}">`)
    .join('\n  ')
  const fwScripts = FRAMEWORK_SCRIPTS
    .map(s => `<script src="${s.src}"${s.defer ? ' defer' : ''} data-grpstr-fw="${s.gstrap}"></script>`)
    .join('\n  ')
  const projCss = `<link rel="${PROJECT_STYLESHEET.rel}" href="${PROJECT_STYLESHEET.href}" data-grpstr-fw="${PROJECT_STYLESHEET.gstrap}">`

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

  const bodyEnd = customScriptTags
    ? `${fwScripts}\n  ${customScriptTags}`
    : fwScripts

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
    // No <body> tag → body-only fragment. Return as-is with empty head.
    return { body: html, head: emptyHead() }
  }
  // Trim trailing framework scripts injected by composeFullPageHtml.
  const rawBody = bodyMatch[1]
  const body = stripGstrapBodyTrailers(rawBody)

  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(html)
  const headInner = headMatch ? headMatch[1] : ''
  return { body: body.trim() + '\n', head: parseHead(headInner) }
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
