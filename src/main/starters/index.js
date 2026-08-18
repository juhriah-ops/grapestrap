// =============================================================
// PATH: src/main/starters/index.js
// ROLE: Starter-template registry + applier. listStarters() feeds the New
//       Project dialog (IPC project:starters); getStarter(id) + applyStarter()
//       are consumed by project-manager.js createProject when a non-blank
//       templateId arrives through project:new. getStarterPage(id, name)
//       feeds a single page's editable content to a per-page selection UI
//       (IPC project:starter-page) without shipping every page's HTML in the
//       dialog's initial starter list. 'blank' is NOT in the registry — it
//       is the absence of a starter (dialog prepends it, the same way the
//       New Page dialog prepends "None").
//
//       Two flavours of starter live here. Landing/portfolio/blog are pure
//       text: HTML strings plus a couple of node_modules vendor files pulled
//       in by name (vendorDeps). Graphite and Orbit additionally carry a
//       BINARY ASSET BUNDLE on disk at <appRoot>/starters/<bundleDir>/ —
//       vendored Bootstrap + Font Awesome + webfonts + photos — copied
//       wholesale into the new project, and declare the manifest overrides
//       that go with it (globalCSS → their own theme.css, framework → their
//       own CSS/JS set). A starter carrying `framework` owns the project's
//       framework outright: project-manager skips copyFrameworkAssets for it
//       on both create and load, and the page composer emits the vendored
//       links instead.
// DEPENDS: node:fs, node:path, electron (app.getAppPath for vendor + bundle
//          sources), ../../shared/page-html.js (composeFullPageHtml),
//          ../copy-tasks.js (copyFilesIdempotent — shared with
//          copyFrameworkAssets — and copyDirIdempotent),
//          ./landing.js, ./portfolio.js, ./blog.js, ./graphite.js, ./orbit.js
// CREATED: 2026-07-12 (Wave 4)
// UPDATED: 2026-08-11 — listStarters() now includes per-page metadata
//                       (name/title/description, no HTML); new
//                       getStarterPage() for the per-page selection UI;
//                       applyStarter() accepts optional selectedPages to
//                       narrow which pages get written (templates/assets/
//                       vendorDeps/bundle stay unconditional)
// UPDATED: 2026-08-17 — Orbit starter registered (second bundled starter,
//                       same shape as Graphite: bundleDir + globalCSS +
//                       framework overrides)
// =============================================================

import { promises as fsp } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { app } from 'electron'
import { composeFullPageHtml } from '../../shared/page-html.js'
import { copyFilesIdempotent, copyDirIdempotent } from '../copy-tasks.js'
import { landing } from './landing.js'
import { portfolio } from './portfolio.js'
import { blog } from './blog.js'
// Graphite and Orbit are default exports (the others are named) — both are
// generated pure-data rather than hand-authored alongside this registry.
import graphite from './graphite.js'
import orbit from './orbit.js'

// Registration order = dialog display order (after the prepended Blank).
const STARTERS = [landing, portfolio, blog, graphite, orbit]
const BY_ID = new Map(STARTERS.map(s => [s.id, s]))

// In-project destinations mirror copyFrameworkAssets' un-min-first policy:
// pages link the readable file; .min ships alongside for a deploy-time swap.
// Sources resolve through app.getAppPath() → bundled node_modules, the exact
// mechanism copyFrameworkAssets already proves in packaged builds.
const VENDOR_FILES = {
  glightbox: [
    // [src relative to node_modules, dst relative to site/, fatal?]
    ['glightbox/dist/css/glightbox.css',     'assets/vendor/glightbox/glightbox.css',     true],
    ['glightbox/dist/css/glightbox.min.css', 'assets/vendor/glightbox/glightbox.min.css', false],
    ['glightbox/dist/js/glightbox.js',       'assets/vendor/glightbox/glightbox.js',      true],
    ['glightbox/dist/js/glightbox.min.js',   'assets/vendor/glightbox/glightbox.min.js',  false]
  ]
}

/**
 * Dialog-facing list — ids, labels, and per-page metadata (name/title/
 * description) for a per-page selection UI. Deliberately excludes page
 * bodies/customLinks/customScripts — those are fetched one at a time via
 * getStarterPage() only for pages the user is actually looking at, so the
 * New Project dialog's initial payload stays small (no HTML over IPC).
 */
export function listStarters() {
  return STARTERS.map(s => ({
    id: s.id,
    label: s.label,
    pages: (s.pages || []).map(p => ({
      name: p.name,
      title: p.title || p.name,
      description: p.description || ''
    }))
  }))
}

/** Full definition, or null for 'blank' / unknown ids (caller fails open). */
export function getStarter(id) {
  if (typeof id !== 'string') return null
  return BY_ID.get(id) || null
}

/**
 * A single starter page's editable content — the per-page counterpart to
 * listStarters()'s metadata-only entries. Used by the New Project dialog's
 * per-page selection UI to preview/describe one page on demand instead of
 * shipping every starter page's HTML up front.
 *
 * Returns COPIES of the customLinks/customScripts arrays (via spread), never
 * the STARTERS registry's own array references — the registry is shared
 * module state read by every project:new / project:starter-page call, and a
 * caller mutating what it got back must never leak into another caller's
 * copy or into a later applyStarter() run.
 *
 * @param {string} starterId - A STARTERS id (e.g. 'graphite')
 * @param {string} pageName  - A page's `name` within that starter
 * @returns {{name: string, title: string, description: string,
 *            customLinks: object[], customScripts: object[], body: string}|null}
 *          null for an unknown starter id, an unknown page name, or 'blank'
 *          (not a registry entry — same fail-open contract as getStarter).
 */
export function getStarterPage(starterId, pageName) {
  const starter = getStarter(starterId)
  if (!starter) return null
  const page = (starter.pages || []).find(p => p.name === pageName)
  if (!page) return null
  return {
    name: page.name,
    title: page.title || page.name,
    description: page.description || '',
    customLinks: Array.isArray(page.customLinks) ? [...page.customLinks] : [],
    customScripts: Array.isArray(page.customScripts) ? [...page.customScripts] : [],
    body: page.body || ''
  }
}

/**
 * Copy a starter's vendor dependencies into site/assets/vendor/<dep>/.
 * Idempotent (skip-if-exists) via the shared copy helper. Unknown dep names
 * are an authoring error — throw with the known list so a bad starter
 * definition dies loudly in the spec run, not silently in the field.
 */
export async function copyVendorAssets(siteRoot, deps = []) {
  const appRoot = app.getAppPath()
  const tasks = []
  for (const dep of deps) {
    const files = VENDOR_FILES[dep]
    if (!files) {
      throw new Error(
        `Unknown vendor dependency "${dep}" — known: ${Object.keys(VENDOR_FILES).join(', ')}`
      )
    }
    for (const [src, dst, fatal] of files) {
      tasks.push([resolve(appRoot, 'node_modules', src), join(siteRoot, dst), fatal])
    }
  }
  const fatal = await copyFilesIdempotent(tasks)
  if (fatal.length) {
    throw new Error(
      `Could not copy vendor assets — ${fatal.join('; ')}. ` +
      `Run \`npm install\` in the GrapeStrap project root.`
    )
  }
}

/**
 * Write a starter's templates, pages, text assets, and (if it has one) its
 * binary asset bundle into site/, and append the matching manifest entries.
 * Mutates `manifest` (pages, templates, vendorDeps, metadata.starter, and for
 * bundled starters globalCSS + framework); the caller (createProject) owns
 * writing the manifest file afterwards. Page bodies are authored fully
 * composed (chrome + region content inline — W2's composed-page model), so no
 * region composition happens here and main never parses HTML.
 *
 * @param {object}   args
 * @param {string}   args.site    - Absolute path to the project's site/ dir
 * @param {object}   args.starter - A STARTERS entry (see getStarter)
 * @param {object}   args.manifest - Manifest under construction; mutated in place
 * @param {string[]} [args.selectedPages] - Page `name`s to write. Filters ONLY
 *        the pages loop below — templates, text assets, vendorDeps, and (for
 *        bundled starters) the bundleDir copy are ALWAYS written in full,
 *        because they're shared infrastructure, not per-page content: a
 *        template's chrome and a starter's vendored framework/CSS/JS serve
 *        every page, including ones the user excluded now and adds later via
 *        New Page, so partially installing them would leave the project in a
 *        half-configured state for no disk-space benefit. Fails OPEN to "all
 *        pages" when omitted, empty, or not an array (same posture as
 *        getStarter's unknown-id handling) — a stale dialog build or a
 *        typo'd IPC payload must never silently produce a page-less project.
 *        Excluded pages' bodies may still contain `href`s to a sibling
 *        page's file (e.g. Graphite's nav links to left-sidebar.html) —
 *        those are left exactly as authored. Main never parses HTML (see
 *        this file's header), so there's no seam here to rewrite or strip
 *        them; they simply 404 until that page is added back, at which point
 *        the link resolves again on its own.
 * @throws {Error} If a declared vendor dep is unknown, or a declared bundleDir
 *                 is missing from the app (a packaging error, not a user one).
 */
export async function applyStarter({ site, starter, manifest, selectedPages }) {
  // Framework/stylesheet overrides are applied FIRST: composeFullPageHtml
  // reads them off the manifest when it emits each page's <head>, and the
  // pages loop below runs the composer. Setting them afterwards would write
  // every starter page to disk pointing at the app's default Bootstrap +
  // style.css instead of the bundle's own vendored set.
  if (starter.globalCSS) manifest.globalCSS = starter.globalCSS
  if (starter.framework) {
    manifest.framework = {
      css: [...(starter.framework.css || [])],
      js:  [...(starter.framework.js  || [])]
    }
  }

  // Masters → site/templates/<name>.gstrap-tpl (body-only fragments).
  for (const tpl of starter.templates || []) {
    const file = `templates/${tpl.name}.gstrap-tpl`
    await writeInSite(site, file, tpl.html)
    manifest.templates.push({ name: tpl.name, file, regions: tpl.regions || [] })
  }

  // Pages → manifest entry first (composeFullPageHtml reads page.head), then
  // the full-HTML document on disk. regions{} starts empty and self-heals at
  // the first renderer-side save/propagation (main never parses HTML).
  //
  // selectedPages narrows this loop ONLY — see the fail-open + shared-assets
  // rationale in the function's doc block above.
  const wantAll = !Array.isArray(selectedPages) || selectedPages.length === 0
  const pagesToWrite = wantAll
    ? (starter.pages || [])
    : (starter.pages || []).filter(p => selectedPages.includes(p.name))

  for (const p of pagesToWrite) {
    const entry = {
      name: p.name,
      file: `pages/${p.name}.html`,
      templateName: p.templateName || null,
      regions: {},
      head: {
        title: p.title || p.name,
        description: p.description || '',
        customMeta: [],
        customLinks: Array.isArray(p.customLinks) ? p.customLinks : [],
        customScripts: Array.isArray(p.customScripts) ? p.customScripts : []
      }
    }
    manifest.pages.push(entry)
    await writeInSite(site, entry.file, composeFullPageHtml(p.body || '', entry, manifest))
  }

  // Text assets (placeholder SVGs, site.js) — starter-authored strings.
  for (const [rel, content] of Object.entries(starter.assets || {})) {
    await writeInSite(site, rel, content)
  }

  // Vendor deps (glightbox for Portfolio) + provenance.
  await copyVendorAssets(site, starter.vendorDeps || [])
  manifest.vendorDeps = [...(starter.vendorDeps || [])]
  manifest.metadata.starter = starter.id

  // Asset bundle (Graphite): copy <appRoot>/starters/<bundleDir>/ over site/.
  // app.getAppPath() is the same resolution copyVendorAssets uses for
  // node_modules — correct in dev AND inside app.asar, which is why the copy
  // walks readdir/copyFile rather than fsp.cp.
  if (starter.bundleDir) {
    const bundleRoot = join(app.getAppPath(), 'starters', starter.bundleDir)
    // A missing bundle means the app was packaged without starters/** — the
    // project would be created with pages linking CSS/JS that 404. Fail loudly
    // here rather than hand the user a broken project.
    try { await fsp.access(bundleRoot) }
    catch {
      throw new Error(
        `Starter "${starter.id}" declares bundleDir "${starter.bundleDir}" but ` +
        `${bundleRoot} is missing. Check that "starters/**/*" is included in ` +
        `the packaged build files.`
      )
    }
    // Per-file failures are non-fatal: the pages, templates, and manifest are
    // already written, so a partial bundle still opens — log what's missing
    // instead of throwing the whole project away.
    const failures = await copyDirIdempotent(bundleRoot, site)
    if (failures.length) {
      console.warn(
        `[grapestrap] starter "${starter.id}" bundle: ${failures.length} file(s) not copied — ` +
        failures.join('; ')
      )
    }
  }
}

async function writeInSite(site, rel, content) {
  const target = join(site, rel)
  await fsp.mkdir(dirname(target), { recursive: true })
  await fsp.writeFile(target, content, 'utf8')
}
