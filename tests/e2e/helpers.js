/**
 * GrapeStrap — E2E shared helpers
 *
 * PATH: tests/e2e/helpers.js
 * ROLE: Launch/seed/select/dismiss helpers + shared constants for the domain spec files (split out of smoke.spec.js in Wave 0 of the v0.1.0 campaign)
 * DEPENDS: @playwright/test (_electron)
 * CREATED: 2026-07-12
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

export async function launch(extraEnv = {}) {
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

// Dismiss the first-run welcome modal for real: its .gstrap-modal-overlay
// spans the window and swallows pointer input until a button is clicked.
// Specs that drive everything through evaluate() never notice it — any spec
// using real mouse events must clear the overlay like a user would.
export async function dismissWelcome(appWindow) {
  await appWindow.click('.gstrap-modal-overlay [data-action="dismiss"]')
  await appWindow.waitForFunction(
    () => !document.querySelector('.gstrap-modal-overlay'), null, { timeout: 3_000 })
}
