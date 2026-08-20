/**
 * GrapeStrap — E2E shared helpers
 *
 * PATH: tests/e2e/helpers.js
 * ROLE: Launch/seed/select/dismiss helpers + shared constants for the domain spec files (split out of smoke.spec.js in Wave 0 of the v0.1.0 campaign)
 * DEPENDS: @playwright/test (_electron)
 * CREATED: 2026-07-12
 * UPDATED: 2026-08-19 — added seedTemplatedChromeProject, the replacement
 *          fixture for the specs that used to reach for the 'landing' starter
 *          purely to get LOCKED master-template chrome (reorder.spec.js,
 *          editing-commands.spec.js). The three first-wave starters were
 *          removed from the product and no bundled starter ships a master
 *          template any more, so the fixture is built here instead.
 * UPDATED: 2026-08-18 — selectFirstByTag returns the tag it selected (or
 *          null), so a spec can assert it actually hit something instead of
 *          silently continuing with no selection.
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

/**
 * Select the first component with the given tag, in document order.
 *
 * @param {import('@playwright/test').Page} appWindow
 * @param {string} tag - Lower-case tag name to look for
 * @returns {Promise<string|null>} the tag that was selected, or null when the
 *          page has no such element and the selection was left untouched.
 *          Worth checking in any spec whose later steps need a selection: a
 *          miss used to be silent, and the failure then surfaced far away as
 *          an empty panel (cascade-jump.spec.js hunting an <h1> the Graphite
 *          starter does not have).
 */
export async function selectFirstByTag(appWindow, tag) {
  return await appWindow.evaluate(t => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const wrapper = ed.getWrapper()
    function find(c) {
      if ((c.get('tagName') || '').toLowerCase() === t) return c
      for (const k of c.components()) { const r = find(k); if (r) return r }
      return null
    }
    const found = find(wrapper)
    if (!found) return null
    ed.select(found)
    return t
  }, tag)
}

/** True if `path` exists on disk, false for any access error (ENOENT etc). */
export const fileExists = p => fsp.access(p).then(() => true, () => false)

// Master chrome + one editable region, shaped exactly like what the retired
// 'landing' starter used to scaffold: a <header> and a <footer> that the lock
// path owns, wrapped around a region whose own content stays free. The <h1>
// lives INSIDE the region and nowhere else, so a spec can select it and know
// it got free content rather than chrome; the chrome headings are <h2>/<h6>
// for the same reason.
const TEMPLATED_CHROME_HTML = [
  '<header class="container py-3"><h2>Framed Site</h2></header>',
  '<main class="container py-5" data-grpstr-region="content">',
  '  <h1>Headline in the region</h1>',
  '  <p>Body copy in the region.</p>',
  '</main>',
  '<footer class="container py-3"><h6>© Framed Site</h6></footer>'
].join('\n')

/**
 * Seed a blank project, then build a MASTER-TEMPLATE PAGE inside it and leave
 * that page's tab open — the fixture for anything that needs locked template
 * chrome (lock flags on header/footer, wrapper droppable:false on a templated
 * page). Replaces the old "create a project from the 'landing' starter" trick:
 * no bundled starter ships a master template any more, so the template is
 * authored here through the same public test surface templates.spec.js drives
 * (window.__gstrap.templates), which is also the surface a user's own
 * Templates-panel workflow goes through.
 *
 * Waits until the composed page is live in the canvas, so the caller can
 * select components immediately.
 *
 * @param {import('@playwright/test').Page} appWindow
 * @param {string} projectPath - Absolute .gstrap manifest path to create at
 * @param {object} [opts]
 * @param {string} [opts.tplName='site']   - Master template name
 * @param {string} [opts.pageName='framed'] - Page built from that template
 * @returns {Promise<void>}
 * @throws {Error} inside the page context if the templates test surface is
 *         missing or rejects the seed — a silent no-op here would surface far
 *         away as "the chrome isn't locked", which is the wrong bug to chase.
 */
export async function seedTemplatedChromeProject(appWindow, projectPath, { tplName = 'site', pageName = 'framed' } = {}) {
  await openSeedProject(appWindow, projectPath)
  await appWindow.evaluate(({ tplName, pageName, tplHtml }) => {
    const api = window.__gstrap?.templates
    if (!api) throw new Error('window.__gstrap.templates missing')
    if (!api.createTemplate(tplName, tplHtml)) throw new Error(`createTemplate rejected "${tplName}"`)
    if (!api.createPage(pageName, tplName)) throw new Error(`createPage rejected "${pageName}"`)
  }, { tplName, pageName, tplHtml: TEMPLATED_CHROME_HTML })
  // createPage opens the new page's tab; wait for the composed body to land.
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('[data-grpstr-region="content"]')
  }, null, { timeout: 10_000 })
}

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
