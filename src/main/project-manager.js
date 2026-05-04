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
  await fsp.mkdir(projectDir, { recursive: true })
  await fsp.mkdir(join(projectDir, 'pages'), { recursive: true })
  await fsp.mkdir(join(projectDir, 'assets', 'images'), { recursive: true })
  await fsp.mkdir(join(projectDir, 'assets', 'fonts'),  { recursive: true })
  await fsp.mkdir(join(projectDir, 'assets', 'videos'), { recursive: true })

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
        await fsp.writeFile(join(projectDir, targetFile), body, 'utf8')
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

      // assets/* tree → preserve structure.
      if (srcRel.startsWith('assets/') || srcRel === 'assets') {
        const dst = join(projectDir, entryRel)
        await fsp.mkdir(dirname(dst), { recursive: true })
        await fsp.copyFile(srcEntry, dst)
        continue
      }

      // Top-level loose images / fonts / videos → assets/<kind>/<name> so
      // the Asset Manager surfaces them automatically.
      const kind = guessAssetKind(ext)
      if (kind) {
        const dst = join(projectDir, 'assets', kind, entry.name)
        await fsp.copyFile(srcEntry, dst)
        continue
      }

      // Anything else at top level (txt, json, etc.) — copy as-is so user's
      // existing .htaccess / favicon.ico / robots.txt survive.
      if (!srcRel) {
        await fsp.copyFile(srcEntry, join(projectDir, entry.name))
      }
    }
  }
  await walk('')

  if (pages.length === 0) {
    // Empty project gets a blank index so the canvas isn't a void.
    const idx = renderBlankIndex(name)
    await fsp.writeFile(join(projectDir, 'pages', 'index.html'), idx, 'utf8')
    pages.push({
      name: 'index', file: 'pages/index.html', templateName: null, regions: {},
      head: { title: name, description: '', customMeta: [], customLinks: [], customScripts: [] }
    })
  }

  if (!globalCSSContent) globalCSSContent = '/* Project-global custom CSS */\n'
  await fsp.writeFile(join(projectDir, 'style.css'), globalCSSContent, 'utf8')

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
  // <meta name=description> from head, returns body innerHTML if a body tag
  // exists; else the whole html as-is (treat as already-fragmented).
  const out = { body: html, title: '', description: '' }
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (titleMatch) out.title = titleMatch[1].trim()
  const descMatch = /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(html)
  if (descMatch) out.description = descMatch[1]
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)
  if (bodyMatch) out.body = bodyMatch[1].trim() + '\n'
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
  await fsp.mkdir(projectDir, { recursive: true })
  await fsp.mkdir(join(projectDir, 'pages'), { recursive: true })
  await fsp.mkdir(join(projectDir, 'assets', 'images'), { recursive: true })
  await fsp.mkdir(join(projectDir, 'assets', 'fonts'), { recursive: true })
  await fsp.mkdir(join(projectDir, 'assets', 'videos'), { recursive: true })

  const indexHtml = renderBlankIndex(name)
  await fsp.writeFile(join(projectDir, 'pages', 'index.html'), indexHtml, 'utf8')
  await fsp.writeFile(join(projectDir, 'style.css'), '/* Project-global custom CSS */\n', 'utf8')

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
  const pages = await Promise.all(
    manifest.pages.map(async page => {
      const html = await fsp.readFile(join(projectDir, page.file), 'utf8')
      return { ...page, html }
    })
  )
  const templates = await Promise.all(
    (manifest.templates || []).map(async tpl => {
      const html = await fsp.readFile(join(projectDir, tpl.file), 'utf8')
      return { ...tpl, html }
    })
  )
  const libraryItems = await Promise.all(
    (manifest.libraryItems || []).map(async item => {
      const html = await fsp.readFile(join(projectDir, item.file), 'utf8')
      return { ...item, html }
    })
  )
  let globalCSS = ''
  if (manifest.globalCSS) {
    try { globalCSS = await fsp.readFile(join(projectDir, manifest.globalCSS), 'utf8') }
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
  const now = new Date().toISOString()

  // Write each page's html to its sibling file
  for (const page of pages) {
    const file = page.file || `pages/${page.name}.html`
    await writeAtomic(join(projectDir, file), page.html ?? '')
  }
  for (const tpl of templates) {
    const file = tpl.file || `templates/${tpl.name}.html`
    await writeAtomic(join(projectDir, file), tpl.html ?? '')
  }
  for (const item of libraryItems) {
    const file = item.file || `library/${item.id}.html`
    await writeAtomic(join(projectDir, file), item.html ?? '')
  }
  if (manifest.globalCSS && globalCSS !== undefined) {
    await writeAtomic(join(projectDir, manifest.globalCSS), globalCSS)
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

  // Bundle Bootstrap if enabled
  if (project.manifest.preferences?.exportBundleBootstrap !== false) {
    const bsCss = resolve(app.getAppPath(), 'node_modules/bootstrap/dist/css/bootstrap.min.css')
    const bsJs  = resolve(app.getAppPath(), 'node_modules/bootstrap/dist/js/bootstrap.bundle.min.js')
    try { await fsp.copyFile(bsCss, join(outputDir, 'css', 'bootstrap.min.css')) } catch {}
    try { await fsp.copyFile(bsJs,  join(outputDir, 'js',  'bootstrap.bundle.min.js')) } catch {}
  }

  // Copy custom CSS
  if (project.globalCSS) {
    await fsp.writeFile(join(outputDir, 'css', 'style.css'), project.globalCSS, 'utf8')
  }

  // Copy project assets folder
  try {
    await fsp.cp(join(project.projectDir, 'assets'), join(outputDir, 'assets'), { recursive: true })
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
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(head.title || page.name)}</title>
  ${head.description ? `<meta name="description" content="${escapeHtml(head.description)}">` : ''}
  <link rel="stylesheet" href="css/bootstrap.min.css">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
${page.html || ''}
  <script src="js/bootstrap.bundle.min.js"></script>
</body>
</html>
`
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
