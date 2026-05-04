/**
 * GrapeStrap — Project manager
 *
 * .gstrap manifest + sibling pages/templates/library files on disk. This layer:
 *   - Creates new projects from a starter template
 *   - Loads an existing project (manifest + all referenced files)
 *   - Saves a project (atomic-ish: write to .tmp, rename)
 *   - Exports a flat HTML/CSS/assets folder
 *
 * Recovery: writes .gstrap.recovery alongside the project file every 30s while
 * dirty (renderer-driven via IPC). On launch, the renderer asks if a recovery file
 * is newer than the manifest's lastSavedAt and offers to load it.
 *
 * Manifest schema is in v4 plan §16. Pages and library items are stored as
 * separate files for git-friendliness, NOT inlined into the manifest.
 */

import { promises as fsp } from 'node:fs'
import { dirname, join, basename, extname, resolve } from 'node:path'
import { app } from 'electron'

const MANIFEST_VERSION = '1.0'
const FORMAT_TAG = 'grapestrap-project'

// Project layout:
//   <projectDir>/<name>.gstrap     ← manifest, sits at the root of the project folder
//   <projectDir>/site/             ← deployable web content
//     ├─ pages/<name>.html
//     ├─ assets/{images,fonts,videos}/
//     ├─ library/<id>.html
//     ├─ templates/<name>.html
//     └─ style.css
//
// Manifest paths (page.file, libraryItem.file, manifest.globalCSS) are
// stored relative-to-`site/`. We resolve them through siteDir() so the
// disk layout can change without touching every manifest in the wild.
const SITE_SUBDIR = 'site'
function siteDir(projectDir) {
  return join(projectDir, SITE_SUBDIR)
}

/**
 * Import an existing static-site directory as a new GrapeStrap project.
 *
 * Copies the source tree into a new project directory (the parent of
 * targetPath) and generates a `.gstrap` manifest. We deliberately don't edit
 * the source — copying first avoids a footgun where the user opens their
 * deployed site, hits Save, and discovers GrapeStrap re-wrote every HTML to
 * body-only form (until full-document round-trip lands in v0.0.3).
 *
 * Discovery rules:
 *   - HTML files at the top level OR under `pages/` become pages. Names
 *     come from the file basename (sans extension).
 *   - `assets/` subtree (images / fonts / videos / anything) is preserved
 *     verbatim. Top-level loose images are also moved into
 *     `assets/images/<name>` so the Asset Manager picks them up.
 *   - A top-level `style.css` becomes the project's globalCSS.
 *   - Hidden dotfiles, node_modules, .git, .gstrap, recovery files are
 *     skipped.
 *
 * Body extraction: if an imported HTML is a full document (has
 * `<html>`/`<head>`/`<body>`), we extract the body's inner HTML for the
 * page's stored html. The page's `head` metadata captures title +
 * description so a v0.0.3 export round-trip can re-wrap. Lossy by design
 * for v0.0.2.
 */
export async function importDirectory({ sourceDir, targetPath, name }) {
  const projectDir = dirname(targetPath)
  const site = siteDir(projectDir)
  await fsp.mkdir(site, { recursive: true })
  await fsp.mkdir(join(site, 'pages'), { recursive: true })
  await fsp.mkdir(join(site, 'assets', 'images'), { recursive: true })
  await fsp.mkdir(join(site, 'assets', 'fonts'),  { recursive: true })
  await fsp.mkdir(join(site, 'assets', 'videos'), { recursive: true })

  const pages = []
  let globalCSSContent = ''

  const SKIP_DIRS = new Set(['.git', '.gstrap', '.svn', 'node_modules', '__MACOSX'])

  // Walk the source directory tree, copying assets and collecting HTML.
  async function walk(srcRel) {
    const srcAbs = join(sourceDir, srcRel)
    const entries = await fsp.readdir(srcAbs, { withFileTypes: true })
    for (const entry of entries) {
      const entryRel = srcRel ? `${srcRel}/${entry.name}` : entry.name
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue

      const srcEntry = join(sourceDir, entryRel)
      if (entry.isDirectory()) {
        // Recurse — copy assets/* mirroring source structure.
        await walk(entryRel)
        continue
      }
      if (!entry.isFile()) continue

      const ext = extname(entry.name).toLowerCase()
      // HTML at top level → pages/. HTML in pages/ → pages/. HTML elsewhere
      // (e.g. templates/) → preserved as a page with its own filename to
      // avoid collisions, prefixed by parent dir.
      if (ext === '.html' || ext === '.htm') {
        const baseName = basename(entry.name, ext)
        const isTopLevel = !srcRel
        const isInPages  = srcRel === 'pages'
        let pageName = baseName
        if (!isTopLevel && !isInPages) pageName = `${srcRel.replace(/\//g, '-')}-${baseName}`
        // Avoid collisions if multiple files map to the same name.
        let unique = pageName
        let n = 1
        while (pages.find(p => p.name === unique)) unique = `${pageName}-${++n}`

        const raw = await fsp.readFile(srcEntry, 'utf8')
        const { body, title, description } = extractBody(raw)
        const targetFile = `pages/${unique}.html`
        await fsp.writeFile(join(site, targetFile), body, 'utf8')
        pages.push({
          name: unique,
          file: targetFile,
          templateName: null,
          regions: {},
          head: { title: title || unique, description: description || '', customMeta: [], customLinks: [], customScripts: [] }
        })
        continue
      }

      // style.css at top level → project globalCSS.
      if (!srcRel && entry.name.toLowerCase() === 'style.css') {
        globalCSSContent = await fsp.readFile(srcEntry, 'utf8')
        continue
      }

      // assets/* tree → preserve structure (under <projectDir>/site/assets/).
      if (srcRel.startsWith('assets/') || srcRel === 'assets') {
        const dst = join(site, entryRel)
        await fsp.mkdir(dirname(dst), { recursive: true })
        await fsp.copyFile(srcEntry, dst)
        continue
      }

      // Top-level loose images / fonts / videos → site/assets/<kind>/<name> so
      // the Asset Manager surfaces them automatically.
      const kind = guessAssetKind(ext)
      if (kind) {
        const dst = join(site, 'assets', kind, entry.name)
        await fsp.copyFile(srcEntry, dst)
        continue
      }

      // Anything else at top level (txt, json, etc.) — copy into site/ so
      // the user's existing .htaccess / favicon.ico / robots.txt survive
      // and ship with the deployable web content.
      if (!srcRel) {
        await fsp.copyFile(srcEntry, join(site, entry.name))
        continue
      }

      // Files in arbitrary subdirs (css/, js/, fonts-extra/, vendor/, etc.)
      // — preserve verbatim under site/<srcRel>/<name>. Without this branch
      // the importer was silently dropping every non-assets/, non-pages/
      // subfolder, which broke users whose static-site layout used the
      // conventional css/ and js/ split. Reported on nola1 2026-05-04.
      const dst = join(site, entryRel)
      await fsp.mkdir(dirname(dst), { recursive: true })
      await fsp.copyFile(srcEntry, dst)
    }
  }
  await walk('')

  if (pages.length === 0) {
    // Empty project gets a blank index so the canvas isn't a void.
    const idx = renderBlankIndex(name)
    await fsp.writeFile(join(site, 'pages', 'index.html'), idx, 'utf8')
    pages.push({
      name: 'index', file: 'pages/index.html', templateName: null, regions: {},
      head: { title: name, description: '', customMeta: [], customLinks: [], customScripts: [] }
    })
  }

  if (!globalCSSContent) globalCSSContent = '/* Project-global custom CSS */\n'
  await fsp.writeFile(join(site, 'style.css'), globalCSSContent, 'utf8')

  const now = new Date().toISOString()
  const manifest = {
    version: MANIFEST_VERSION,
    format: FORMAT_TAG,
    metadata: {
      name,
      created: now,
      modified: now,
      lastSavedAt: now,
      appVersion: app.getVersion(),
      importedFrom: sourceDir
    },
    pages,
    templates: [],
    libraryItems: [],
    snippets: [],
    globalCSS: 'style.css',
    palette: [],
    assets: [],
    vendorDeps: [],
    plugins: [],
    preferences: {
      exportMinify: false,
      exportBundleBootstrap: true,
      exportIncludeComments: false
    }
  }
  await fsp.writeFile(targetPath, JSON.stringify(manifest, null, 2), 'utf8')
  return { manifest, projectPath: targetPath }
}

function extractBody(html) {
  // Cheap regex extraction — no DOM in main process. Captures <title> and
  // <meta name=description> from head, returns body innerHTML if a body
  // tag exists; else the whole html as-is (treat as already-fragmented).
  //
  // CSS/JS preservation: stylesheet <link>s and <script src>s from <head>
  // are HOISTED INTO THE BODY content as its first children. Browsers
  // accept these in body and still apply them, so the imported page
  // renders with the user's CSS/JS in the canvas preview without us
  // needing per-page head injection. Inline <style> blocks and <script>
  // bodies in head are also preserved this way. This is lossy for true
  // head-only metadata (favicon, OG tags, etc.) — full <head> round-trip
  // arrives in v0.0.3 alongside Page Properties.
  const out = { body: html, title: '', description: '' }
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (titleMatch) out.title = titleMatch[1].trim()
  const descMatch = /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(html)
  if (descMatch) out.description = descMatch[1]
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)
  if (!bodyMatch) return out

  // Pull the resource-loading head tags so the imported page still renders
  // its CSS / JS in the canvas. Order matches source-document order.
  const headMatch = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)
  let preserved = ''
  if (headMatch) {
    const headInner = headMatch[1]
    const tagPattern =
      /<link\b[^>]*\brel\s*=\s*["']?(?:stylesheet|preload|modulepreload)["']?[^>]*>/gi
    const scriptPattern  = /<script\b[^>]*>[\s\S]*?<\/script>/gi
    const styleBlock     = /<style\b[^>]*>[\s\S]*?<\/style>/gi
    const matches = []
    for (const re of [tagPattern, scriptPattern, styleBlock]) {
      let m
      while ((m = re.exec(headInner)) !== null) matches.push({ idx: m.index, html: m[0] })
    }
    matches.sort((a, b) => a.idx - b.idx)
    if (matches.length) preserved = matches.map(m => m.html).join('\n') + '\n'
  }

  out.body = (preserved + bodyMatch[1].trim() + '\n').replace(/^\s+/, '')
  return out
}

function guessAssetKind(ext) {
  const e = ext.replace(/^\./, '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'ico'].includes(e)) return 'images'
  if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(e))                       return 'fonts'
  if (['mp4', 'webm', 'mov', 'm4v', 'ogg'].includes(e))                         return 'videos'
  return null
}

export async function createProject({ targetPath, name, templateId = 'blank' }) {
  const projectDir = dirname(targetPath)
  const site = siteDir(projectDir)
  await fsp.mkdir(projectDir, { recursive: true })
  await fsp.mkdir(join(site, 'pages'), { recursive: true })
  await fsp.mkdir(join(site, 'assets', 'images'), { recursive: true })
  await fsp.mkdir(join(site, 'assets', 'fonts'), { recursive: true })
  await fsp.mkdir(join(site, 'assets', 'videos'), { recursive: true })

  const indexHtml = renderBlankIndex(name)
  await fsp.writeFile(join(site, 'pages', 'index.html'), indexHtml, 'utf8')
  await fsp.writeFile(join(site, 'style.css'), '/* Project-global custom CSS */\n', 'utf8')

  const now = new Date().toISOString()
  const manifest = {
    version: MANIFEST_VERSION,
    format: FORMAT_TAG,
    metadata: {
      name,
      created: now,
      modified: now,
      lastSavedAt: now,
      appVersion: app.getVersion()
    },
    pages: [
      {
        name: 'index',
        file: 'pages/index.html',
        templateName: null,
        regions: {},
        head: { title: name, description: '', customMeta: [], customLinks: [], customScripts: [] }
      }
    ],
    templates: [],
    libraryItems: [],
    snippets: [],
    globalCSS: 'style.css',
    palette: [],
    assets: [],
    vendorDeps: [],
    plugins: [],
    preferences: {
      exportMinify: false,
      exportBundleBootstrap: true,
      exportIncludeComments: false
    }
  }

  await fsp.writeFile(targetPath, JSON.stringify(manifest, null, 2), 'utf8')
  return { manifest, projectPath: targetPath }
}

export async function loadProject(manifestPath) {
  const raw = await fsp.readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(raw)
  if (manifest.format !== FORMAT_TAG) {
    throw new Error(`Not a GrapeStrap project (format=${manifest.format})`)
  }
  if (manifest.version !== MANIFEST_VERSION) {
    // v0.x is forward-strict; refuse unknown manifest versions cleanly.
    throw new Error(`Unsupported project version: ${manifest.version} (expected ${MANIFEST_VERSION})`)
  }

  const projectDir = dirname(manifestPath)
  const site = siteDir(projectDir)

  // Old-layout detection: if there's no site/ subdir but there IS a sibling
  // pages/ next to the manifest, this is a pre-v0.0.2-alpha.2 project.
  // Refuse cleanly with a path the user can act on instead of failing
  // mid-readFile with a confusing ENOENT.
  try { await fsp.access(site) }
  catch {
    try {
      await fsp.access(join(projectDir, 'pages'))
      throw new Error(
        `Old project layout detected (pages/ at project root). ` +
        `As of v0.0.2-alpha.2 web content lives in <project>/site/. ` +
        `Recreate the project or move pages/ + assets/ + style.css into a site/ subdirectory.`
      )
    } catch (probe) {
      if (/Old project layout/.test(probe.message)) throw probe
      // Neither site/ nor pages/ — likely a fresh manifest pointing at
      // missing files. Let the per-page readFile below produce its own
      // ENOENT.
    }
  }

  const pages = await Promise.all(
    manifest.pages.map(async page => {
      const html = await fsp.readFile(join(site, page.file), 'utf8')
      return { ...page, html }
    })
  )
  const templates = await Promise.all(
    (manifest.templates || []).map(async tpl => {
      const html = await fsp.readFile(join(site, tpl.file), 'utf8')
      return { ...tpl, html }
    })
  )
  const libraryItems = await Promise.all(
    (manifest.libraryItems || []).map(async item => {
      const html = await fsp.readFile(join(site, item.file), 'utf8')
      return { ...item, html }
    })
  )
  let globalCSS = ''
  if (manifest.globalCSS) {
    try { globalCSS = await fsp.readFile(join(site, manifest.globalCSS), 'utf8') }
    catch { /* missing style.css is OK */ }
  }

  return {
    manifestPath,
    projectDir,
    manifest,
    pages,
    templates,
    libraryItems,
    snippets: manifest.snippets || [],
    globalCSS
  }
}

/**
 * Save a project. Caller passes the full project object as returned by loadProject
 * but with possibly-modified pages / templates / libraryItems / globalCSS / manifest.
 */
export async function saveProject(project) {
  const { manifestPath, projectDir, manifest, pages, templates = [], libraryItems = [], snippets = [], globalCSS } = project
  const site = siteDir(projectDir)
  const now = new Date().toISOString()

  // Write each page's html to its file inside site/. Manifest paths stay
  // relative-to-site; the site/ prefix is a property of the disk layout.
  for (const page of pages) {
    const file = page.file || `pages/${page.name}.html`
    await writeAtomic(join(site, file), page.html ?? '')
  }
  for (const tpl of templates) {
    const file = tpl.file || `templates/${tpl.name}.html`
    await writeAtomic(join(site, file), tpl.html ?? '')
  }
  for (const item of libraryItems) {
    const file = item.file || `library/${item.id}.html`
    await writeAtomic(join(site, file), item.html ?? '')
  }
  if (manifest.globalCSS && globalCSS !== undefined) {
    await writeAtomic(join(site, manifest.globalCSS), globalCSS)
  }

  // Strip per-page html from manifest before writing. Snippets are inline in
  // the manifest (no per-snippet file) — they're typically tiny and the
  // file-per-item dance isn't worth the disk noise for v0.0.2.
  const cleanManifest = {
    ...manifest,
    metadata: { ...manifest.metadata, modified: now, lastSavedAt: now },
    pages:        pages.map(({ html, ...p }) => ({ ...p, file: p.file || `pages/${p.name}.html` })),
    templates:    templates.map(({ html, ...t }) => ({ ...t, file: t.file || `templates/${t.name}.html` })),
    libraryItems: libraryItems.map(({ html, ...l }) => ({ ...l, file: l.file || `library/${l.id}.html` })),
    snippets:     snippets
  }

  await writeAtomic(manifestPath, JSON.stringify(cleanManifest, null, 2))

  // Clear any recovery file — we just saved successfully
  try { await fsp.rm(manifestPath + '.recovery', { force: true }) } catch {}

  return { manifest: cleanManifest, lastSavedAt: now }
}

async function writeAtomic(target, contents) {
  await fsp.mkdir(dirname(target), { recursive: true })
  const tmp = target + '.tmp'
  await fsp.writeFile(tmp, contents, 'utf8')
  await fsp.rename(tmp, target)
}

/**
 * Write recovery snapshot. Lightweight — full project state in one file.
 * Cleared on next successful save. Not the source of truth, just a crash net.
 */
export async function writeRecovery(manifestPath, snapshot) {
  await fsp.writeFile(manifestPath + '.recovery', JSON.stringify(snapshot), 'utf8')
}

export async function readRecovery(manifestPath) {
  try {
    const raw = await fsp.readFile(manifestPath + '.recovery', 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Export the project to a flat folder. v0.0.1 minimal: one HTML per page, the
 * project style.css, bundled Bootstrap, and used assets. Master templates and
 * library items resolve at this stage (v0.0.2+ — for v0.0.1 we assume no templates).
 */
export async function exportProject(project, outputDir) {
  await fsp.mkdir(outputDir, { recursive: true })
  await fsp.mkdir(join(outputDir, 'css'), { recursive: true })
  await fsp.mkdir(join(outputDir, 'js'),  { recursive: true })
  await fsp.mkdir(join(outputDir, 'assets'), { recursive: true })

  // Bundle Bootstrap if enabled. Ship BOTH the readable and minified
  // versions plus source maps — Dreamweaver does the same, and end users
  // who want to read / debug the framework expect the un-minified file
  // alongside. The wrapper HTML links to the un-minified by default
  // (better browser-devtools experience); swap to .min for production by
  // editing the <link>/<script> srcs or by exporting again with a
  // future minified-link preference.
  //
  // Errors propagate (used to be silently swallowed): when
  // node_modules/bootstrap/dist/ isn't reachable from app.getAppPath()
  // (packaged builds, fresh clones that skipped npm install), the export
  // throws a clear path-of-action error instead of producing empty
  // css/ + js/ dirs.
  if (project.manifest.preferences?.exportBundleBootstrap !== false) {
    const bsRoot = resolve(app.getAppPath(), 'node_modules/bootstrap/dist')
    const failures = []
    const bsCssFiles = [
      'bootstrap.css', 'bootstrap.css.map',
      'bootstrap.min.css', 'bootstrap.min.css.map'
    ]
    const bsJsFiles = [
      'bootstrap.bundle.js', 'bootstrap.bundle.js.map',
      'bootstrap.bundle.min.js', 'bootstrap.bundle.min.js.map'
    ]
    for (const f of bsCssFiles) {
      try { await fsp.copyFile(join(bsRoot, 'css', f), join(outputDir, 'css', f)) }
      catch (err) { failures.push(`${f}: ${err?.code || err?.message || err}`) }
    }
    for (const f of bsJsFiles) {
      try { await fsp.copyFile(join(bsRoot, 'js', f), join(outputDir, 'js', f)) }
      catch (err) { failures.push(`${f}: ${err?.code || err?.message || err}`) }
    }
    // Source map failures are tolerable — they're a developer convenience.
    // The CSS/JS files themselves are not.
    const fatal = failures.filter(f => !/\.map:/.test(f))
    if (fatal.length) {
      throw new Error(
        `Could not bundle Bootstrap into the export — ${fatal.join('; ')}. ` +
        `Tried to read from ${bsRoot}. ` +
        `Run \`npm install\` in the GrapeStrap project root, or disable bundling in the project's preferences.exportBundleBootstrap.`
      )
    }
  }

  // Copy custom CSS
  if (project.globalCSS) {
    await fsp.writeFile(join(outputDir, 'css', 'style.css'), project.globalCSS, 'utf8')
  }

  // Copy project assets folder (sourced from site/assets/)
  try {
    await fsp.cp(join(siteDir(project.projectDir), 'assets'), join(outputDir, 'assets'), { recursive: true })
  } catch {}

  // Render each page (v0.0.1: pages standalone; v0.0.2+ resolves templates/library)
  for (const page of project.pages) {
    const html = wrapPageHtml(page, project.manifest)
    const filename = `${page.name}.html`
    await fsp.writeFile(join(outputDir, filename), html, 'utf8')
  }

  return { outputDir, pageCount: project.pages.length }
}

function wrapPageHtml(page, manifest) {
  const head = page.head || {}
  const meta = manifest.metadata || {}
  // Favicon precedence: per-page override > project-wide default. Path is
  // relative to the project's site/ root, so it ships at the same location
  // it sits on disk (export flat-mirrors site/, with css/ and js/ added at
  // the root for the bundled Bootstrap).
  const favicon = head.favicon || meta.favicon || ''
  const customMeta    = Array.isArray(head.customMeta)    ? head.customMeta    : []
  const customLinks   = Array.isArray(head.customLinks)   ? head.customLinks   : []
  const customScripts = Array.isArray(head.customScripts) ? head.customScripts : []

  const faviconLink = favicon
    ? `<link rel="icon" href="${escapeHtml(favicon)}"${faviconType(favicon)}>`
    : ''
  const metaTags = customMeta
    .filter(m => m && m.name && m.content)
    .map(m => `<meta name="${escapeHtml(m.name)}" content="${escapeHtml(m.content)}">`)
    .join('\n  ')
  const linkTags = customLinks
    .filter(l => l && l.href)
    .map(l => `<link${l.rel ? ` rel="${escapeHtml(l.rel)}"` : ''} href="${escapeHtml(l.href)}"${l.type ? ` type="${escapeHtml(l.type)}"` : ''}>`)
    .join('\n  ')
  const scriptTags = customScripts
    .filter(s => s && s.src)
    .map(s => `<script src="${escapeHtml(s.src)}"${s.defer ? ' defer' : ''}${s.async ? ' async' : ''}></script>`)
    .join('\n  ')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(head.title || page.name)}</title>
  ${head.description ? `<meta name="description" content="${escapeHtml(head.description)}">` : ''}
  ${metaTags ? metaTags : ''}
  ${faviconLink}
  <link rel="stylesheet" href="css/bootstrap.css">
  <link rel="stylesheet" href="css/style.css">
  ${linkTags}
</head>
<body>
${page.html || ''}
  <script src="js/bootstrap.bundle.js"></script>
  ${scriptTags}
</body>
</html>
`
}

function faviconType(path) {
  const ext = (path.split('.').pop() || '').toLowerCase()
  if (ext === 'png')  return ' type="image/png"'
  if (ext === 'svg')  return ' type="image/svg+xml"'
  if (ext === 'ico')  return ' type="image/x-icon"'
  if (ext === 'webp') return ' type="image/webp"'
  return ''
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

function renderBlankIndex(name) {
  return `<main class="container py-5">
  <h1 class="display-5 fw-bold">${escapeHtml(name)}</h1>
  <p class="lead">Welcome to your new GrapeStrap project. Drop a block from the Insert panel to get started.</p>
</main>
`
}
