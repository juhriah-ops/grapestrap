/**
 * GrapeStrap — E2E: starter templates
 *
 * PATH: tests/e2e/starter-templates.spec.js
 * ROLE: Wave 4 Starter Templates specs — the templateId path's shared
 *       contracts: blank-path regression pin, unknown-id fail-open, and the
 *       New Project dialog's starter option list. Per-starter disk/manifest
 *       assertions live in graphite-starter.spec.js / orbit-starter.spec.js /
 *       vista-starter.spec.js.
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 * UPDATED: 2026-08-19 — the Landing / Portfolio / Blog blocks went with the
 *          three first-wave starters when they were removed from the product.
 *          What they uniquely pinned was re-homed rather than dropped: the
 *          master-template CHROME-LOCK behaviour (Landing) now runs against a
 *          hand-seeded templated project in reorder.spec.js and
 *          editing-commands.spec.js (see helpers.js#seedTemplatedChromeProject).
 * UPDATED: 2026-08-19 — Vista added to the dialog's option-list pin (third
 *          bundled starter; its own disk/manifest coverage is in
 *          vista-starter.spec.js).
 *
 * Conventions per templates.spec.js: one launch per test, per-test mkdtemp
 * project dirs (self-cleaning via OS tmp), null-safe waitForFunction
 * predicates, constants threaded as evaluate args — no closure capture.
 */
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, EXPECTED_PLUGIN_COUNT } from './helpers.js'

// openSeedProject() hardcodes a blank project; starters need templateId, so
// this file carries its own seed helper (same waits, extra param threaded).
async function createStarterProject(appWindow, projectPath, templateId) {
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 })
  return await appWindow.evaluate(async ({ path, templateId }) => {
    const config = { name: 'startertest', location: path }
    if (templateId !== undefined) config.templateId = templateId
    const project = await window.grapestrap.project.new(config)
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
    return {
      pages: project.pages.map(p => ({ name: p.name, templateName: p.templateName })),
      templates: (project.templates || []).map(tp =>
        ({ name: tp.name, file: tp.file, regions: tp.regions, hasHtml: !!tp.html })),
      vendorDeps: project.manifest.vendorDeps || [],
      starter: project.manifest.metadata.starter || null
    }
  }, { path: projectPath, templateId })
}

const fileExists = p => fsp.access(p).then(() => true, () => false)

test('blank path unchanged: templateId omitted produces today\'s blank project (regression pin)', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-starter-'))
  const projectPath = join(projectDir, 'blank.gstrap')

  const { app, appWindow } = await launch()
  const shape = await createStarterProject(appWindow, projectPath, undefined)
  expect(shape.pages).toEqual([{ name: 'index', templateName: null }])
  expect(shape.templates).toEqual([])
  expect(shape.vendorDeps).toEqual([])
  expect(shape.starter).toBeNull() // no metadata.starter key for blank

  expect(await fileExists(join(projectDir, 'site', 'templates'))).toBe(false)
  expect(await fileExists(join(projectDir, 'site', 'assets', 'vendor'))).toBe(false)
  const pageOnDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')
  expect(pageOnDisk).toContain('Welcome to your new GrapeStrap project')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('unknown starter id fails open to a blank project (no throw)', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-starter-'))
  const projectPath = join(projectDir, 'unknown.gstrap')

  const { app, appWindow } = await launch()
  const shape = await createStarterProject(appWindow, projectPath, 'no-such-starter')
  // Promise resolved — project created, not null/throw.
  expect(shape.pages).toEqual([{ name: 'index', templateName: null }])
  expect(shape.templates).toEqual([])
  expect(shape.vendorDeps).toEqual([])
  expect(await fileExists(join(projectDir, 'site', 'templates'))).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('New Project dialog: starter select populated, Blank default, Esc cancels', async () => {
  // No project needed; drives the renderer dialog only. The dialog is never
  // submitted, so the native parent-folder picker is never reached.
  const { app, appWindow } = await launch()
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 })

  // Fire-and-forget: cmdNewProject awaits the dialog promise.
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'file:new-project')
  })
  await appWindow.waitForSelector('[data-npr-starter]')

  const state = await appWindow.evaluate(() => {
    const select = document.querySelector('[data-npr-starter]')
    const input = document.querySelector('[data-npr-name]')
    return {
      value: select.value,
      options: [...select.options].map(o => o.value),
      name: input.value
    }
  })
  expect(state.value).toBe('blank')
  expect(state.options).toEqual(['blank', 'graphite', 'orbit', 'vista'])
  expect(state.name).toBe('My Project')

  await appWindow.keyboard.press('Escape')
  await appWindow.waitForFunction(
    () => document.querySelector('[data-npr-starter]') === null,
    null, { timeout: 5_000 })

  await app.close()
})
