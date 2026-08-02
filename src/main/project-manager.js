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
 *
 * Two schema fields govern which CSS/JS a project is built on:
 *   - `globalCSS` (always present, site-relative): the project's own
 *     stylesheet. Normally 'assets/css/style.css', but a project created from
 *     a bundled starter points it at that starter's stylesheet instead
 *     (Graphite → 'assets/css/theme.css'). Save, load, and export all resolve
 *     it from the manifest — never assume style.css.
 *   - `framework` (OPTIONAL, additive, 2026-08-02): `{ css: [], js: [] }` of
 *     site-relative paths. Its presence means the project VENDORS ITS OWN
 *     framework inside site/assets/vendor/, so grapestrap must not copy or
 *     backfill its bundled Bootstrap/BSI/FA into the project (see
 *     copyFrameworkAssets' two call sites), and composeFullPageHtml emits
 *     these paths in place of the built-in set. Absent = legacy behaviour,
 *     the app's own framework bundle — every project made before this field
 *     existed, plus every blank project, reads that way.
 */

import { promises as fsp } from 'node:fs'
import { dirname, join, basename, extname, resolve, relative, sep } from 'node:path'
import { app } from 'electron'
import { composeFullPageHtml, extractPageFromFullHtml, isFullHtmlDocument } from '../shared/page-html.js'
import { migrateLegacyAssetUrls } from '../shared/css-urls.js'
import { copyFilesIdempotent } from './copy-tasks.js'
import { getStarter, applyStarter } from './starters/index.js'

const MANIFEST_VERSION = '1.0'
const FORMAT_TAG = 'grapestrap-project'

// Project layout:
//   <projectDir>/<name>.gstrap     ← manifest, sits at the root of the project folder
//   <projectDir>/site/             ← deployable web content
//     ├─ pages/<name>.html
//     ├─ assets/{images,fonts,videos}/     ← user media
//     ├─ assets/{css,js,webfonts}/         ← frameworks + css/style.css (globalCSS)
//     ├─ assets/vendor/                    ← a bundled starter's own framework
//     │                                      (manifest.framework; replaces the above)
//     ├─ library/<id>.html
//     └─ templates/<name>.gstrap-tpl
//
// Manifest paths (page.file, libraryItem.file, manifest.globalCSS) are
// stored relative-to-`site/`. We resolve them through siteDir() so the
// disk layout can change without touching every manifest in the wild.
const SITE_SUBDIR = 'site'
function siteDir(projectDir) {
  return join(projectDir, SITE_SUBDIR)
}

/**
 * Copy Bootstrap, Bootstrap Icons, and Font Awesome into the project's site/
 * tree so the project is self-contained: previewable in the canvas via
 * `<base href>` + relative links, AND deployable to a server with the same
 * relative paths working unchanged. Idempotent — re-running on an existing
 * project skips files that are already present.
 *
 * Layout:
 *   site/assets/
 *     css/
 *       bootstrap.css           (un-min, devtools-friendly)
 *       bootstrap.css.map
 *       bootstrap.min.css
 *       bootstrap.min.css.map
 *       bootstrap-icons.min.css
 *       all.min.css             (Font Awesome — bundles solid/regular/brands)
 *       fonts/                  ← bootstrap-icons.css resolves here for its woff2
 *         bootstrap-icons.woff
 *         bootstrap-icons.woff2
 *     js/
 *       bootstrap.bundle.js     (+ .map + .min.js + .map)
 *     webfonts/                 ← fontawesome all.min.css resolves ../webfonts/
 *       fa-brands-400.woff2
 *       fa-regular-400.woff2
 *       fa-solid-900.woff2
 *       fa-v4compatibility.woff2
 */
async function copyFrameworkAssets(siteRoot) {
  const appRoot = app.getAppPath()
  const bsRoot   = resolve(appRoot, 'node_modules/bootstrap/dist')
  const bsiRoot  = resolve(appRoot, 'node_modules/bootstrap-icons/font')
  const faRoot   = resolve(appRoot, 'node_modules/@fortawesome/fontawesome-free')

  const cssDir       = join(siteRoot, 'assets', 'css')
  const cssFontsDir  = join(cssDir, 'fonts')
  const jsDir        = join(siteRoot, 'assets', 'js')
  const webfontsDir  = join(siteRoot, 'assets', 'webfonts')
  await fsp.mkdir(cssDir,      { recursive: true })
  await fsp.mkdir(cssFontsDir, { recursive: true })
  await fsp.mkdir(jsDir,       { recursive: true })
  await fsp.mkdir(webfontsDir, { recursive: true })

  // Files: [src absolute, dst absolute, fatal-if-missing?]
  const tasks = [
    // Bootstrap CSS — un-min + min + maps. Source maps are optional.
    [join(bsRoot, 'css', 'bootstrap.css'),         join(cssDir, 'bootstrap.css'),         true],
    [join(bsRoot, 'css', 'bootstrap.css.map'),     join(cssDir, 'bootstrap.css.map'),     false],
    [join(bsRoot, 'css', 'bootstrap.min.css'),     join(cssDir, 'bootstrap.min.css'),     true],
    [join(bsRoot, 'css', 'bootstrap.min.css.map'), join(cssDir, 'bootstrap.min.css.map'), false],
    // Bootstrap JS bundle — same un-min + min + maps.
    [join(bsRoot, 'js',  'bootstrap.bundle.js'),         join(jsDir, 'bootstrap.bundle.js'),         true],
    [join(bsRoot, 'js',  'bootstrap.bundle.js.map'),     join(jsDir, 'bootstrap.bundle.js.map'),     false],
    [join(bsRoot, 'js',  'bootstrap.bundle.min.js'),     join(jsDir, 'bootstrap.bundle.min.js'),     true],
    [join(bsRoot, 'js',  'bootstrap.bundle.min.js.map'), join(jsDir, 'bootstrap.bundle.min.js.map'), false],
    // Bootstrap Icons — both un-min + min CSS, plus the woff/woff2 the CSS
    // sources via `fonts/`. Default page wrapper links the un-min (better
    // devtools experience); deploy-time minify can swap to .min.
    [join(bsiRoot, 'bootstrap-icons.css'),         join(cssDir,      'bootstrap-icons.css'),     true],
    [join(bsiRoot, 'bootstrap-icons.min.css'),     join(cssDir,      'bootstrap-icons.min.css'), true],
    [join(bsiRoot, 'fonts', 'bootstrap-icons.woff2'), join(cssFontsDir, 'bootstrap-icons.woff2'), true],
    [join(bsiRoot, 'fonts', 'bootstrap-icons.woff'),  join(cssFontsDir, 'bootstrap-icons.woff'),  false],
    // Font Awesome — both un-min + min `all.css` bundles + 4 webfonts.
    [join(faRoot, 'css', 'all.css'),                           join(cssDir,      'all.css'),     true],
    [join(faRoot, 'css', 'all.min.css'),                       join(cssDir,      'all.min.css'), true],
    [join(faRoot, 'webfonts', 'fa-solid-900.woff2'),           join(webfontsDir, 'fa-solid-900.woff2'),     true],
    [join(faRoot, 'webfonts', 'fa-regular-400.woff2'),         join(webfontsDir, 'fa-regular-400.woff2'),   true],
    [join(faRoot, 'webfonts', 'fa-brands-400.woff2'),          join(webfontsDir, 'fa-brands-400.woff2'),    true],
    [join(faRoot, 'webfonts', 'fa-v4compatibility.woff2'),     join(webfontsDir, 'fa-v4compatibility.woff2'), false]
  ]

  // Copy loop extracted to copy-tasks.js (Wave 4) — shared with the starter
  // vendor-asset copier. Same skip-if-exists idempotency, same fatal collection.
  const fatal = await copyFilesIdempotent(tasks)
  if (fatal.length) {
    throw new Error(
      `Could not copy bundled framework assets — ${fatal.join('; ')}. ` +
      `Run \`npm install\` in the GrapeStrap project root.`
    )
  }
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
  // Bootstrap + BSI + FA copied AFTER the source-walk so that any same-named
  // assets the user is importing take precedence (e.g. their own customised
  // bootstrap.css). copyFrameworkAssets is idempotent — it skips files that
  // already exist.

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
        const importedPage = {
          name: unique,
          file: targetFile,
          templateName: null,
          regions: {},
          head: { title: title || unique, description: description || '', customMeta: [], customLinks: [], customScripts: [] }
        }
        // Write as full HTML so each imported page lands on disk as a real
        // standalone document with framework links in its head.
        await fsp.writeFile(
          join(site, targetFile),
          composeFullPageHtml(body, importedPage, { metadata: { name } }),
          'utf8'
        )
        pages.push(importedPage)
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

  // Bundle BS + BSI + FA into the imported project's site/assets/ AFTER the
  // source walk: any same-named asset the user is importing wins (the user
  // may have hand-customised their own bootstrap.css). Idempotent.
  await copyFrameworkAssets(site)

  if (pages.length === 0) {
    // Empty project gets a blank index so the canvas isn't a void.
    const idx = renderBlankIndex(name)
    pages.push({
      name: 'index', file: 'pages/index.html', templateName: null, regions: {},
      head: { title: name, description: '', customMeta: [], customLinks: [], customScripts: [] }
    })
    await fsp.writeFile(
      join(site, 'pages', 'index.html'),
      composeFullPageHtml(idx, pages[0], { metadata: { name } }),
      'utf8'
    )
  }

  if (!globalCSSContent) globalCSSContent = '/* Project-global custom CSS */\n'
  await fsp.mkdir(join(site, 'assets', 'css'), { recursive: true })
  await fsp.writeFile(join(site, 'assets', 'css', 'style.css'), globalCSSContent, 'utf8')

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
    globalCSS: 'assets/css/style.css',
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

  // Wave 4: resolve the starter. Unknown/omitted ids fail OPEN to a blank
  // project — a stale dialog or a typo'd IPC call must never block creation.
  // Resolved BEFORE any asset copying because a starter that vendors its own
  // framework/stylesheet suppresses both defaults below.
  const starter = getStarter(templateId)
  if (templateId !== 'blank' && !starter) {
    console.warn(`[grapestrap] unknown starter template "${templateId}" — creating a blank project`)
  }

  // Copy Bootstrap + Bootstrap Icons + Font Awesome into the project's own
  // assets/. The canvas iframe loads them via project-relative paths
  // (`assets/css/bootstrap.min.css`) resolved through `<base href>`, so the
  // exact same paths work when the project is rsync'd to a server. No
  // dependency on the renderer's bundled copy.
  //
  // Skipped for starters that declare their own `framework`: their bundle
  // ships a complete vendored CSS/JS set (site/assets/vendor/**) and the pages
  // link that, so the app's copy would be a second, unreferenced framework on
  // disk — dead weight in every export.
  if (!starter?.framework) await copyFrameworkAssets(site)

  // Project's own custom stylesheet — referenced via assets/css/style.css from
  // the wrapped page so the same path works in canvas + on a server. A starter
  // with its own `globalCSS` (Graphite's bundled theme.css) supplies that file
  // itself; writing the placeholder too would leave a stylesheet nothing links.
  // The mkdir is unconditional — assets/css exists either way.
  await fsp.mkdir(join(site, 'assets', 'css'), { recursive: true })
  if (!starter?.globalCSS) {
    await fsp.writeFile(join(site, 'assets', 'css', 'style.css'), '/* Project-global custom CSS */\n', 'utf8')
  }

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
    pages: [],
    templates: [],
    libraryItems: [],
    snippets: [],
    // Default project stylesheet. applyStarter overrides it for starters that
    // bring their own theme; composeFullPageHtml reads it when writing pages
    // below, so it must already hold the final in-assets path here.
    globalCSS: 'assets/css/style.css',
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

  if (starter) {
    // Writes site/templates/*.gstrap-tpl, site/pages/*.html (full HTML via
    // composeFullPageHtml), text assets, vendor deps; appends the matching
    // manifest entries and stamps metadata.starter.
    await applyStarter({ site, starter, manifest })
  } else {
    const indexHtml = renderBlankIndex(name)
    manifest.pages.push({
      name: 'index',
      file: 'pages/index.html',
      templateName: null,
      regions: {},
      head: { title: name, description: '', customMeta: [], customLinks: [], customScripts: [] }
    })
    // Write the index page as full HTML so the file is a real standalone
    // document with framework links in <head>. The canvas extracts the body
    // for editing; manifest.head provides title/description/etc.
    await fsp.writeFile(
      join(site, 'pages', 'index.html'),
      composeFullPageHtml(indexHtml, manifest.pages[0], manifest),
      'utf8'
    )
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

  // Backfill framework assets on load: projects created before this feature
  // landed don't have `site/assets/css/bootstrap.min.css` etc., and the
  // canvas now loads them via project-relative paths. copyFrameworkAssets
  // is idempotent, so projects created with frameworks already in place
  // get a no-op. Failures here are non-fatal: throwing would block the
  // project from opening at all, which is worse than canvas rendering
  // unstyled until the user hits Refresh / re-creates.
  //
  // Projects that vendor their own framework (manifest.framework — created
  // from a bundled starter) are excluded: they never had the app's Bootstrap
  // and don't want it. Backfilling would inject assets/css/bootstrap.css on
  // every open, unreferenced by any page and shipped in every export.
  if (!manifest.framework) {
    try { await copyFrameworkAssets(site) }
    catch (err) {
      // Surface but don't block: load-time toasts wire through to the
      // renderer via the wrapper that calls loadProject; for now log to
      // stderr so packaged builds report it.
      console.warn('[grapestrap] could not backfill framework assets:', err?.message || err)
    }
  }

  const pages = await Promise.all(
    manifest.pages.map(async page => {
      const raw = await fsp.readFile(join(site, page.file), 'utf8')
      // alpha.7+: pages on disk are full HTML documents. Pull out the body
      // for the canvas + the head fields back into the manifest. Legacy
      // body-only pages pass through unchanged (extract returns the input
      // as body when no <body> tag is found).
      if (isFullHtmlDocument(raw)) {
        const { body, head } = extractPageFromFullHtml(raw)
        const merged = {
          ...(page.head || {}),
          ...head,
          // Preserve manifest-only metadata (favicon, customScripts) when
          // the parsed value is the empty default — extract returns empty
          // strings for missing fields, which we don't want to clobber
          // intentional manifest content.
          title:        head.title       || page.head?.title       || '',
          description:  head.description || page.head?.description || '',
          favicon:      head.favicon     || page.head?.favicon     || '',
          // customScripts are emitted at end-of-body (composeFullPageHtml)
          // and stripped from the extracted body, so the parse always comes
          // back empty — the manifest is their source of truth. Without this
          // the spread above clobbers them with [] on every load (first real
          // producer: the Wave 4 Portfolio starter's glightbox init).
          customScripts: head.customScripts?.length
            ? head.customScripts
            : (page.head?.customScripts || [])
        }
        return { ...page, html: body, head: merged }
      }
      return { ...page, html: raw }
    })
  )
  const templates = await Promise.all(
    (manifest.templates || []).map(async tpl => {
      // Fail OPEN (Wave 2): a missing .gstrap-tpl must not block the whole
      // project — pages hold their own composed content, so only propagation
      // is impossible until the template is re-saved. The renderer toasts a
      // warning off the missingFile flag (renderer/main.js project:opened).
      try {
        const html = await fsp.readFile(join(site, tpl.file), 'utf8')
        return { ...tpl, html }
      } catch (err) {
        console.warn(`[grapestrap] template file unreadable: ${tpl.file} (${err?.code || err?.message})`)
        return { ...tpl, html: '', missingFile: true }
      }
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
    catch {
      // Pre-alpha.7 projects pointed at site/style.css; alpha.7+ keeps it
      // at site/assets/css/style.css. Try the legacy path as a fallback so
      // older projects don't lose their custom CSS.
      const legacyAlt = manifest.globalCSS === 'assets/css/style.css' ? 'style.css' : null
      if (legacyAlt) {
        try { globalCSS = await fsp.readFile(join(site, legacyAlt), 'utf8') }
        catch { /* genuinely missing */ }
      }
    }
  }

  // One-shot url() migration (rc.2 → rc.3, same precedent as the legacy
  // style.css path above): the app used to write site-root-relative
  // `url("assets/images/…")`, which the canvas resolved fine but export
  // broke (the stylesheet ships at assets/css/style.css). Rewrite exactly
  // those app-written shapes to the file-relative convention
  // (`url("../images/…")`) IN MEMORY; the renderer marks the CSS dirty off
  // the flag so the user's next save persists it. Nothing else in the
  // user's CSS is touched, and disk is not written here — load stays
  // read-only.
  let globalCssMigrated = false
  if (globalCSS) {
    const migration = migrateLegacyAssetUrls(globalCSS)
    if (migration.changed) {
      globalCSS = migration.css
      globalCssMigrated = true
    }
  }

  return {
    manifestPath,
    projectDir,
    manifest,
    pages,
    templates,
    libraryItems,
    snippets: manifest.snippets || [],
    globalCSS,
    globalCssMigrated
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

  // Pages are saved as full HTML documents — wrapping the body the canvas
  // is editing with `<head>` populated from the manifest's per-page head
  // fields + the framework links. This makes each file on disk a real
  // standalone page (transferable to any server, viewable in any text
  // editor) and gives the Code view the full picture instead of just the
  // body fragment.
  //
  // Templates + library items stay body-only — they're fragments by design,
  // composed into pages via region replacement (templates) or wrapping div
  // (library items). Wrapping them as full HTML would be misleading.
  for (const page of pages) {
    const file = page.file || `pages/${page.name}.html`
    const fullHtml = composeFullPageHtml(page.html ?? '', page, manifest)
    await writeAtomic(join(site, file), fullHtml)
  }
  for (const tpl of templates) {
    const file = tpl.file || `templates/${tpl.name}.gstrap-tpl`
    await writeAtomic(join(site, file), tpl.html ?? '')
  }
  for (const item of libraryItems) {
    const file = item.file || `library/${item.id}.html`
    await writeAtomic(join(site, file), item.html ?? '')
  }
  if (manifest.globalCSS && globalCSS !== undefined) {
    await fsp.mkdir(dirname(join(site, manifest.globalCSS)), { recursive: true })
    await writeAtomic(join(site, manifest.globalCSS), globalCSS)
  }

  // Strip per-page html from manifest before writing. Snippets are inline in
  // the manifest (no per-snippet file) — they're typically tiny and the
  // file-per-item dance isn't worth the disk noise for v0.0.2.
  const cleanManifest = {
    ...manifest,
    metadata: { ...manifest.metadata, modified: now, lastSavedAt: now },
    pages:        pages.map(({ html, ...p }) => ({ ...p, file: p.file || `pages/${p.name}.html` })),
    // missingFile is runtime state from the fail-open load path — never persist it.
    templates:    templates.map(({ html, missingFile, ...t }) => ({ ...t, file: t.file || `templates/${t.name}.gstrap-tpl` })),
    libraryItems: libraryItems.map(({ html, ...l }) => ({ ...l, file: l.file || `library/${l.id}.html` })),
    snippets:     snippets
  }

  await writeAtomic(manifestPath, JSON.stringify(cleanManifest, null, 2))

  // Clear any recovery file — we just saved successfully
  await clearRecovery(manifestPath)

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
 *
 * Atomic (tmp + rename, Wave 1): the renderer rewrites this file on a timer,
 * and a crash mid-write must not destroy the previous good snapshot — a
 * truncated file here is precisely the moment the net is needed.
 */
export async function writeRecovery(manifestPath, snapshot) {
  await writeAtomic(manifestPath + '.recovery', JSON.stringify(snapshot))
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
 * Delete the recovery snapshot (save succeeded, user discarded, or the
 * project went clean without a save). Missing file is not an error.
 */
export async function clearRecovery(manifestPath) {
  try { await fsp.rm(manifestPath + '.recovery', { force: true }) } catch {}
}

// site/ subdirs that never ship in an export: pages/ is re-rendered flat at
// the output root from the in-memory bodies, templates/ + library/ are
// editor-internal fragments already composed into the pages.
const EXPORT_EXCLUDED_SITE_DIRS = new Set(['pages', 'templates', 'library'])

/**
 * Export the project to a flat folder: one HTML per page at the root, plus
 * the site/ tree verbatim (frameworks, user assets, arbitrary imported
 * subdirs) minus the editor-internal dirs above. Master templates and
 * library items resolve at this stage (v0.0.2+ — for v0.0.1 we assume no templates).
 */
export async function exportProject(project, outputDir) {
  await fsp.mkdir(outputDir, { recursive: true })
  await fsp.mkdir(join(outputDir, 'css'), { recursive: true })
  await fsp.mkdir(join(outputDir, 'js'),  { recursive: true })
  await fsp.mkdir(join(outputDir, 'assets'), { recursive: true })

  // The framework bundle (Bootstrap + Bootstrap Icons + Font Awesome) lives
  // inside the project's own site/assets/ — copied in at project creation /
  // import / load. The fsp.cp(siteSrc → outputDir) below carries it across
  // to the export verbatim, so no separate framework-bundle step here. The
  // pre-alpha.6 path that copied node_modules/bootstrap/dist/* into
  // outputDir/css and outputDir/js is gone; everything funnels through the
  // project-relative site/ tree so canvas preview === server deploy.

  // Copy the WHOLE site/ tree — not just site/assets/ — so imported projects
  // keeping files elsewhere under site/ (css/, js/, images/, …) don't lose
  // them on export. Editor-internal content is excluded: pages/ (re-rendered
  // flat below from the in-memory bodies), templates/ + library/ (fragments,
  // resolved into pages at compose time), and *.tmp (writeAtomic scratch).
  // Missing site/ dir is fine — nothing to copy. Other failures (perms, EIO,
  // disk full) propagate so the user gets a clear error toast instead of
  // shipping a broken site silently.
  const siteSrc = siteDir(project.projectDir)
  if (await fsp.access(siteSrc).then(() => true, () => false)) {
    await fsp.cp(siteSrc, outputDir, {
      recursive: true,
      filter: source => {
        const rel = relative(siteSrc, source)
        if (rel === '') return true
        if (EXPORT_EXCLUDED_SITE_DIRS.has(rel.split(sep)[0])) return false
        return !rel.endsWith('.tmp')
      }
    })
  }

  // Write custom CSS AFTER the site copy so the in-memory buffer (possibly
  // dirty, possibly url-migrated at load) wins over the on-disk copy. Ships
  // byte-identical to what the user authored — url()s are file-relative to
  // this stylesheet (`../images/…`), so no rewriting is needed here, ever.
  //
  // The destination comes from the manifest, not a constant: a project created
  // from a bundled starter points globalCSS at that starter's own stylesheet
  // (Graphite → assets/css/theme.css), and writing to style.css instead would
  // both leak an orphan file and ship the on-disk (stale) theme.
  if (project.globalCSS) {
    const cssRel = project.manifest?.globalCSS || 'assets/css/style.css'
    await fsp.mkdir(dirname(join(outputDir, cssRel)), { recursive: true })
    await fsp.writeFile(join(outputDir, cssRel), project.globalCSS, 'utf8')
  }

  // Render each page as a full HTML document. Same composer the save loop
  // uses, so the canvas-edited body lands wrapped with the project's head
  // metadata + framework links. The resulting file has the exact same
  // contents as `<projectDir>/site/pages/<name>.html` — export at this
  // stage is essentially "copy site/ verbatim, but compose the body that's
  // currently in memory rather than reading from disk" so the user can
  // export from a dirty editor without having to save first.
  for (const page of project.pages) {
    const html = composeFullPageHtml(page.html ?? '', page, project.manifest)
    const filename = `${page.name}.html`
    await fsp.writeFile(join(outputDir, filename), html, 'utf8')
  }

  return { outputDir, pageCount: project.pages.length }
}

// `wrapPageHtml` + `faviconType` were superseded by composeFullPageHtml in
// shared/page-html.js so the save path, export path, and Code-view display
// path all produce byte-identical HTML. Removed alpha.7.

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
