/**
 * GrapeStrap — E2E shared helpers
 *
 * PATH: tests/e2e/helpers.js
 * ROLE: Launch/seed/select/dismiss helpers + shared constants for the domain spec files (split out of smoke.spec.js in Wave 0 of the v0.1.0 campaign)
 * DEPENDS: @playwright/test (_electron)
 * CREATED: 2026-07-12
 * UPDATED: 2026-08-17 — added fileExists + createBundledStarterProject,
 *          pulled out of graphite-starter.spec.js when the Orbit starter
 *          became the second bundled-asset starter (graphite/orbit both
 *          vendor their own framework via bundleDir) — see orbit-starter.spec.js.
 */
import { _electron as electron } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..')

// Number of bundled plugins every launch must activate before specs may
// proceed. Keep in sync with plugins/*/grapestrap.json (5 as of v0.1.0).
export const EXPECTED_PLUGIN_COUNT = 5

export async function launch(extraEnv = {}, { keepXdg = false } = {}) {
  // Isolate XDG dirs per launch so prefs (esp. prefs.view set by toggle
  // specs) don't leak between tests. Prior runs would persist
  // propertiesPanelVisible:false to ~/.config/GrapeStrap and break every
  // subsequent test that needed the Properties panel visible.
  const xdgRoot = await fsp.mkdtemp(join(tmpdir(), 'gstrap-xdg-'))
  const app = await electron.launch({
    args: [repoRoot, '--no-sandbox'],
    env: {
      ...process.env,
      XDG_CONFIG_HOME: join(xdgRoot, 'config'),
      XDG_CACHE_HOME:  join(xdgRoot, 'cache'),
      XDG_DATA_HOME:   join(xdgRoot, 'data'),
      XDG_STATE_HOME:  join(xdgRoot, 'state'),
      ...extraEnv
    }
  })
  // Delete the per-launch XDG scratch when the app closes (spec app.close()
  // AND playwright's kill-on-teardown both emit 'close'). Without this every
  // launch leaked ~10-30MB of Chromium cache into the OS tmpdir — a full
  // 124-spec run filled the 3.9G tmpfs on .212 (2026-07-12, during the Wave 4
  // sweep) and Electron then failed to boot for every later spec.
  // keepXdg opts out for relaunch specs (recovery, workspace-persistence)
  // that reopen a second session against the FIRST session's XDG root —
  // those specs own the rm themselves.
  if (!keepXdg) {
    app.on('close', () => {
      fsp.rm(xdgRoot, { recursive: true, force: true }).catch(() => {})
    })
  }
  const appWindow = await app.firstWindow()
  await appWindow.waitForFunction(() => window.__gstrap?.eventBus, null, { timeout: 30_000 })
  return { app, appWindow, xdgRoot }
}

export async function openSeedProject(appWindow, projectPath) {
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 }
  )
  await appWindow.evaluate(async path => {
    const project = await window.grapestrap.project.new({ name: 'tagtest', location: path })
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
  }, projectPath)
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-cid]').length > 0,
    null, { timeout: 10_000 }
  )
}

export async function selectFirstByTag(appWindow, tag) {
  await appWindow.evaluate(t => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const wrapper = ed.getWrapper()
    function find(c) {
      if ((c.get('tagName') || '').toLowerCase() === t) return c
      for (const k of c.components()) { const r = find(k); if (r) return r }
      return null
    }
    const found = find(wrapper)
    if (found) ed.select(found)
  }, tag)
}

/** True if `path` exists on disk, false for any access error (ENOENT etc). */
export const fileExists = p => fsp.access(p).then(() => true, () => false)

/**
 * Create a project from a bundled-asset starter (one that carries its own
 * vendored framework via bundleDir — Graphite and Orbit as of 2026-08-17) and
 * open its first page. Generalizes graphite-starter.spec.js's original
 * createGraphiteProject/createGraphiteProjectWithSelection into one helper
 * parameterized by starterId, so a third bundled starter needs no new
 * creation boilerplate — only its own starter-specific disk/manifest
 * assertions (those stay in each starter's own spec file; the exact vendored
 * files, image names, and framework counts are template behavior that
 * genuinely differs per starter, so compressing THEM into a shared helper
 * would trade readability for a few fewer lines).
 *
 * @param {import('@playwright/test').Page} appWindow
 * @param {string} projectPath - Absolute .gstrap manifest path to create at
 * @param {object} opts
 * @param {string} opts.starterId - A STARTERS registry id (e.g. 'graphite', 'orbit')
 * @param {string} [opts.projectName] - Defaults to `${starterId}test`
 * @param {string[]} [opts.selectedPages] - Narrows which pages get written
 *        (see src/main/starters/index.js#applyStarter); omitted = all pages
 * @returns {Promise<{pageNames: string[]}>} The created project's page names,
 *          in manifest order (page 0 is the tab opened by this helper)
 */
export async function createBundledStarterProject(appWindow, projectPath, { starterId, projectName, selectedPages } = {}) {
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 })
  return await appWindow.evaluate(async ({ path, starterId, projectName, selectedPages }) => {
    const config = { name: projectName || `${starterId}test`, location: path, templateId: starterId }
    // Only thread selectedPages through when the caller actually passed one —
    // an explicit [] (fails-open-to-all-pages regression pin) must still
    // reach project.new() as [], not get coerced away by omission.
    if (selectedPages !== undefined) config.selectedPages = selectedPages
    const project = await window.grapestrap.project.new(config)
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
    return { pageNames: project.pages.map(p => p.name) }
  }, { path: projectPath, starterId, projectName, selectedPages })
}

// Dismiss the first-run welcome modal for real: its .gstrap-modal-overlay
// spans the window and swallows pointer input until a button is clicked.
// Specs that drive everything through evaluate() never notice it — any spec
// using real mouse events must clear the overlay like a user would.
export async function dismissWelcome(appWindow) {
  await appWindow.click('.gstrap-modal-overlay [data-action="dismiss"]')
  await appWindow.waitForFunction(
    () => !document.querySelector('.gstrap-modal-overlay'), null, { timeout: 3_000 })
}
