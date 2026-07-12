/**
 * GrapeStrap — E2E: crash recovery (Wave 1)
 *
 * PATH: tests/e2e/recovery.spec.js
 * ROLE: Proves the .gstrap.recovery net end-to-end: dirty project + SIGKILL →
 *       relaunch offers the recovery dialog → Restore puts the edit back in
 *       projectState AND the canvas; Discard deletes the snapshot and leaves
 *       the empty state; a normal save clears the snapshot so the next launch
 *       shows no dialog. Each test relaunches with the FIRST session's XDG
 *       root (launch() spreads extraEnv after its fresh XDG entries, so the
 *       override sticks) — that carries recents (the boot scan's source) and
 *       welcomeShown=true (so the welcome modal never races the recovery
 *       modal in session 2).
 *       NOTE for the runner: the suite launches the packaged entry
 *       (package.json main = dist/main/main.js) — `npm run build` first.
 * DEPENDS: ./helpers.js (launch, openSeedProject, dismissWelcome)
 * CREATED: 2026-07-12
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome } from './helpers.js'

const PROBE = 'recovery-probe-sentinel'

// Re-derive the XDG env launch() built for a previous session so a relaunch
// sees the same prefs + recents. Keys match helpers.js launch().
function xdgEnv(xdgRoot) {
  return {
    XDG_CONFIG_HOME: join(xdgRoot, 'config'),
    XDG_CACHE_HOME:  join(xdgRoot, 'cache'),
    XDG_DATA_HOME:   join(xdgRoot, 'data'),
    XDG_STATE_HOME:  join(xdgRoot, 'state')
  }
}

async function fileExists(p) {
  try { await fsp.access(p); return true } catch { return false }
}

// Seed a project with 1s snapshots and one real canvas edit. The interval
// pref MUST be set before the project opens — the recovery loop reads it
// once per project:opened. The edit goes through the GrapesJS wrapper (not
// a page.html poke) because the snapshot captures the CANVAS for the active
// tab; recents is populated explicitly because openSeedProject bypasses
// cmdOpenProject and never calls addRecent.
async function seedDirtyProject(appWindow, projectPath) {
  await appWindow.evaluate(() =>
    window.grapestrap.prefs.set('general.autosaveIntervalSeconds', 1))
  await openSeedProject(appWindow, projectPath)
  await appWindow.evaluate(async probe => {
    const { projectState, pluginRegistry } = window.__gstrap
    await window.grapestrap.project.addRecent(
      projectState.current.manifestPath,
      projectState.current.manifest.metadata.name
    )
    pluginRegistry.bound.editor.getWrapper()
      .append(`<div id="recovery-probe">${probe}</div>`)
    projectState.markPageDirty(projectState.current.pages[0].name)
  }, PROBE)
}

// Hard-kill the Electron main process (the crash under test). Playwright's
// ElectronApplication exposes the launched child via app.process().
async function killHard(app) {
  const proc = app.process()
  const exited = new Promise(resolve => proc.once('exit', resolve))
  proc.kill('SIGKILL')
  await exited
}

test('Recovery: dirty project + SIGKILL → relaunch offers restore → edit returns', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-recov1-'))
  const projectPath = join(projectDir, 'recov1.gstrap')
  const recoveryPath = projectPath + '.recovery'
  let app2 = null
  const { app, appWindow, xdgRoot } = await launch()
  try {
    await dismissWelcome(appWindow)   // also persists welcomeShown for session 2
    await seedDirtyProject(appWindow, projectPath)
    await expect.poll(() => fileExists(recoveryPath), { timeout: 20_000 }).toBe(true)
    await killHard(app)

    const second = await launch(xdgEnv(xdgRoot))
    app2 = second.app
    const appWindow2 = second.appWindow

    // Boot recents scan finds the snapshot → dialog. IPC round-trips sit
    // between app:ready and the modal, so wait on the selector, not on time.
    await appWindow2.waitForSelector(
      '.gstrap-modal-overlay [data-action="restore"]', { timeout: 20_000 })
    await appWindow2.click('.gstrap-modal-overlay [data-action="restore"]')

    // Edit is back in projectState…
    await appWindow2.waitForFunction(
      probe => window.__gstrap?.projectState?.current?.pages?.[0]?.html?.includes(probe) === true,
      PROBE, { timeout: 20_000 })
    // …and in the live canvas.
    await appWindow2.waitForFunction(
      probe => window.__gstrap?.pluginRegistry?.bound?.editor?.getHtml()?.includes(probe) === true,
      PROBE, { timeout: 20_000 })
    // Restored work is unsaved again, and the snapshot survives until save.
    expect(await appWindow2.evaluate(() => window.__gstrap.projectState.isDirty())).toBe(true)
    expect(await fileExists(recoveryPath)).toBe(true)
  } finally {
    if (app2) await app2.close().catch(() => {})
    await fsp.rm(projectDir, { recursive: true, force: true })
    await fsp.rm(xdgRoot, { recursive: true, force: true })
  }
})

test('Recovery: discard clears the snapshot and leaves the empty state', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-recov2-'))
  const projectPath = join(projectDir, 'recov2.gstrap')
  const recoveryPath = projectPath + '.recovery'
  let app2 = null
  const { app, appWindow, xdgRoot } = await launch()
  try {
    await dismissWelcome(appWindow)
    await seedDirtyProject(appWindow, projectPath)
    await expect.poll(() => fileExists(recoveryPath), { timeout: 20_000 }).toBe(true)
    await killHard(app)

    const second = await launch(xdgEnv(xdgRoot))
    app2 = second.app
    const appWindow2 = second.appWindow

    await appWindow2.waitForSelector(
      '.gstrap-modal-overlay [data-action="discard"]', { timeout: 20_000 })
    await appWindow2.click('.gstrap-modal-overlay [data-action="discard"]')

    await expect.poll(() => fileExists(recoveryPath), { timeout: 10_000 }).toBe(false)
    await appWindow2.waitForFunction(
      () => window.__gstrap?.recoveryState?.bootCheckDone === true,
      null, { timeout: 20_000 })
    // Discard opens nothing — empty state, no lingering overlay.
    expect(await appWindow2.evaluate(() => window.__gstrap.projectState.current)).toBe(null)
    expect(await appWindow2.evaluate(
      () => !!document.querySelector('.gstrap-modal-overlay'))).toBe(false)
  } finally {
    if (app2) await app2.close().catch(() => {})
    await fsp.rm(projectDir, { recursive: true, force: true })
    await fsp.rm(xdgRoot, { recursive: true, force: true })
  }
})

test('Recovery: save clears the snapshot — no recovery dialog on next launch', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-recov3-'))
  const projectPath = join(projectDir, 'recov3.gstrap')
  const recoveryPath = projectPath + '.recovery'
  let app2 = null
  const { app, appWindow, xdgRoot } = await launch()
  try {
    await dismissWelcome(appWindow)
    await seedDirtyProject(appWindow, projectPath)
    await expect.poll(() => fileExists(recoveryPath), { timeout: 20_000 }).toBe(true)

    // Normal save — main clears the snapshot (project-manager.js saveProject).
    await appWindow.evaluate(() => {
      window.__gstrap.eventBus.emit('command', 'file:save')
    })
    await expect.poll(() => fileExists(recoveryPath), { timeout: 10_000 }).toBe(false)
    await app.close()   // clean exit, nothing dirty

    const second = await launch(xdgEnv(xdgRoot))
    app2 = second.app
    const appWindow2 = second.appWindow

    // Deterministic "the boot check ran and offered nothing" — no sleeps.
    await appWindow2.waitForFunction(
      () => window.__gstrap?.recoveryState?.bootCheckDone === true,
      null, { timeout: 20_000 })
    expect(await appWindow2.evaluate(
      () => !!document.querySelector('.gstrap-modal-overlay'))).toBe(false)
  } finally {
    if (app2) await app2.close().catch(() => {})
    await app.close().catch(() => {})
    await fsp.rm(projectDir, { recursive: true, force: true })
    await fsp.rm(xdgRoot, { recursive: true, force: true })
  }
})
