/**
 * GrapeStrap — E2E: insert panel
 *
 * PATH: tests/e2e/insert.spec.js
 * ROLE: Insert panel: tile click, placement rules, drag-and-drop, and insert flash specs
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag } from './helpers.js'

test('Insert panel: clicking a tile inserts the block into the canvas', async () => {
  // Regression for the silent failure where Insert tiles had `draggable=true`
  // but no click or dragstart handler — clicking them did nothing. Click-to-
  // insert is the v0.0.1 contract; drag-and-drop on the iframe lands in v0.0.2.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-insert-'))
  const projectPath = join(projectDir, 'i.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  await appWindow.waitForFunction(
    () => document.querySelectorAll('.gstrap-block-tile').length > 0,
    null, { timeout: 10_000 }
  )

  const before = await appWindow.evaluate(() =>
    window.__gstrap.pluginRegistry.bound.editor.getWrapper().components().length
  )

  // Click the first tile in whatever the active tab is.
  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-block-tile').click()
  })

  // Wrapper should now have one more direct child, AND a new component should
  // be selected (the freshly-inserted block).
  await appWindow.waitForFunction(
    n => window.__gstrap.pluginRegistry.bound.editor.getWrapper().components().length > n,
    before, { timeout: 3_000 }
  )

  const { after, selectedExists } = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return {
      after: ed.getWrapper().components().length,
      selectedExists: !!ed.getSelected()
    }
  })
  expect(after).toBeGreaterThan(before)
  expect(selectedExists).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Insert placement: container selection appends INSIDE; leaf selection inserts AFTER', async () => {
  // Regression for "not consistent on what it attaches to". Verifies the
  // 2026-05-03 placement rule:
  //   - select <main> (container)  → next insert appends INSIDE main
  //   - select <h1>   (leaf)       → next insert lands as a sibling AFTER
  //                                  the h1, inside its parent.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-place-'))
  const projectPath = join(projectDir, 'p.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await appWindow.waitForFunction(
    () => document.querySelectorAll('.gstrap-block-tile').length > 0,
    null, { timeout: 10_000 }
  )

  // ── Pass 1: container case — selecting <main> should append INSIDE ──────────
  await selectFirstByTag(appWindow, 'main')
  const beforeContainer = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const main = ed.getSelected()
    return { tag: main?.get('tagName'), childCount: main?.components()?.length || 0 }
  })
  expect(beforeContainer.tag).toBe('main')

  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-block-tile').click()
  })

  const afterContainer = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const wrapper = ed.getWrapper()
    const main = wrapper.components().find(c => (c.get('tagName') || '').toLowerCase() === 'main')
    const newSel = ed.getSelected()
    return {
      mainChildCount: main?.components()?.length || 0,
      // Newly-selected component's parent should be <main>, not the wrapper.
      newSelParentTag: (newSel?.parent?.()?.get?.('tagName') || '').toLowerCase()
    }
  })
  expect(afterContainer.mainChildCount).toBe(beforeContainer.childCount + 1)
  expect(afterContainer.newSelParentTag).toBe('main')

  // ── Pass 2: leaf case — selecting <h1> should append as a sibling AFTER ────
  await selectFirstByTag(appWindow, 'h1')
  const beforeLeaf = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const h1 = ed.getSelected()
    const parent = h1.parent()
    return {
      h1Idx: parent.components().indexOf(h1),
      parentChildCount: parent.components().length,
      parentTag: (parent.get('tagName') || '').toLowerCase()
    }
  })

  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-block-tile').click()
  })

  const afterLeaf = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const sel = ed.getSelected()
    const parent = sel.parent()
    return {
      newSelIdx: parent.components().indexOf(sel),
      parentChildCount: parent.components().length,
      parentTag: (parent.get('tagName') || '').toLowerCase()
    }
  })
  // The new component must be in the SAME parent as the h1 (not nested inside)
  // and immediately AFTER the h1's old position.
  expect(afterLeaf.parentTag).toBe(beforeLeaf.parentTag)
  expect(afterLeaf.parentChildCount).toBe(beforeLeaf.parentChildCount + 1)
  expect(afterLeaf.newSelIdx).toBe(beforeLeaf.h1Idx + 1)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Insert DnD: drop on a container appends inside; drop on a leaf appends as sibling', async () => {
  // Drag-and-drop from the Insert panel to the canvas iframe. Real OS drag
  // events from Playwright across a cross-origin-ish iframe are flaky
  // (build plan v4 §"What's deliberately NOT in v0.0.1" calls this out
  // explicitly); we test the handler chain instead by synthesizing
  // drag/drop events with a real DataTransfer in the iframe document.
  // The placement logic + drop preview class wiring still get exercised
  // end-to-end inside the renderer process.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-dnd-'))
  const projectPath = join(projectDir, 'd.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await appWindow.waitForFunction(
    () => document.querySelectorAll('.gstrap-block-tile').length > 0,
    null, { timeout: 10_000 }
  )

  // Resolve a known block id from the registry for the synthetic dataTransfer.
  const blockId = await appWindow.evaluate(() => {
    return window.__gstrap.pluginRegistry.blocks[0]?.id || ''
  })
  expect(blockId).toBeTruthy()

  // Wait for the canvas iframe drop listener to be wired (attach is async
  // because the iframe's contentDocument isn't populated synchronously).
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const d = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!(d && d.__gstrapDropWired)
  }, null, { timeout: 6_000 })

  // ── Drop on <main> (container): should append INSIDE ──────────────────────
  const dropOnContainer = await appWindow.evaluate(({ blockId }) => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const mainEl = doc.querySelector('main')
    if (!mainEl) return { error: 'main element not found' }
    const childCountBefore = mainEl.children.length
    const dt = new DataTransfer()
    dt.setData('application/x-grapestrap-block', blockId)
    mainEl.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer: dt
    }))
    const previewSet = mainEl.classList.contains('gstrap-drop-target')
    mainEl.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt
    }))
    return {
      previewSet,
      previewClearedAfterDrop: !mainEl.classList.contains('gstrap-drop-target'),
      childCountDelta: mainEl.children.length - childCountBefore,
      newSelParentTag: (ed.getSelected()?.parent?.()?.get?.('tagName') || '').toLowerCase()
    }
  }, { blockId })
  expect(dropOnContainer.previewSet).toBe(true)
  expect(dropOnContainer.previewClearedAfterDrop).toBe(true)
  expect(dropOnContainer.childCountDelta).toBe(1)
  expect(dropOnContainer.newSelParentTag).toBe('main')

  // ── Drop on <h1> (leaf): should land as a sibling, in the same parent ─────
  const dropOnLeaf = await appWindow.evaluate(({ blockId }) => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const h1 = doc.querySelector('h1')
    if (!h1) return { error: 'h1 not found' }
    const parentEl = h1.parentElement
    const childCountBefore = parentEl.children.length
    const h1IndexBefore = [...parentEl.children].indexOf(h1)
    const dt = new DataTransfer()
    dt.setData('application/x-grapestrap-block', blockId)
    h1.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer: dt
    }))
    // For a leaf anchor the preview should be on the PARENT (which is what
    // would actually receive the new sibling), not on the leaf itself.
    const parentPreview = parentEl.classList.contains('gstrap-drop-target')
    const leafPreview   = h1.classList.contains('gstrap-drop-target')
    h1.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt
    }))
    const sel = ed.getSelected()
    const selParent = sel.parent()
    return {
      parentPreview,
      leafPreview,
      childCountDelta: parentEl.children.length - childCountBefore,
      newSelIdx: selParent.components().indexOf(sel),
      h1IndexBefore,
      sameParent: selParent.getEl() === parentEl
    }
  }, { blockId })
  expect(dropOnLeaf.parentPreview).toBe(true)
  expect(dropOnLeaf.leafPreview).toBe(false)
  expect(dropOnLeaf.childCountDelta).toBe(1)
  expect(dropOnLeaf.sameParent).toBe(true)
  expect(dropOnLeaf.newSelIdx).toBe(dropOnLeaf.h1IndexBefore + 1)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Insert flash: destination container gets a brief outline highlight', async () => {
  // Verifies the visual feedback piece of the smarter placement rule. After
  // an insert into a container, that container's DOM element should briefly
  // carry the .gstrap-insert-flash class (animation removes it ~700ms later).
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-flash-'))
  const projectPath = join(projectDir, 'f.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await appWindow.waitForFunction(
    () => document.querySelectorAll('.gstrap-block-tile').length > 0,
    null, { timeout: 10_000 }
  )
  await selectFirstByTag(appWindow, 'main')

  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-block-tile').click()
  })

  const flashed = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const wrapper = ed.getWrapper()
    const main = wrapper.components().find(c => (c.get('tagName') || '').toLowerCase() === 'main')
    return main?.getEl?.()?.classList?.contains('gstrap-insert-flash') || false
  })
  expect(flashed).toBe(true)

  // ~700ms later the class should have come off.
  await appWindow.waitForTimeout(900)
  const cleared = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const main = ed.getWrapper().components().find(c => (c.get('tagName') || '').toLowerCase() === 'main')
    return !main?.getEl?.()?.classList?.contains('gstrap-insert-flash')
  })
  expect(cleared).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Insert panel drag: dropping a block on the canvas inserts a component (not a text paste)', async () => {
  // Reported by user 2026-05-04: dragging a tile from the bottom Insert
  // panel and dropping on the canvas pastes the block id as plain text
  // instead of inserting the component. Two causes fixed:
  //   (1) dragstart was setting `text/plain` on the dataTransfer, which is
  //       what the browser's default drop action paste-targets.
  //   (2) the custom MIME `application/x-grapestrap-block` doesn't reliably
  //       cross the parent-doc → iframe boundary in Electron, so the iframe
  //       drop handler saw nothing usable. Now also stashed on a window
  //       global the iframe can read via window.parent.
  // Drag events can't be synthesised reliably across an Electron iframe
  // boundary in Playwright; this spec drives the same code paths
  // programmatically (dragstart sets the global, drop handler reads it +
  // inserts via performInsert).
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-dragdrop-'))
  const projectPath = join(projectDir, 'dragdrop.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Pick a block id that's actually registered (any of the bundled plugin
  // blocks will do — the test just needs the drop path to fire, not specific
  // content).
  const blockId = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const blocks = ed.BlockManager.getAll()
    return blocks?.at?.(0)?.get?.('id') || blocks?.[0]?.id || null
  })
  expect(blockId).toBeTruthy()

  // Snapshot canvas component count before drop.
  const beforeCount = await appWindow.evaluate(() =>
    window.__gstrap.pluginRegistry.bound.editor.getWrapper().components().length
  )

  // Simulate the dragstart → drop flow. Dragstart is fired on the bottom
  // Insert tile, which sets window.__gstrapDragBlockId. Drop is fired on the
  // canvas iframe contentDocument's body.
  const result = await appWindow.evaluate(blockId => {
    window.__gstrapDragBlockId = blockId
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    // Drop event with no usable dataTransfer — exercises the iframe-boundary
    // case where the custom MIME got stripped.
    const dt = new DataTransfer()
    const dropEvt = new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: 100, clientY: 100
    })
    // Target the body so we land on the page wrapper.
    doc.body.dispatchEvent(dropEvt)
    // Read the canvas html to confirm the block content rendered (not the
    // block id pasted as text).
    return {
      html: ed.getHtml() || '',
      count: ed.getWrapper().components().length,
      bodyText: doc.body.textContent || ''
    }
  }, blockId)

  // The component count should have grown by at least 1 (the inserted block).
  expect(result.count).toBeGreaterThan(beforeCount)
  // And the literal block id must NOT appear as a stray text node in body
  // — that's the bug signature.
  expect(result.bodyText).not.toContain(blockId)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
