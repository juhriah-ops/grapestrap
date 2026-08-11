/**
 * GrapeStrap — E2E: insert panel
 *
 * PATH: tests/e2e/insert.spec.js
 * ROLE: Insert panel: tile click, placement rules, drag-and-drop, and insert flash specs
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 * UPDATED: 2026-08-11 — DnD synthetic events now carry real clientX/clientY
 *          (chunk A2 replaced coordinate-agnostic placement with drop
 *          zones); leaf-anchor preview assertions moved from the dashed
 *          .gstrap-drop-target outline to the new .gstrap-insert-line
 *          (leaves no longer get the dashed outline — see
 *          editor/placement.js); added a wrapper-landing flash case and a
 *          body-drop index assertion. Alt+Click zone coverage lives in the
 *          new tests/e2e/insert-zones.spec.js, not here.
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
  // 2026-05-03 placement rule (now editor/placement.js's no-coordinate,
  // no-before-flag branch — the default click behavior is unchanged by
  // chunks A1-A3; Alt+Click's `before: true` variant is covered in
  // insert-zones.spec.js):
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
  //
  // Since chunk A2, the drop zone depends on WHERE inside the target the
  // pointer is (decideDropPlacement in editor/placement.js), not just which
  // element it's over — so these synthetic events now carry a real
  // clientX/clientY taken from the target's own getBoundingClientRect(),
  // computed inside the iframe document (same coordinate space the drag
  // listeners see).
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

  // ── Drop on <main> (container), pointer at its CENTER: should append
  //    INSIDE — the middle-zone case must survive the switch from
  //    coordinate-agnostic placement to decideDropPlacement's 3-zone split. ──
  const dropOnContainer = await appWindow.evaluate(({ blockId }) => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const mainEl = doc.querySelector('main')
    if (!mainEl) return { error: 'main element not found' }
    const childCountBefore = mainEl.children.length
    const rect = mainEl.getBoundingClientRect()
    const clientX = rect.left + rect.width / 2
    const clientY = rect.top + rect.height / 2
    const dt = new DataTransfer()
    dt.setData('application/x-grapestrap-block', blockId)
    mainEl.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY
    }))
    const previewSet = mainEl.classList.contains('gstrap-drop-target')
    const lineVisibleDuringHover = doc.querySelector('.gstrap-insert-line.is-visible') !== null
    mainEl.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY
    }))
    return {
      previewSet,
      lineVisibleDuringHover,
      previewClearedAfterDrop: !mainEl.classList.contains('gstrap-drop-target'),
      childCountDelta: mainEl.children.length - childCountBefore,
      newSelParentTag: (ed.getSelected()?.parent?.()?.get?.('tagName') || '').toLowerCase()
    }
  }, { blockId })
  expect(dropOnContainer.previewSet).toBe(true)
  // The dashed outline (container "inside" zone) and the insertion line are
  // mutually exclusive — center-of-container must never show the line.
  expect(dropOnContainer.lineVisibleDuringHover).toBe(false)
  expect(dropOnContainer.previewClearedAfterDrop).toBe(true)
  expect(dropOnContainer.childCountDelta).toBe(1)
  expect(dropOnContainer.newSelParentTag).toBe('main')

  // ── Drop on <h1> (leaf), pointer in its LOWER half: leaves split at the
  //    midpoint (decideDropPlacement), so the lower half is the 'after'
  //    zone — same outcome as the old coordinate-agnostic always-after leaf
  //    rule, but now it's coordinate-driven. Leaves show the insertion LINE,
  //    not the dashed outline (that's reserved for a container's "inside"
  //    zone) — chunk A2 fixed the no-feedback gap this replaces. ──
  const dropOnLeaf = await appWindow.evaluate(({ blockId }) => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const h1 = doc.querySelector('h1')
    if (!h1) return { error: 'h1 not found' }
    const parentEl = h1.parentElement
    const childCountBefore = parentEl.children.length
    const h1IndexBefore = [...parentEl.children].indexOf(h1)
    const rect = h1.getBoundingClientRect()
    const clientX = rect.left + rect.width / 2
    const clientY = rect.top + rect.height * 0.75 // lower half → 'after'
    const dt = new DataTransfer()
    dt.setData('application/x-grapestrap-block', blockId)
    h1.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY
    }))
    const lineVisible = doc.querySelector('.gstrap-insert-line.is-visible') !== null
    const parentPreview = parentEl.classList.contains('gstrap-drop-target')
    const leafPreview = h1.classList.contains('gstrap-drop-target')
    h1.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY
    }))
    const sel = ed.getSelected()
    const selParent = sel.parent()
    return {
      lineVisible,
      parentPreview,
      leafPreview,
      lineHiddenAfterDrop: doc.querySelector('.gstrap-insert-line.is-visible') === null,
      childCountDelta: parentEl.children.length - childCountBefore,
      newSelIdx: selParent.components().indexOf(sel),
      h1IndexBefore,
      sameParent: selParent.getEl() === parentEl
    }
  }, { blockId })
  expect(dropOnLeaf.lineVisible).toBe(true)
  expect(dropOnLeaf.parentPreview).toBe(false)
  expect(dropOnLeaf.leafPreview).toBe(false)
  expect(dropOnLeaf.lineHiddenAfterDrop).toBe(true)
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

  // ── Wrapper-landing case (chunk A3): with nothing selected, the anchor is
  //    the wrapper itself. Before A3 this skipped the flash entirely
  //    (flashing the whole page body is noisy); now the INSERTED component
  //    gets the flash instead. ──
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.select() // clear selection so the next insert's anchor is the wrapper
  })
  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-block-tile').click()
  })
  const wrapperLandingFlashed = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const sel = ed.getSelected()
    return sel?.getEl?.()?.classList?.contains('gstrap-insert-flash') || false
  })
  expect(wrapperLandingFlashed).toBe(true)

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
  // canvas iframe contentDocument's body — the no-anchor/wrapper case, whose
  // placement is now coordinate-driven (chunk A2's wrapperIndexForY) instead
  // of a plain end-of-page append, so this also asserts the new component
  // landed at the SAME index wrapperIndexForY would independently compute
  // for the same clientY over the same top-level children (window.__gstrap.
  // placement is the app's own test surface for that function — see main.js).
  const result = await appWindow.evaluate(blockId => {
    window.__gstrapDragBlockId = blockId
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const wrapper = ed.getWrapper()
    const dropClientY = 100
    const childRects = wrapper.components().models
      .map(c => c.getEl?.())
      .filter(Boolean)
      .map(el => el.getBoundingClientRect())
    const expectedIndex = window.__gstrap.placement.wrapperIndexForY(childRects, dropClientY)
    // Drop event with no usable dataTransfer — exercises the iframe-boundary
    // case where the custom MIME got stripped.
    const dt = new DataTransfer()
    const dropEvt = new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: 100, clientY: dropClientY
    })
    // Target the body so we land on the page wrapper.
    doc.body.dispatchEvent(dropEvt)
    const wrapperAfter = ed.getWrapper().components()
    const newSel = ed.getSelected()
    // Read the canvas html to confirm the block content rendered (not the
    // block id pasted as text).
    return {
      html: ed.getHtml() || '',
      count: wrapperAfter.length,
      bodyText: doc.body.textContent || '',
      expectedIndex,
      actualIndex: wrapperAfter.indexOf(newSel)
    }
  }, blockId)

  // The component count should have grown by at least 1 (the inserted block).
  expect(result.count).toBeGreaterThan(beforeCount)
  // And the literal block id must NOT appear as a stray text node in body
  // — that's the bug signature.
  expect(result.bodyText).not.toContain(blockId)
  // The new component landed at the index wrapperIndexForY predicts for the
  // same drop coordinate over the same pre-drop layout.
  expect(result.actualIndex).toBe(result.expectedIndex)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
