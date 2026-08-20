/**
 * GrapeStrap — E2E: Vista starter
 *
 * PATH: tests/e2e/vista-starter.spec.js
 * ROLE: Vista-starter specs — the third bundled-asset starter after Graphite
 *       and Orbit (vendors its OWN framework bundle at site/assets/vendor/**
 *       instead of GrapeStrap's bundled Bootstrap/BSI/FA). Mirrors
 *       orbit-starter.spec.js's coverage shape via the shared
 *       createBundledStarterProject helper (tests/e2e/helpers.js): disk shapes
 *       on create, manifest overrides (globalCSS/framework/metadata.starter),
 *       composed page wiring, Custom CSS panel round-trip to theme.css, Site
 *       Files main.js round-trip through the javascript file-tab lane,
 *       framework-backfill suppression on reopen, and export.
 *
 *       Two things are Vista's alone. It is the first ONE-PAGE bundled
 *       starter, so the page-count assertions read 1 rather than 5 and the
 *       New Project checklist stays hidden for it (that dialog-side behaviour
 *       is pinned in new-project-checklist.spec.js). And its port deliberately
 *       dropped the source's seven-swatch theme picker — the negative pin for
 *       that is here, since nothing else in the suite would notice it coming
 *       back. The dialog's starter option is covered by
 *       starter-templates.spec.js (list pinned to include 'vista').
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-08-19
 */
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, dismissWelcome, EXPECTED_PLUGIN_COUNT, fileExists, createBundledStarterProject } from './helpers.js'

const createVistaProject = (appWindow, projectPath) =>
  createBundledStarterProject(appWindow, projectPath, { starterId: 'vista' })

test('Vista starter: bundle assets land on disk, app-bundled framework files do not', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-vista-'))
  const projectPath = join(projectDir, 'vista.gstrap')

  const { app, appWindow } = await launch()
  await createVistaProject(appWindow, projectPath)

  const site = join(projectDir, 'site')
  expect(await fileExists(join(site, 'assets', 'css', 'theme.css'))).toBe(true)
  expect(await fileExists(join(site, 'assets', 'js', 'main.js'))).toBe(true)
  expect(await fileExists(join(site, 'assets', 'vendor', 'bootstrap', 'bootstrap.min.css'))).toBe(true)
  expect(await fileExists(join(site, 'assets', 'vendor', 'fonts', 'source-sans-pro.css'))).toBe(true)

  // Vista's images arrive on three levels: the CSS backdrops and the theme's
  // own textures flat in assets/images/, the gallery photos in the fulls/ and
  // thumbs/ subdirectories the source ships. copyDirIdempotent's readdir walk
  // is what has to reach the nested pair.
  expect(await fileExists(join(site, 'assets', 'images', 'hero-backdrop.jpg'))).toBe(true)
  expect(await fileExists(join(site, 'assets', 'images', 'overlay.png'))).toBe(true)
  expect(await fileExists(join(site, 'assets', 'images', 'thumbs', 'gallery-jet-flight.jpg'))).toBe(true)
  expect(await fileExists(join(site, 'assets', 'images', 'fulls', 'gallery-jet-flight.jpg'))).toBe(true)

  // Vista owns the project's framework outright (src/main/starters/index.js
  // applyStarter + project-manager.js createProject skip copyFrameworkAssets
  // for starters carrying `framework`) — the app's own bundled Bootstrap and
  // placeholder style.css must never land alongside the vendored set.
  expect(await fileExists(join(site, 'assets', 'css', 'bootstrap.css'))).toBe(false)
  expect(await fileExists(join(site, 'assets', 'css', 'style.css'))).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Vista starter: manifest overrides — globalCSS, framework counts, metadata.starter, 1 page', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-vista-'))
  const projectPath = join(projectDir, 'vista.gstrap')

  const { app, appWindow } = await launch()
  const { pageNames } = await createVistaProject(appWindow, projectPath)
  expect(pageNames).toEqual(['index'])

  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(manifest.globalCSS).toBe('assets/css/theme.css')
  expect(manifest.framework.css).toHaveLength(5)
  expect(manifest.framework.js).toHaveLength(1)
  expect(manifest.metadata.starter).toBe('vista')
  expect(manifest.pages).toHaveLength(1)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Vista starter: site/pages/index.html links the vendored bootstrap + theme.css + main.js', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-vista-'))
  const projectPath = join(projectDir, 'vista.gstrap')

  const { app, appWindow } = await launch()
  await createVistaProject(appWindow, projectPath)

  const pageOnDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')
  expect(pageOnDisk).toContain('assets/vendor/bootstrap/bootstrap.min.css')
  expect(pageOnDisk).toContain('assets/vendor/fonts/source-sans-pro.css')
  expect(pageOnDisk).not.toContain('assets/css/bootstrap.css')
  expect(pageOnDisk).toContain('href="assets/css/theme.css"')
  expect(pageOnDisk).toContain('src="assets/js/main.js"')
  expect(pageOnDisk).toContain('data-grpstr-script')

  // The port moved the source's root images/ tree under assets/ — a surviving
  // bare images/ reference would 404 in preview and export alike.
  expect(pageOnDisk).toContain('src="assets/images/thumbs/gallery-jet-flight.jpg"')
  expect(pageOnDisk).toContain('href="assets/images/fulls/gallery-jet-flight.jpg"')
  expect(pageOnDisk).not.toContain('"images/')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Vista starter: the demo-only theme picker and gallery-return chrome never ship', async () => {
  // Both were stripped at port time (see src/main/starters/vista.js's header):
  // the seven-swatch palette preview across page/CSS/JS, and the template
  // gallery's "All Templates" link. Nothing else in the suite would notice
  // either creeping back in on a re-port.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-vista-'))
  const projectPath = join(projectDir, 'vista.gstrap')

  const { app, appWindow } = await launch()
  await createVistaProject(appWindow, projectPath)

  const site = join(projectDir, 'site')
  const pageOnDisk = await fsp.readFile(join(site, 'pages', 'index.html'), 'utf8')
  expect(pageOnDisk).not.toContain('theme-picker')
  expect(pageOnDisk).not.toContain('theme-swatch')
  expect(pageOnDisk).not.toContain('gallery-return')

  const theme = await fsp.readFile(join(site, 'assets', 'css', 'theme.css'), 'utf8')
  expect(theme).not.toContain(':root[data-theme')
  expect(theme).not.toContain('.theme-picker')
  expect(theme).toContain('--accent: #98c593;')   // green, the one remaining palette

  const mainJs = await fsp.readFile(join(site, 'assets', 'js', 'main.js'), 'utf8')
  expect(mainJs).not.toContain('vista-theme')     // the localStorage key the picker used
  expect(mainJs).toContain('lightbox-carousel')   // the behaviour that DID come along

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Custom CSS panel: Monaco buffer holds theme.css, edits round-trip to disk on save', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-vista-'))
  const projectPath = join(projectDir, 'vista.gstrap')
  const SENTINEL = '/* vista-css-edit-sentinel */'

  const { app, appWindow } = await launch()
  await createVistaProject(appWindow, projectPath)

  // projectState.set() emits 'project:opened', which the Custom CSS panel's
  // wire-once listener uses to load its buffer from projectState.current.globalCSS
  // (src/renderer/panels/custom-css/index.js) — poll rather than assume sync.
  await appWindow.waitForFunction(
    () => window.__gstrap.getCssEditor()?.getValue().includes('--ink:'),
    null, { timeout: 5_000 }
  )
  const initialValue = await appWindow.evaluate(() => window.__gstrap.getCssEditor().getValue())
  expect(initialValue).toContain('.site-navbar')

  // executeEdits drives onDidChangeModelContent the same way a real keystroke
  // does (see style-manager.spec.js's Properties/Custom-CSS sync spec).
  await appWindow.evaluate(sentinel => {
    const ed = window.__gstrap.getCssEditor()
    const end = ed.getModel().getFullModelRange().getEndPosition()
    ed.executeEdits('spec', [{
      range: {
        startLineNumber: end.lineNumber, startColumn: end.column,
        endLineNumber: end.lineNumber, endColumn: end.column
      },
      text: `\n${sentinel}\n`
    }])
  }, SENTINEL)

  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'file:save')
  })

  const target = join(projectDir, 'site', 'assets', 'css', 'theme.css')
  let onDisk = ''
  for (let i = 0; i < 40; i++) {
    onDisk = await fsp.readFile(target, 'utf8').catch(() => '')
    if (onDisk.includes(SENTINEL)) break
    await new Promise(r => setTimeout(r, 250))
  }
  expect(onDisk).toContain(SENTINEL)
  expect(onDisk).toContain('.site-navbar') // original bundle content survives, not replaced

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Site Files: main.js listed (not theme.css/vendor); dblclick opens a javascript tab that round-trips on save', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-vista-'))
  const projectPath = join(projectDir, 'vista.gstrap')
  const SENTINEL = '// vista-js-edit-sentinel'

  const { app, appWindow } = await launch()
  await createVistaProject(appWindow, projectPath)
  await dismissWelcome(appWindow) // real dblclick below needs the overlay gone

  await appWindow.waitForSelector('.gstrap-fm-item[data-fm-file="assets/js/main.js"]', { timeout: 15_000 })

  // theme.css never enters the Site Files list (dual-writer guard — it's
  // only ever edited through the Custom CSS panel); the vendor tree is
  // skipped entirely (SITE_SCAN_SKIP_DIR_PREFIXES 'assets/vendor/').
  const fileRows = await appWindow.evaluate(() =>
    [...document.querySelectorAll('[data-fm-file]')].map(el => el.dataset.fmFile))
  expect(fileRows).toContain('assets/js/main.js')
  expect(fileRows).not.toContain('assets/css/theme.css')
  expect(fileRows.some(p => p.startsWith('assets/vendor/'))).toBe(false)

  await appWindow.dblclick('.gstrap-fm-item[data-fm-file="assets/js/main.js"]')

  // Model creation is sync but content arrives via async file:read (same
  // wait shape as php.spec.js's seedAndOpenPhp). 'lightbox-carousel' is the
  // element id main.js drives — a marker unique to this starter's file (see
  // starters/vista/assets/js/main.js).
  await appWindow.waitForFunction(() => {
    const m = window.__gstrap?.pluginRegistry?.bound?.monaco
    const models = m?.editor?.getModels?.() || []
    return models.some(md =>
      md?.getLanguageId?.() === 'javascript' && (md?.getValue?.() || '').includes('lightbox-carousel'))
  }, null, { timeout: 10_000 })

  const tabKind = await appWindow.evaluate(() => window.__gstrap?.pageState?.active?.()?.kind || null)
  expect(tabKind).toBe('file')

  await appWindow.evaluate(sentinel => {
    const m = window.__gstrap.pluginRegistry.bound.monaco
    const model = m.editor.getModels().find(md => md.getLanguageId() === 'javascript')
    model.setValue(`${model.getValue()}\n${sentinel}\n`)
  }, SENTINEL)

  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'file:save')
  })

  const target = join(projectDir, 'site', 'assets', 'js', 'main.js')
  let onDisk = ''
  for (let i = 0; i < 40; i++) {
    onDisk = await fsp.readFile(target, 'utf8').catch(() => '')
    if (onDisk.includes(SENTINEL)) break
    await new Promise(r => setTimeout(r, 250))
  }
  expect(onDisk).toContain(SENTINEL)
  expect(onDisk).toContain('lightbox-carousel')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Reopen: framework-owning project never gets the app-bundled Bootstrap backfilled', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-vista-'))
  const projectPath = join(projectDir, 'vista.gstrap')

  // ── Pass 1: create + close ──────────────────────────────────────────────
  {
    const { app, appWindow } = await launch()
    await createVistaProject(appWindow, projectPath)
    await app.close()
  }

  // ── Pass 2: fresh launch, reopen from disk ──────────────────────────────
  {
    const { app, appWindow } = await launch()
    await appWindow.waitForFunction(
      n => window.__gstrap?.pluginRegistry?.activated?.length === n,
      EXPECTED_PLUGIN_COUNT, { timeout: 15_000 })
    await appWindow.evaluate(async path => {
      const project = await window.grapestrap.project.open(path)
      window.__gstrap.projectState.set(project)
    }, projectPath)
    await app.close()
  }

  // project-manager.js#loadProject's backfill (`if (!manifest.framework)`)
  // must have stayed skipped — a regression here would silently plant an
  // unreferenced, unexported Bootstrap copy in every Vista project on its
  // second open.
  expect(await fileExists(join(projectDir, 'site', 'assets', 'css', 'bootstrap.css'))).toBe(false)

  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Export: flat index.html links the vendored bootstrap, image tree ships, theme.css carries the live edit', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-vista-'))
  const projectPath = join(projectDir, 'vista.gstrap')
  const outDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-vista-export-'))
  const SENTINEL = '/* vista-export-edit-sentinel */'

  const { app, appWindow } = await launch()
  await createVistaProject(appWindow, projectPath)

  // Edit the live buffer only — exportProject reads project.globalCSS (the
  // in-memory value), so this proves export works from a dirty editor
  // without requiring a save first (see project-manager.js#exportProject).
  await appWindow.evaluate(sentinel => {
    const ed = window.__gstrap.getCssEditor()
    const end = ed.getModel().getFullModelRange().getEndPosition()
    ed.executeEdits('spec', [{
      range: {
        startLineNumber: end.lineNumber, startColumn: end.column,
        endLineNumber: end.lineNumber, endColumn: end.column
      },
      text: `\n${sentinel}\n`
    }])
  }, SENTINEL)
  await appWindow.waitForFunction(
    sentinel => window.__gstrap.projectState.current.globalCSS.includes(sentinel),
    SENTINEL, { timeout: 3_000 }
  )

  await appWindow.evaluate(async out => {
    await window.grapestrap.project.export(window.__gstrap.projectState.current, out)
  }, outDir)

  const exportedIndex = await fsp.readFile(join(outDir, 'index.html'), 'utf8')
  expect(exportedIndex).toContain('assets/vendor/bootstrap/bootstrap.min.css')
  expect(exportedIndex).not.toContain('assets/css/bootstrap.css')

  expect(await fileExists(join(outDir, 'assets', 'vendor', 'bootstrap', 'bootstrap.min.css'))).toBe(true)
  expect(await fileExists(join(outDir, 'assets', 'vendor', 'fonts', 'source-sans-pro.css'))).toBe(true)
  expect(await fileExists(join(outDir, 'assets', 'images', 'hero-backdrop.jpg'))).toBe(true)
  expect(await fileExists(join(outDir, 'assets', 'images', 'fulls', 'gallery-jet-flight.jpg'))).toBe(true)

  const exportedTheme = await fsp.readFile(join(outDir, 'assets', 'css', 'theme.css'), 'utf8')
  expect(exportedTheme).toContain(SENTINEL)
  // The bundle's rewritten url() convention has to survive export untouched —
  // it is what makes the backdrops resolve from assets/css/ next to the images.
  expect(exportedTheme).toContain('url("../images/hero-backdrop.jpg")')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
  await fsp.rm(outDir, { recursive: true, force: true })
})

test('selectedPages: [] fails open to the starter\'s single page (same posture as omitted)', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-vista-'))
  const projectPath = join(projectDir, 'vista.gstrap')

  const { app, appWindow } = await launch()
  const { pageNames } = await createBundledStarterProject(
    appWindow, projectPath, { starterId: 'vista', selectedPages: [] })
  expect(pageNames).toEqual(['index'])

  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(manifest.pages).toHaveLength(1)
  // Shared infrastructure is unconditional in applyStarter regardless of the
  // page filter — a one-page starter must still arrive fully vendored.
  expect(await fileExists(
    join(projectDir, 'site', 'assets', 'vendor', 'bootstrap', 'bootstrap.min.css'))).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('project:starter-page IPC: returns the index page\'s body/scripts, null for an unknown page', async () => {
  const { app, appWindow } = await launch()
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 })

  const index = await appWindow.evaluate(() =>
    window.grapestrap.project.starterPage('vista', 'index'))
  expect(typeof index.body).toBe('string')
  expect(index.body).toContain('hero-section')
  expect(index.customScripts.map(s => s.src)).toContain('assets/js/main.js')

  const unknownPage = await appWindow.evaluate(() =>
    window.grapestrap.project.starterPage('vista', 'no-such-page'))
  expect(unknownPage).toBeNull()

  await app.close()
})
