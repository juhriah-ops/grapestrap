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
    globalCSS
  }
}

/**
 * Save a project. Caller passes the full project object as returned by loadProject
 * but with possibly-modified pages / templates / libraryItems / globalCSS / manifest.
 */
export async function saveProject(project) {
  const { manifestPath, projectDir, manifest, pages, templates = [], libraryItems = [], globalCSS } = project
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

  // Strip per-page html from manifest before writing
  const cleanManifest = {
    ...manifest,
    metadata: { ...manifest.metadata, modified: now, lastSavedAt: now },
    pages:        pages.map(({ html, ...p }) => ({ ...p, file: p.file || `pages/${p.name}.html` })),
    templates:    templates.map(({ html, ...t }) => ({ ...t, file: t.file || `templates/${t.name}.html` })),
    libraryItems: libraryItems.map(({ html, ...l }) => ({ ...l, file: l.file || `library/${l.id}.html` }))
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
