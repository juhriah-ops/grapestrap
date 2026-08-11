/**
 * GrapeStrap — E2E: insert drop zones + Alt+Click before-insert
 *
 * PATH: tests/e2e/insert-zones.spec.js
 * ROLE: Chunk A2 (drag-over zones + insertion line) and chunk A3 (Alt+Click
 *       inserts before the anchor) coverage that doesn't fit insert.spec.js's
 *       existing container/leaf-middle cases: a container's top-EDGE zone
 *       (not its middle), the wrapper/no-anchor "above the first child"
 *       case, the insertion line's visible/hidden lifecycle over the
 *       wrapper, and Alt+Click with and without a selection.
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-08-11
 *
 * The seed project (project-manager.js renderBlankIndex) is a single <main>
 * at the wrapper's top level, containing an <h1> and a <p> — so `main` is
 * always wrapper.components().at(0) going in, which every index assertion
 * below is anchored to.
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag } from './helpers.js'

async function setUp() {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-zones-'))
  const projectPath = join(projectDir, 'z.gstrap')
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await appWindow.waitForFunction(
    () => document.querySelectorAll('.gstrap-block-tile').length > 0,
    null, { timeout: 10_000 }
  )
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const d = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!(d && d.__gstrapDropWired)
  }, null, { timeout: 6_000 })
  const blockId = await appWindow.evaluate(() => window.__gstrap.pluginRegistry.blocks[0]?.id || '')
  expect(blockId).toBeTruthy()
  return { app, appWindow, projectDir, blockId }
}

async function tearDown(app, projectDir) {
  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
}

test('Drop zone: top-edge of <main> lands the new component BEFORE main, at main\'s old wrapper index', async () => {
  const { app, appWindow, projectDir, blockId } = await setUp()

  const result = await appWindow.evaluate(({ blockId }) => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const wrapper = ed.getWrapper()
    const mainEl = doc.querySelector('main')
    const mainComponent = wrapper.components().find(c => (c.get('tagName') || '').toLowerCase() === 'main')
    const mainIdxBefore = wrapper.components().indexOf(mainComponent)

    const rect = mainEl.getBoundingClientRect()
    // 2px inside the top edge — inside the clamped 8-24px edge band no
    // matter how tall <main> renders (min edge is 8px), so this always
    // resolves to the 'before' zone, never 'inside'.
    const clientX = rect.left + rect.width / 2
    const clientY = rect.top + 2

    const dt = new DataTransfer()
    dt.setData('application/x-grapestrap-block', blockId)
    mainEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }))
    mainEl.dispatchEvent(new DragEvent('drop',      { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }))

    const wrapperAfter = ed.getWrapper().components()
    const newSel = ed.getSelected()
    const mainIdxAfter = wrapperAfter.indexOf(mainComponent)
    return {
      newSelParentIsWrapper: newSel.parent() === wrapper,
      newSelIdx: wrapperAfter.indexOf(newSel),
      mainIdxBefore,
      mainIdxAfter
    }
  }, { blockId })

  expect(result.newSelParentIsWrapper).toBe(true)
  expect(result.newSelIdx).toBe(result.mainIdxBefore)
  expect(result.mainIdxAfter).toBe(result.mainIdxBefore + 1)

  await tearDown(app, projectDir)
})

test('Drop zone: dropping above the first wrapper child lands the new component at index 0', async () => {
  const { app, appWindow, projectDir, blockId } = await setUp()

  const result = await appWindow.evaluate(({ blockId }) => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const mainEl = doc.querySelector('main')
    const rect = mainEl.getBoundingClientRect()
    // Comfortably above the first (and only) top-level child's rect — the
    // drop target is doc.body itself (componentForElement resolves body
    // straight to the wrapper), so this exercises the wrapper/no-anchor
    // branch of resolvePlacement, not main's own edge zone.
    const clientY = rect.top - 50
    const clientX = rect.left + rect.width / 2

    const dt = new DataTransfer()
    dt.setData('application/x-grapestrap-block', blockId)
    doc.body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }))
    doc.body.dispatchEvent(new DragEvent('drop',      { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }))

    const wrapperAfter = ed.getWrapper().components()
    const newSel = ed.getSelected()
    return { newSelIdx: wrapperAfter.indexOf(newSel) }
  }, { blockId })

  expect(result.newSelIdx).toBe(0)

  await tearDown(app, projectDir)
})

test('Drop zone: the insertion line is visible during wrapper dragover and gone after drop', async () => {
  const { app, appWindow, projectDir, blockId } = await setUp()

  const result = await appWindow.evaluate(({ blockId }) => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const mainEl = doc.querySelector('main')
    const rect = mainEl.getBoundingClientRect()
    const clientY = rect.top - 50
    const clientX = rect.left + rect.width / 2

    const dt = new DataTransfer()
    dt.setData('application/x-grapestrap-block', blockId)
    doc.body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }))
    const visibleDuringHover = doc.querySelector('.gstrap-insert-line.is-visible') !== null

    doc.body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }))
    const goneAfterDrop = doc.querySelector('.gstrap-insert-line.is-visible') === null

    return { visibleDuringHover, goneAfterDrop }
  }, { blockId })

  expect(result.visibleDuringHover).toBe(true)
  expect(result.goneAfterDrop).toBe(true)

  await tearDown(app, projectDir)
})

test('Alt+Click, nothing selected: inserts at the top of the page (wrapper index 0)', async () => {
  const { app, appWindow, projectDir } = await setUp()

  // Nothing selected coming out of openSeedProject, but be explicit — a
  // stray selection here would silently change which branch of
  // resolvePlacement this test exercises.
  await appWindow.evaluate(() => {
    window.__gstrap.pluginRegistry.bound.editor.select()
  })

  const result = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const wrapper = ed.getWrapper()
    const mainComponent = wrapper.components().find(c => (c.get('tagName') || '').toLowerCase() === 'main')
    const mainIdxBefore = wrapper.components().indexOf(mainComponent)

    const tile = document.querySelector('.gstrap-block-tile')
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }))

    const wrapperAfter = ed.getWrapper().components()
    const newSel = ed.getSelected()
    return {
      newSelIdx: wrapperAfter.indexOf(newSel),
      mainIdxAfter: wrapperAfter.indexOf(mainComponent),
      mainIdxBefore
    }
  })

  expect(result.newSelIdx).toBe(0)
  expect(result.mainIdxAfter).toBe(result.mainIdxBefore + 1)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Alt+Click with <main> selected: inserts before main, not inside/after it', async () => {
  const { app, appWindow, projectDir } = await setUp()

  await selectFirstByTag(appWindow, 'main')

  const result = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const wrapper = ed.getWrapper()
    const mainComponent = ed.getSelected()
    const mainIdxBefore = wrapper.components().indexOf(mainComponent)

    const tile = document.querySelector('.gstrap-block-tile')
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }))

    const wrapperAfter = ed.getWrapper().components()
    const newSel = ed.getSelected()
    return {
      newSelParentIsWrapper: newSel.parent() === wrapper,
      newSelIdx: wrapperAfter.indexOf(newSel),
      mainIdxBefore,
      mainIdxAfter: wrapperAfter.indexOf(mainComponent)
    }
  })

  expect(result.newSelParentIsWrapper).toBe(true)
  expect(result.newSelIdx).toBe(result.mainIdxBefore)
  expect(result.mainIdxAfter).toBe(result.mainIdxBefore + 1)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
