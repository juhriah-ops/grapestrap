/**
 * GrapeStrap — E2E: Orbit starter
 *
 * PATH: tests/e2e/orbit-starter.spec.js
 * ROLE: Orbit-starter-wave specs — the second bundled-asset starter after
 *       Graphite (vendors its OWN framework bundle at site/assets/vendor/**
 *       instead of GrapeStrap's bundled Bootstrap/BSI/FA). Mirrors
 *       graphite-starter.spec.js's coverage shape via the shared
 *       createBundledStarterProject helper (tests/e2e/helpers.js): disk
 *       shapes on create, manifest overrides (globalCSS/framework/
 *       metadata.starter), composed page wiring, Custom CSS panel round-trip
 *       to theme.css, Site Files main.js round-trip through the javascript
 *       file-tab lane, framework-backfill suppression on reopen, and export.
 *       The New Project dialog's starter option is covered by
 *       starter-templates.spec.js (list pinned to include 'orbit'), not
 *       duplicated here.
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-08-17
 */
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, dismissWelcome, EXPECTED_PLUGIN_COUNT, fileExists, createBundledStarterProject } from './helpers.js'

const createOrbitProject = (appWindow, projectPath) =>
  createBundledStarterProject(appWindow, projectPath, { starterId: 'orbit' })
const createOrbitProjectWithSelection = (appWindow, projectPath, selectedPages) =>
  createBundledStarterProject(appWindow, projectPath, { starterId: 'orbit', selectedPages })

test('Orbit starter: bundle assets land on disk, app-bundled framework files do not', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-orbit-'))
  const projectPath = join(projectDir, 'orbit.gstrap')

  const { app, appWindow } = await launch()
  await createOrbitProject(appWindow, projectPath)

  const site = join(projectDir, 'site')
  expect(await fileExists(join(site, 'assets', 'css', 'theme.css'))).toBe(true)
  expect(await fileExists(join(site, 'assets', 'js', 'main.js'))).toBe(true)
  expect(await fileExists(join(site, 'assets', 'vendor', 'bootstrap', 'bootstrap.min.css'))).toBe(true)
  expect(await fileExists(join(site, 'assets', 'vendor', 'fonts', 'roboto.css'))).toBe(true)
  expect(await fileExists(join(site, 'assets', 'images', 'hero.jpg'))).toBe(true)

  // Orbit owns the project's framework outright (src/main/starters/index.js
  // applyStarter + project-manager.js createProject skip copyFrameworkAssets
  // for starters carrying `framework`) — the app's own bundled Bootstrap and
  // placeholder style.css must never land alongside the vendored set.
  expect(await fileExists(join(site, 'assets', 'css', 'bootstrap.css'))).toBe(false)
  expect(await fileExists(join(site, 'assets', 'css', 'style.css'))).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Orbit starter: manifest overrides — globalCSS, framework counts, metadata.starter, 5 pages', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-orbit-'))
  const projectPath = join(projectDir, 'orbit.gstrap')

  const { app, appWindow } = await launch()
  const { pageNames } = await createOrbitProject(appWindow, projectPath)
  expect(pageNames).toEqual(['index', 'left-sidebar', 'right-sidebar', 'two-sidebar', 'no-sidebar'])

  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(manifest.globalCSS).toBe('assets/css/theme.css')
  expect(manifest.framework.css).toHaveLength(5)
  expect(manifest.framework.js).toHaveLength(1)
  expect(manifest.metadata.starter).toBe('orbit')
  expect(manifest.pages).toHaveLength(5)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Orbit starter: site/pages/index.html links the vendored bootstrap + theme.css + main.js', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-orbit-'))
  const projectPath = join(projectDir, 'orbit.gstrap')

  const { app, appWindow } = await launch()
  await createOrbitProject(appWindow, projectPath)

  const pageOnDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')
  expect(pageOnDisk).toContain('assets/vendor/bootstrap/bootstrap.min.css')
  expect(pageOnDisk).not.toContain('assets/css/bootstrap.css')
  expect(pageOnDisk).toContain('href="assets/css/theme.css"')
  expect(pageOnDisk).toContain('src="assets/js/main.js"')
  expect(pageOnDisk).toContain('data-grpstr-script')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Custom CSS panel: Monaco buffer holds theme.css, edits round-trip to disk on save', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-orbit-'))
  const projectPath = join(projectDir, 'orbit.gstrap')
  const SENTINEL = '/* orbit-css-edit-sentinel */'

  const { app, appWindow } = await launch()
  await createOrbitProject(appWindow, projectPath)

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
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-orbit-'))
  const projectPath = join(projectDir, 'orbit.gstrap')
  const SENTINEL = '// orbit-js-edit-sentinel'

  const { app, appWindow } = await launch()
  await createOrbitProject(appWindow, projectPath)
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
  // wait shape as php.spec.js's seedAndOpenPhp). 'orbit-theme' is the
  // localStorage key main.js reads/writes — a marker unique to this
  // starter's file (see starters/orbit/assets/js/main.js).
  await appWindow.waitForFunction(() => {
    const m = window.__gstrap?.pluginRegistry?.bound?.monaco
    const models = m?.editor?.getModels?.() || []
    return models.some(md =>
      md?.getLanguageId?.() === 'javascript' && (md?.getValue?.() || '').includes('orbit-theme'))
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
  expect(onDisk).toContain('orbit-theme')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Reopen: framework-owning project never gets the app-bundled Bootstrap backfilled', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-orbit-'))
  const projectPath = join(projectDir, 'orbit.gstrap')

  // ── Pass 1: create + close ──────────────────────────────────────────────
  {
    const { app, appWindow } = await launch()
    await createOrbitProject(appWindow, projectPath)
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
  // unreferenced, unexported Bootstrap copy in every Orbit project on its
  // second open.
  expect(await fileExists(join(projectDir, 'site', 'assets', 'css', 'bootstrap.css'))).toBe(false)

  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Export: flat index.html links the vendored bootstrap, vendor tree ships, theme.css carries the live edit', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-orbit-'))
  const projectPath = join(projectDir, 'orbit.gstrap')
  const outDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-orbit-export-'))
  const SENTINEL = '/* orbit-export-edit-sentinel */'

  const { app, appWindow } = await launch()
  await createOrbitProject(appWindow, projectPath)

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
  expect(await fileExists(join(outDir, 'assets', 'vendor', 'fonts', 'roboto.css'))).toBe(true)

  const exportedTheme = await fsp.readFile(join(outDir, 'assets', 'css', 'theme.css'), 'utf8')
  expect(exportedTheme).toContain(SENTINEL)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
  await fsp.rm(outDir, { recursive: true, force: true })
})

test('selectedPages: a 2-page subset writes only those pages; shared vendor bundle stays unconditional', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-orbit-'))
  const projectPath = join(projectDir, 'orbit.gstrap')

  const { app, appWindow } = await launch()
  const { pageNames } = await createOrbitProjectWithSelection(
    appWindow, projectPath, ['index', 'left-sidebar'])
  expect(pageNames).toEqual(['index', 'left-sidebar'])

  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(manifest.pages).toHaveLength(2)
  expect(manifest.pages.map(p => p.name)).toEqual(['index', 'left-sidebar'])

  const site = join(projectDir, 'site')
  expect(await fileExists(join(site, 'pages', 'right-sidebar.html'))).toBe(false)

  // Shared infrastructure (vendor bundle) is unconditional in applyStarter —
  // an excluded page re-added later via New Page must find it already there.
  expect(await fileExists(join(site, 'assets', 'vendor', 'bootstrap', 'bootstrap.min.css'))).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('selectedPages: [] fails open to all 5 pages (same posture as omitted)', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-orbit-'))
  const projectPath = join(projectDir, 'orbit.gstrap')

  const { app, appWindow } = await launch()
  const { pageNames } = await createOrbitProjectWithSelection(appWindow, projectPath, [])
  expect(pageNames).toEqual(['index', 'left-sidebar', 'right-sidebar', 'two-sidebar', 'no-sidebar'])

  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(manifest.pages).toHaveLength(5)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('project:starter-page IPC: returns one page\'s body/scripts, null for an unknown page or a non-registry starter id', async () => {
  const { app, appWindow } = await launch()
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 })

  const noSidebar = await appWindow.evaluate(() =>
    window.grapestrap.project.starterPage('orbit', 'no-sidebar'))
  expect(typeof noSidebar.body).toBe('string')
  expect(noSidebar.body.length).toBeGreaterThan(0)
  expect(noSidebar.customScripts.map(s => s.src)).toContain('assets/js/main.js')

  const unknownPage = await appWindow.evaluate(() =>
    window.grapestrap.project.starterPage('orbit', 'no-such-page'))
  expect(unknownPage).toBeNull()

  // 'blank' is not a STARTERS registry entry (same fail-open contract as
  // getStarter) — the lookup fails at the starter-id stage, before pageName
  // is even consulted.
  const blankStarter = await appWindow.evaluate(() =>
    window.grapestrap.project.starterPage('blank', 'index'))
  expect(blankStarter).toBeNull()

  await app.close()
})
