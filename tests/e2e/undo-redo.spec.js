// =============================================================
// PATH: tests/e2e/undo-redo.spec.js
// ROLE: Wave 0 coverage-hole spec — first e2e coverage of undo/redo:
//       menu-command undo + API redo content round-trip, dirty-flag
//       semantics, the "class group write = ONE undo entry" contract that
//       Wave 2 drag-to-resize builds on (applyGroup strip-then-add = one
//       Backbone setClass write), and a cross-tab contamination guard.
// DEPENDS: ./helpers.js (launch, openSeedProject, selectFirstByTag)
// CREATED: 2026-07-12
// =============================================================
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag } from './helpers.js'

const canvasHtml = appWindow => appWindow.evaluate(
  () => window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || '')

const selectedClasses = appWindow => appWindow.evaluate(
  () => window.__gstrap.pluginRegistry.bound.editor.getSelected().getClasses())

test('Undo/redo: canvas edit round-trips content; undo does not clean the dirty flag', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-undo-'))
  const projectPath = join(projectDir, 'undo.gstrap')
  const SENTINEL = 'undo-sentinel-p1'

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Edit: append a component → component:add → content-changed → page dirty.
  await appWindow.evaluate(s => {
    window.__gstrap.pluginRegistry.bound.editor.getWrapper()
      .append(`<p data-testid="u1">${s}</p>`)
  }, SENTINEL)
  expect(await canvasHtml(appWindow)).toContain(SENTINEL)
  expect(await appWindow.evaluate(
    () => [...window.__gstrap.projectState.dirtyPages])).toContain('index')

  // Undo through the REAL command route (menu-router edit:undo → UndoManager).
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'edit:undo'))
  await appWindow.waitForFunction(
    s => !(window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || '').includes(s),
    SENTINEL, { timeout: 3_000 }
  )
  // Documented semantics: undo re-fires content events — the page STAYS dirty.
  // (Save is what cleans; undo is just another edit as far as dirt goes.)
  expect(await appWindow.evaluate(
    () => [...window.__gstrap.projectState.dirtyPages])).toContain('index')

  // Redo through the UndoManager API (both routes now covered).
  await appWindow.evaluate(() => window.__gstrap.pluginRegistry.bound.editor.UndoManager.redo())
  await appWindow.waitForFunction(
    s => (window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || '').includes(s),
    SENTINEL, { timeout: 3_000 }
  )

  // Save the redone state — sentinel lands on disk…
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForFunction(
    () => window.__gstrap.projectState.snapshot().any === false, null, { timeout: 5_000 })
  expect(await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8'))
    .toContain(SENTINEL)

  // …then undo + save again — the reverted state lands on disk. Full loop.
  await appWindow.evaluate(() => window.__gstrap.pluginRegistry.bound.editor.UndoManager.undo())
  await appWindow.waitForFunction(
    s => !(window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || '').includes(s),
    SENTINEL, { timeout: 3_000 }
  )
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForFunction(
    () => window.__gstrap.projectState.snapshot().any === false, null, { timeout: 5_000 })
  expect(await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8'))
    .not.toContain(SENTINEL)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Undo/redo: a Style Manager group write undoes as ONE entry', async () => {
  // The contract Wave 2 drag-to-resize depends on: applyGroup strips every
  // class in the group then adds the new one via a SINGLE setClass() — one
  // Backbone write, one undo entry. If that ever becomes two entries, one
  // undo would leave a stripped intermediate state; these asserts catch it.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-undo2-'))
  const projectPath = join(projectDir, 'undo2.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')
  // Spacing is the default-open Style Manager section.
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="spacing"] .gstrap-sm-body:not([hidden])', { timeout: 5_000 })

  // Seed h1 ships class="display-5 fw-bold" — the pre-click reference set.
  const before = await selectedClasses(appWindow)
  expect(before).toEqual(expect.arrayContaining(['display-5', 'fw-bold']))

  // Group write #1: margin scale m-3.
  await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="spacing"] .gstrap-sm-body')
    body.querySelector('[data-scales-for="m"] [data-scale="3"]').click()
  })
  expect(await selectedClasses(appWindow)).toContain('m-3')

  // ONE undo restores the exact pre-click set — no partial strip state.
  await appWindow.evaluate(() => window.__gstrap.pluginRegistry.bound.editor.UndoManager.undo())
  expect([...(await selectedClasses(appWindow))].sort()).toEqual([...before].sort())

  // ONE redo brings it back.
  await appWindow.evaluate(() => window.__gstrap.pluginRegistry.bound.editor.UndoManager.redo())
  expect(await selectedClasses(appWindow)).toContain('m-3')

  // Group write #2 — the sharper case: fw-semibold EVICTS the seed's fw-bold
  // (mutually-exclusive weight group). Strip + add in one write means ONE
  // undo must simultaneously restore fw-bold AND remove fw-semibold.
  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-sm-section[data-sp="text"] [data-toggle="text"]').click()
  })
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="text"] .gstrap-sm-body:not([hidden])', { timeout: 3_000 })
  await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="text"] .gstrap-sm-body')
    body.querySelector('[data-weight="semibold"]').click()
  })
  let cls = await selectedClasses(appWindow)
  expect(cls).toContain('fw-semibold')
  expect(cls).not.toContain('fw-bold')

  await appWindow.evaluate(() => window.__gstrap.pluginRegistry.bound.editor.UndoManager.undo())
  cls = await selectedClasses(appWindow)
  expect(cls).toContain('fw-bold')
  expect(cls).not.toContain('fw-semibold')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Undo/redo: undo does not leak content across page tabs', async () => {
  // ⚠ BUG-SURFACING SPEC (see PLAN.md). Tab swap loads pages via a bare
  // editor.setComponents with NO UndoManager isolation (canvas/index.js
  // swapToTab → loadHtmlIntoCanvas). If GrapesJS records that reset, undoing
  // right after a tab switch restores the PREVIOUS page's component tree onto
  // the current tab — and the next save corrupts the file on disk. Surfacing
  // exactly this before Wave 2 builds Master Templates on multi-page is the
  // point of this Wave 0 item. If this fails: fix swapToTab (um.stop/start
  // fence + um.clear around loadHtmlIntoCanvas), don't loosen the assert.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-undo3-'))
  const projectPath = join(projectDir, 'undo3.gstrap')
  const SENT_B = 'crosstab-sentinel-b'

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Second page, becomes the active tab.
  await appWindow.evaluate(() => {
    const { projectState, pageState } = window.__gstrap
    projectState.current.pages.push({
      name: 'about', file: 'pages/about.html', templateName: null, regions: {},
      head: { title: 'about', description: '' },
      html: '<main class="container py-5"><h1>about</h1></main>\n'
    })
    projectState.markPageDirty('about')
    pageState.open('about')
  })
  await appWindow.waitForFunction(
    () => /<h1[^>]*>about<\/h1>/.test(window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || ''),
    null, { timeout: 5_000 }
  )

  // Undoable edit on page B, then switch to index (B captured on the way out).
  await appWindow.evaluate(s => {
    window.__gstrap.pluginRegistry.bound.editor.getWrapper()
      .append(`<p data-testid="xtab">${s}</p>`)
  }, SENT_B)
  await appWindow.evaluate(() => window.__gstrap.pageState.focus('index'))
  await appWindow.waitForFunction(
    () => (window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || '').includes('tagtest'),
    null, { timeout: 5_000 }
  )

  // Undo while the index tab is active.
  await appWindow.evaluate(() => window.__gstrap.pluginRegistry.bound.editor.UndoManager.undo())

  // Invariant #1: page B's content must not appear on the index canvas.
  expect(await canvasHtml(appWindow)).not.toContain(SENT_B)

  // Invariant #2: save must not cross-write the files. cmdSave flushes the
  // ACTIVE tab's canvas into its page before writing — if undo restored B's
  // tree here, index.html would swallow B's content on disk.
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForFunction(
    () => window.__gstrap.projectState.snapshot().any === false, null, { timeout: 5_000 })
  await app.close()

  const indexOnDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')
  const aboutOnDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'about.html'), 'utf8')
  expect(indexOnDisk).not.toContain(SENT_B)
  expect(indexOnDisk).toContain('tagtest')
  expect(aboutOnDisk).toContain(SENT_B)

  await fsp.rm(projectDir, { recursive: true, force: true })
})
