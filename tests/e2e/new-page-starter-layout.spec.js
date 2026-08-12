/**
 * GrapeStrap — E2E: New Page dialog's starter-layout source
 *
 * PATH: tests/e2e/new-page-starter-layout.spec.js
 * ROLE: B3 coverage — dialogs/new-page.js's starter-aware grouped select and
 *       menu-router cmdNewPage's starter-layout dispatch (createPageFromLayout
 *       in panels/templates/manage.js). Project creation is modeled on
 *       graphite-starter.spec.js's createGraphiteProject helper; dialog
 *       driving (fill/selectOption/click, tab/dirty waits) follows
 *       multi-page.spec.js's "file:new-page command" spec. The blank-path
 *       regression pin at the bottom guards the OTHER half of the contract —
 *       that a starter-less project's dialog never grows an <optgroup>.
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-08-11
 */
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome, EXPECTED_PLUGIN_COUNT } from './helpers.js'

// Same seed pattern as graphite-starter.spec.js's createGraphiteProject —
// openSeedProject() hardcodes a blank project, so a starter project needs
// its own helper carrying templateId through to project.new().
async function createGraphiteProject(appWindow, projectPath) {
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 })
  await appWindow.evaluate(async path => {
    const project = await window.grapestrap.project.new({
      name: 'graphitetest', location: path, templateId: 'graphite'
    })
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
  }, projectPath)
}

test('Graphite project: New Page select groups the 5 starter layouts under an optgroup', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-newpage-'))
  const projectPath = join(projectDir, 'graphite.gstrap')

  const { app, appWindow } = await launch()
  await createGraphiteProject(appWindow, projectPath)

  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:new-page'))
  await appWindow.waitForSelector('.gstrap-prompt-card', { timeout: 3_000 })

  const groups = await appWindow.evaluate(() =>
    [...document.querySelectorAll('[data-np-template] optgroup')].map(g => ({
      label: g.label,
      values: [...g.querySelectorAll('option')].map(o => o.value)
    })))
  expect(groups).toHaveLength(1) // graphite has no master templates yet — templates group omitted
  expect(groups[0].values).toEqual([
    'layout:index', 'layout:elements', 'layout:left-sidebar', 'layout:right-sidebar', 'layout:no-sidebar'
  ])

  await appWindow.keyboard.press('Escape')
  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Picking layout:no-sidebar creates the page from that layout, opens it focused, and saves a fully-composed file', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-newpage-'))
  const projectPath = join(projectDir, 'graphite.gstrap')

  const { app, appWindow } = await launch()
  await createGraphiteProject(appWindow, projectPath)
  await dismissWelcome(appWindow) // real fill/click below needs the overlay gone

  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:new-page'))
  await appWindow.waitForSelector('.gstrap-prompt-card', { timeout: 3_000 })
  await appWindow.fill('[data-np-name]', 'sidebarless')
  await appWindow.selectOption('[data-np-template]', 'layout:no-sidebar')
  await appWindow.click('[data-np-ok]')

  // 5 starter pages + this new one.
  await appWindow.waitForFunction(
    () => window.__gstrap.projectState.current.pages.length === 6,
    null, { timeout: 5_000 }
  )
  await appWindow.waitForSelector('.gstrap-tab.is-active[data-tab="sidebarless"]', { timeout: 3_000 })
  // Distinctive marker from graphite.js's NO_SIDEBAR_BODY (`<h2>No Sidebar</h2>`)
  // — proves the canvas is showing the LAYOUT's body, not a blank/composed one.
  await appWindow.waitForFunction(
    () => /<h2[^>]*>No Sidebar<\/h2>/.test(window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || ''),
    null, { timeout: 5_000 }
  )

  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForFunction(
    () => window.__gstrap.projectState.snapshot().any === false,
    null, { timeout: 5_000 }
  )
  await app.close()

  // Disk: composeFullPageHtml stamped the project's vendored framework +
  // theme.css (manifest-level, applies to every page) plus this page's own
  // head.customScripts (main.js, copied from the layout by createPageFromLayout).
  const pageOnDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'sidebarless.html'), 'utf8')
  expect(pageOnDisk).toContain('href="assets/css/theme.css"')
  expect(pageOnDisk).toContain('assets/vendor/bootstrap/bootstrap.min.css')
  expect(pageOnDisk).toContain('src="assets/js/main.js"')
  expect(pageOnDisk).toContain('data-grpstr-script')
  expect(pageOnDisk).toMatch(/<h2[^>]*>No Sidebar<\/h2>/)

  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  const entry = manifest.pages.find(p => p.name === 'sidebarless')
  expect(entry).toBeTruthy()
  expect(entry.head.customScripts.map(s => s.src)).toContain('assets/js/main.js')
  expect(entry.head.title).toBe('No Sidebar — Graphite') // layout.title, not the page name fallback

  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('blank project: New Page select renders NO optgroups (starter-null regression pin)', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-newpage-blank-'))
  const projectPath = join(projectDir, 'blank.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:new-page'))
  await appWindow.waitForSelector('.gstrap-prompt-card', { timeout: 3_000 })

  const state = await appWindow.evaluate(() => {
    const select = document.querySelector('[data-np-template]')
    return {
      optgroupCount: select.querySelectorAll('optgroup').length,
      optionValues: [...select.querySelectorAll('option')].map(o => o.value)
    }
  })
  expect(state.optgroupCount).toBe(0)
  expect(state.optionValues).toEqual(['']) // "None — standalone page" only; blank project has no templates either

  await appWindow.keyboard.press('Escape')
  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
