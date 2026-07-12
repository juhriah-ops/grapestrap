// =============================================================
// PATH: tests/e2e/multi-page.spec.js
// ROLE: Wave 0 coverage-hole spec — first e2e coverage of a 2nd page:
//       file:new-page command path, tab switching with capture-on-switch,
//       per-page dirty state, save/reopen round-trip, close-tab-is-not-delete.
//       Pre-Wave-2 safety net: Master Templates builds on multi-page.
// DEPENDS: ./helpers.js (launch, openSeedProject, dismissWelcome)
// CREATED: 2026-07-12
// =============================================================
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome, EXPECTED_PLUGIN_COUNT } from './helpers.js'

// Insert a second page exactly the way cmdNewPage does (menu-router.js:190-201)
// minus the text-prompt dialog. The prompt path itself is covered by the first
// test; the rest of the file uses this to keep launches lean and deterministic.
async function insertSecondPage(appWindow, name = 'about') {
  await appWindow.evaluate(pageName => {
    const { projectState, pageState } = window.__gstrap
    projectState.current.pages.push({
      name: pageName,
      file: `pages/${pageName}.html`,
      templateName: null,
      regions: {},
      head: { title: pageName, description: '' },
      html: `<main class="container py-5"><h1>${pageName}</h1></main>\n`
    })
    projectState.markPageDirty(pageName)
    pageState.open(pageName)
  }, name)
  await appWindow.waitForFunction(
    n => new RegExp(`<h1[^>]*>${n}</h1>`).test(
      window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || ''),
    name, { timeout: 5_000 }
  )
}

const saveAndWaitClean = async appWindow => {
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForFunction(
    () => window.__gstrap.projectState.snapshot().any === false,
    null, { timeout: 5_000 }
  )
}

test('Multi-page: file:new-page command → prompt → page created, tab opened, dirty until save', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-mpage-'))
  const projectPath = join(projectDir, 'mpage.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  // Real mouse/keyboard below — the first-run welcome overlay spans the window
  // and swallows pointer input until actually dismissed.
  await dismissWelcome(appWindow)

  // Drive the REAL command path: menu-router cmdNewPage → text-prompt dialog.
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:new-page'))
  await appWindow.waitForSelector('.gstrap-prompt-card', { timeout: 3_000 })
  await appWindow.fill('.gstrap-prompt-input', 'about')
  await appWindow.click('.gstrap-prompt-actions [data-action="ok"]')

  // Page lands in the manifest, the tab opens focused, canvas shows its html.
  await appWindow.waitForFunction(
    () => window.__gstrap.projectState.current.pages.length === 2,
    null, { timeout: 5_000 }
  )
  await appWindow.waitForSelector('.gstrap-tab.is-active[data-tab="about"]', { timeout: 3_000 })
  await appWindow.waitForFunction(
    () => /<h1[^>]*>about<\/h1>/.test(window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || ''),
    null, { timeout: 5_000 }
  )

  // Dirty until saved: projectState set + file-manager row dot.
  const dirty = await appWindow.evaluate(() => [...window.__gstrap.projectState.dirtyPages])
  expect(dirty).toContain('about')
  await appWindow.waitForSelector('.gstrap-fm-item.is-dirty[data-fm-page="about"]', { timeout: 3_000 })

  await saveAndWaitClean(appWindow)
  await app.close()

  // Disk contract: page file is a real standalone document; manifest lists both
  // pages with their site-relative file paths.
  const aboutOnDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'about.html'), 'utf8')
  expect(aboutOnDisk).toContain('<h1>about</h1>')
  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(manifest.pages.map(p => p.name)).toEqual(['index', 'about'])
  expect(manifest.pages[1].file).toBe('pages/about.html')

  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Multi-page: edits on both pages survive tab switches, save, and reopen', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-mpage2-'))
  const projectPath = join(projectDir, 'mpage2.gstrap')
  const SENT_A = '<section data-testid="mp-a">index-sentinel-a</section>'
  const SENT_B = '<section data-testid="mp-b">about-sentinel-b</section>'

  // ── Pass 1: edit both pages across tab switches, save ──────────────────────
  {
    const { app, appWindow } = await launch()
    await openSeedProject(appWindow, projectPath)
    await insertSecondPage(appWindow, 'about')

    // Edit page B (active tab).
    await appWindow.evaluate(html => {
      window.__gstrap.pluginRegistry.bound.editor.setComponents(html)
    }, SENT_B)

    // Switch to index via the tab bar's delegated click handler; the canvas
    // panel captures the outgoing content back into projectState on switch.
    await appWindow.evaluate(() => document.querySelector('.gstrap-tab[data-tab="index"]').click())
    await appWindow.waitForFunction(
      () => (window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || '').includes('tagtest'),
      null, { timeout: 5_000 }
    )
    expect(await appWindow.evaluate(
      () => window.__gstrap.projectState.getPage('about').html
    )).toContain('about-sentinel-b')

    // Edit index, switch back to B — B's edit must still be on the canvas.
    await appWindow.evaluate(html => {
      window.__gstrap.pluginRegistry.bound.editor.setComponents(html)
    }, SENT_A)
    await appWindow.evaluate(() => document.querySelector('.gstrap-tab[data-tab="about"]').click())
    await appWindow.waitForFunction(
      () => (window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || '').includes('about-sentinel-b'),
      null, { timeout: 5_000 }
    )
    expect(await appWindow.evaluate(
      () => window.__gstrap.projectState.getPage('index').html
    )).toContain('index-sentinel-a')

    await saveAndWaitClean(appWindow)
    await app.close()
  }

  // Disk: each page file holds its own sentinel; manifest intact.
  const indexOnDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')
  const aboutOnDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'about.html'), 'utf8')
  expect(indexOnDisk).toContain('index-sentinel-a')
  expect(indexOnDisk).not.toContain('about-sentinel-b')
  expect(aboutOnDisk).toContain('about-sentinel-b')
  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(manifest.pages.map(p => p.name)).toEqual(['index', 'about'])

  // ── Pass 2: fresh launch, reopen, both pages intact in memory + canvas ─────
  {
    const { app, appWindow } = await launch()
    // launch() only waits for the eventBus; the editor binds during plugin
    // boot. Wait for full boot (suite convention) before driving the canvas.
    await appWindow.waitForFunction(
      n => window.__gstrap?.pluginRegistry?.activated?.length === n,
      EXPECTED_PLUGIN_COUNT, { timeout: 15_000 }
    )
    const htmlByName = await appWindow.evaluate(async path => {
      const project = await window.grapestrap.project.open(path)
      const { projectState } = window.__gstrap
      projectState.set(project)
      return Object.fromEntries(project.pages.map(p => [p.name, p.html]))
    }, projectPath)
    expect(htmlByName.index).toContain('index-sentinel-a')
    expect(htmlByName.about).toContain('about-sentinel-b')

    await appWindow.evaluate(() => window.__gstrap.pageState.open('about'))
    await appWindow.waitForFunction(
      () => (window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || '').includes('about-sentinel-b'),
      null, { timeout: 5_000 }
    )
    await app.close()
  }

  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Multi-page: closing a page tab does not delete the page', async () => {
  // Pins the current contract: the tab X (and middle-click) closes the TAB
  // only — the page stays in the manifest, the file manager, and on disk.
  // There is deliberately no page-deletion feature yet (see PLAN.md
  // "needs app support"); this spec keeps Wave-2 page work honest about it.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-mpage3-'))
  const projectPath = join(projectDir, 'mpage3.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await insertSecondPage(appWindow, 'about')

  // Close the about tab via its X (delegated handler in tabs.js).
  await appWindow.evaluate(() => document.querySelector('.gstrap-tab-x[data-tab-close="about"]').click())
  await appWindow.waitForFunction(
    () => window.__gstrap.pageState.tabs.length === 1,
    null, { timeout: 3_000 }
  )

  // Page survives in memory and in the file-manager listing.
  expect(await appWindow.evaluate(
    () => window.__gstrap.projectState.current.pages.map(p => p.name)
  )).toEqual(['index', 'about'])
  expect(await appWindow.evaluate(
    () => !!document.querySelector('.gstrap-fm-item[data-fm-page="about"]')
  )).toBe(true)

  await saveAndWaitClean(appWindow)
  await app.close()

  // ...and on disk after save.
  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(manifest.pages.map(p => p.name)).toEqual(['index', 'about'])
  await fsp.access(join(projectDir, 'site', 'pages', 'about.html'))

  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Multi-page: dirty tracking is per-page across tabs', async () => {
  // NOTE: asserts via projectState.dirtyPages + file-manager rows. The tab
  // bar's own dirty dot (tab.dirty in tabs.js) is un-wired dead UI today —
  // documented in PLAN.md, deliberately NOT asserted here.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-mpage4-'))
  const projectPath = join(projectDir, 'mpage4.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await insertSecondPage(appWindow, 'about')

  // Clean baseline.
  await saveAndWaitClean(appWindow)
  expect(await appWindow.evaluate(
    () => document.querySelectorAll('.gstrap-fm-item.is-dirty').length
  )).toBe(0)

  // Edit page B only (active tab) → only B dirty.
  await appWindow.evaluate(() => {
    window.__gstrap.pluginRegistry.bound.editor.getWrapper()
      .append('<p data-testid="dirty-b">b-edit</p>')
  })
  await appWindow.waitForSelector('.gstrap-fm-item.is-dirty[data-fm-page="about"]', { timeout: 3_000 })
  let dirty = await appWindow.evaluate(() => [...window.__gstrap.projectState.dirtyPages])
  expect(dirty).toEqual(['about'])
  expect(await appWindow.evaluate(
    () => !!document.querySelector('.gstrap-fm-item.is-dirty[data-fm-page="index"]')
  )).toBe(false)

  // Switch to index, edit → both dirty.
  await appWindow.evaluate(() => window.__gstrap.pageState.focus('index'))
  await appWindow.waitForFunction(
    () => (window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || '').includes('tagtest'),
    null, { timeout: 5_000 }
  )
  await appWindow.evaluate(() => {
    window.__gstrap.pluginRegistry.bound.editor.getWrapper()
      .append('<p data-testid="dirty-a">a-edit</p>')
  })
  await appWindow.waitForSelector('.gstrap-fm-item.is-dirty[data-fm-page="index"]', { timeout: 3_000 })
  dirty = await appWindow.evaluate(() => [...window.__gstrap.projectState.dirtyPages])
  expect(dirty.sort()).toEqual(['about', 'index'])

  // Save clears everything.
  await saveAndWaitClean(appWindow)
  expect(await appWindow.evaluate(
    () => document.querySelectorAll('.gstrap-fm-item.is-dirty').length
  )).toBe(0)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
