// =============================================================
// PATH: tests/e2e/bs-version-gate.spec.js
// ROLE: End-to-end coverage for the Bootstrap-major compat gate (A-WP2) — the
//       warn-only "insert anyway / cancel" confirm that fires when a bundled
//       section's stamped `bootstrapVersion` differs in MAJOR from the open
//       project's own. Covers: the dialog appearing on a real mismatch,
//       Cancel leaving zero residue (no markup, no CSS chunk, no behaviors
//       runtime side effect), OK landing the section on a re-insert, no
//       dialog at all on a matching major, and the two manifest-stamping
//       paths (new project gets the real bundled version; a pre-feature
//       manifest backfills 'legacy' on load, which persists on save).
// DEPENDS: @playwright/test, ./helpers.js,
//          src/shared/bs-version.js, src/renderer/dialogs/confirm.js,
//          src/renderer/editor/insert-section.js, src/main/project-manager.js
//          (getBundledBootstrapVersion, loadProject's 'legacy' backfill),
//          plugins/blocks-sections/graphite-sections.js (graphite-navbar —
//          carries css + behaviors:true, so Cancel-leaves-zero-residue can
//          prove all three legs at once)
// CREATED: 2026-08-18
// =============================================================
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome, fileExists } from './helpers.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// A project deliberately mis-stamped to a Bootstrap 4 major so every insert
// of a bundled section (all authored against BOOTSTRAP_VERSION = '5.3.3' in
// plugins/blocks-sections/index.js) reads as a MAJOR mismatch.
const MISMATCHED_PROJECT_VERSION = '4.6.0'

// graphite-navbar: carries both CSS markers (graphite-base, graphite-navbar)
// AND behaviors:true, so one section proves all three "Cancel leaves zero
// residue" legs — markup, CSS chunk, behaviors runtime files.
const NAVBAR_ID = 'graphite-navbar'
const NAVBAR_SELECTOR = 'header.gs-graphite-navbar'
const NAVBAR_MARKERS = ['/* gs-sec:graphite-base */', '/* gs-sec:graphite-navbar */']
const BEHAVIORS_JS = ['site', 'assets', 'js', 'gstrap-behaviors.js']
const BEHAVIORS_CSS = ['site', 'assets', 'css', 'gstrap-behaviors.css']

/** Click a bundled Library row's insert button — same path as template-sections.spec.js. */
async function clickBundledInsert(appWindow, sectionId) {
  await appWindow.evaluate(id => {
    document.querySelector(`[data-lib-bundled-insert="${id}"]`).click()
  }, sectionId)
}

/** Wait for the compat-gate confirm dialog to appear. */
async function waitForGateDialog(appWindow) {
  await appWindow.waitForSelector('.gstrap-prompt-overlay [data-confirm-ok]', { timeout: 5_000 })
}

/** Wait for a selector inside the canvas iframe document. */
async function waitForCanvasSelector(appWindow, selector) {
  await appWindow.waitForFunction(sel => {
    const doc = window.__gstrap.pluginRegistry.bound.editor?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector(sel)
  }, selector, { timeout: 15_000 })
}

function canvasHasSelector(appWindow, selector) {
  return appWindow.evaluate(sel => {
    const doc = window.__gstrap.pluginRegistry.bound.editor?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector(sel)
  }, selector)
}

function globalCssMarkers(appWindow, markers) {
  return appWindow.evaluate(list => {
    const css = window.__gstrap.projectState.current.globalCSS || ''
    return list.map(m => css.includes(m))
  }, markers)
}

/**
 * Re-open a project already on disk (as opposed to openSeedProject, which
 * creates a NEW one) — same call sequence the File → Open menu item drives.
 */
async function openExistingProject(appWindow, projectPath) {
  await appWindow.evaluate(async path => {
    const project = await window.grapestrap.project.open(path)
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
  }, projectPath)
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-cid]').length > 0, null, { timeout: 10_000 })
}

test('a MAJOR mismatch shows the confirm dialog; Cancel leaves zero residue; OK on re-insert lands the section', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-bsgate-mismatch-'))
  const projectPath = join(projectDir, 'mismatch.gstrap')
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await openSeedProject(appWindow, projectPath)

  // Mis-stamp the manifest on disk to a Bootstrap 4 project, then reload it
  // through the real loadProject path so projectState.current.manifest is
  // exactly what a genuinely old Bootstrap-4 project would look like.
  const manifestBefore = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  manifestBefore.bootstrapVersion = MISMATCHED_PROJECT_VERSION
  await fsp.writeFile(projectPath, JSON.stringify(manifestBefore, null, 2), 'utf8')
  await openExistingProject(appWindow, projectPath)

  const loadedVersion = await appWindow.evaluate(
    () => window.__gstrap.projectState.current.manifest.bootstrapVersion)
  expect(loadedVersion).toBe(MISMATCHED_PROJECT_VERSION)

  // ── Insert → dialog appears, naming both versions ──────────────────────────
  await clickBundledInsert(appWindow, NAVBAR_ID)
  await waitForGateDialog(appWindow)
  const dialogText = await appWindow.evaluate(() =>
    document.querySelector('.gstrap-prompt-overlay .gstrap-prompt-message')?.textContent || '')
  expect(dialogText).toContain('5.3.3')
  expect(dialogText).toContain(MISMATCHED_PROJECT_VERSION)

  // ── Cancel → zero residue: no markup, no CSS chunk, no behaviors files ─────
  await appWindow.evaluate(() => document.querySelector('.gstrap-prompt-overlay [data-confirm-cancel]').click())
  await appWindow.waitForFunction(
    () => !document.querySelector('.gstrap-prompt-overlay'), null, { timeout: 3_000 })

  expect(await canvasHasSelector(appWindow, NAVBAR_SELECTOR)).toBe(false)
  expect(await globalCssMarkers(appWindow, NAVBAR_MARKERS)).toEqual([false, false])
  expect(await fileExists(join(projectDir, ...BEHAVIORS_JS))).toBe(false)
  expect(await fileExists(join(projectDir, ...BEHAVIORS_CSS))).toBe(false)
  const behaviorsFlagAfterCancel = await appWindow.evaluate(
    () => window.__gstrap.projectState.current.manifest.behaviors)
  expect(behaviorsFlagAfterCancel).toBeFalsy()

  // ── Re-insert + OK → the section lands, same as an ungated insert ──────────
  await clickBundledInsert(appWindow, NAVBAR_ID)
  await waitForGateDialog(appWindow)
  await appWindow.evaluate(() => document.querySelector('.gstrap-prompt-overlay [data-confirm-ok]').click())
  await waitForCanvasSelector(appWindow, NAVBAR_SELECTOR)

  expect(await globalCssMarkers(appWindow, NAVBAR_MARKERS)).toEqual([true, true])
  expect(await fileExists(join(projectDir, ...BEHAVIORS_JS))).toBe(true)
  expect(await fileExists(join(projectDir, ...BEHAVIORS_CSS))).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Esc dismisses the gate the same as Cancel', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-bsgate-esc-'))
  const projectPath = join(projectDir, 'esc.gstrap')
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await openSeedProject(appWindow, projectPath)

  const manifestBefore = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  manifestBefore.bootstrapVersion = MISMATCHED_PROJECT_VERSION
  await fsp.writeFile(projectPath, JSON.stringify(manifestBefore, null, 2), 'utf8')
  await openExistingProject(appWindow, projectPath)

  await clickBundledInsert(appWindow, NAVBAR_ID)
  await waitForGateDialog(appWindow)
  await appWindow.keyboard.press('Escape')
  await appWindow.waitForFunction(
    () => !document.querySelector('.gstrap-prompt-overlay'), null, { timeout: 3_000 })

  expect(await canvasHasSelector(appWindow, NAVBAR_SELECTOR)).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('matching-major project: no dialog, section inserts immediately', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-bsgate-match-'))
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  // A freshly-created project is stamped with the app's REAL bundled Bootstrap
  // (major 5), same major as every bundled section — no mismatch possible.
  await openSeedProject(appWindow, join(projectDir, 'match.gstrap'))

  await clickBundledInsert(appWindow, NAVBAR_ID)
  await waitForCanvasSelector(appWindow, NAVBAR_SELECTOR)

  expect(await appWindow.evaluate(() => !!document.querySelector('.gstrap-prompt-overlay'))).toBe(false)
  expect(await globalCssMarkers(appWindow, NAVBAR_MARKERS)).toEqual([true, true])

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('a new blank project is stamped with the real bundled Bootstrap version', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-bsgate-stamp-'))
  const projectPath = join(projectDir, 'stamp.gstrap')
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await openSeedProject(appWindow, projectPath)

  const bundledPkg = JSON.parse(
    await fsp.readFile(join(repoRoot, 'node_modules', 'bootstrap', 'package.json'), 'utf8'))
  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(manifest.bootstrapVersion).toBe(bundledPkg.version)

  const inMemory = await appWindow.evaluate(
    () => window.__gstrap.projectState.current.manifest.bootstrapVersion)
  expect(inMemory).toBe(bundledPkg.version)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('a manifest with the field stripped backfills to \'legacy\' on load and persists it on save', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-bsgate-legacy-'))
  const projectPath = join(projectDir, 'legacy.gstrap')
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await openSeedProject(appWindow, projectPath)

  // Strip the field — simulates a project made before this feature existed.
  const stripped = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  delete stripped.bootstrapVersion
  expect(stripped.framework).toBeUndefined()
  await fsp.writeFile(projectPath, JSON.stringify(stripped, null, 2), 'utf8')

  await openExistingProject(appWindow, projectPath)
  const backfilled = await appWindow.evaluate(
    () => window.__gstrap.projectState.current.manifest.bootstrapVersion)
  expect(backfilled).toBe('legacy')

  // Not yet on disk — the backfill is in-memory until the next save.
  const onDiskBeforeSave = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(onDiskBeforeSave.bootstrapVersion).toBeUndefined()

  await appWindow.evaluate(async () => {
    await window.grapestrap.project.save(window.__gstrap.projectState.current)
  })
  const onDiskAfterSave = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(onDiskAfterSave.bootstrapVersion).toBe('legacy')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
