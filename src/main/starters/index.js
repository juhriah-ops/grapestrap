// =============================================================
// PATH: src/main/starters/index.js
// ROLE: Starter-template registry + applier. listStarters() feeds the New
//       Project dialog (IPC project:starters); getStarter(id) + applyStarter()
//       are consumed by project-manager.js createProject when a non-blank
//       templateId arrives through project:new. 'blank' is NOT in the
//       registry — it is the absence of a starter (dialog prepends it, the
//       same way the New Page dialog prepends "None").
// DEPENDS: node:fs, node:path, electron (app.getAppPath for vendor sources),
//          ../../shared/page-html.js (composeFullPageHtml),
//          ../copy-tasks.js (copyFilesIdempotent — shared with
//          copyFrameworkAssets), ./landing.js, ./portfolio.js, ./blog.js
// CREATED: 2026-07-12 (Wave 4)
// =============================================================

import { promises as fsp } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { app } from 'electron'
import { composeFullPageHtml } from '../../shared/page-html.js'
import { copyFilesIdempotent } from '../copy-tasks.js'
import { landing } from './landing.js'
import { portfolio } from './portfolio.js'
import { blog } from './blog.js'

// Registration order = dialog display order (after the prepended Blank).
const STARTERS = [landing, portfolio, blog]
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

/** Dialog-facing list — ids + labels only, no HTML payloads over IPC. */
export function listStarters() {
  return STARTERS.map(s => ({ id: s.id, label: s.label }))
}

/** Full definition, or null for 'blank' / unknown ids (caller fails open). */
export function getStarter(id) {
  if (typeof id !== 'string') return null
  return BY_ID.get(id) || null
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
 * Write a starter's templates, pages, and text assets into site/ and append
 * the matching manifest entries. Mutates `manifest` (pages, templates,
 * vendorDeps, metadata.starter); the caller (createProject) owns writing the
 * manifest file afterwards. Page bodies are authored fully composed
 * (chrome + region content inline — W2's composed-page model), so no region
 * composition happens here and main never parses HTML.
 */
export async function applyStarter({ site, starter, manifest }) {
  // Masters → site/templates/<name>.gstrap-tpl (body-only fragments).
  for (const tpl of starter.templates || []) {
    const file = `templates/${tpl.name}.gstrap-tpl`
    await writeInSite(site, file, tpl.html)
    manifest.templates.push({ name: tpl.name, file, regions: tpl.regions || [] })
  }

  // Pages → manifest entry first (composeFullPageHtml reads page.head), then
  // the full-HTML document on disk. regions{} starts empty and self-heals at
  // the first renderer-side save/propagation (main never parses HTML).
  for (const p of starter.pages || []) {
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
}

async function writeInSite(site, rel, content) {
  const target = join(site, rel)
  await fsp.mkdir(dirname(target), { recursive: true })
  await fsp.writeFile(target, content, 'utf8')
}
