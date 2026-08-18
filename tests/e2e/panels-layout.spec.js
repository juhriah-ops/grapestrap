/**
 * GrapeStrap — E2E: panels and layout
 *
 * PATH: tests/e2e/panels-layout.spec.js
 * ROLE: GoldenLayout panel geometry: resize drift, view toggles, right-stack tabs, and splitter drag specs
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 * UPDATED: 2026-08-18 — right stack is 4 tabs (Bootstrap panel added)
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome } from './helpers.js'

/**
 * Regression: canvas pane must not drift downward when the window is resized
 * back-and-forth.
 *
 * History: pre-fix the renderer had three competing layout drivers (host RO,
 * window 'resize' listener without the 1px gate, Monaco automaticLayout × 3).
 * Each direction-flip fired updateSize once unguarded which let sub-pixel
 * walks accumulate, growing the canvas pane downward. After consolidating to
 * a single integer-gated host RO + per-Monaco container ROs, the canvas pane
 * height must equal the GL host's clientHeight (within ±1 px for GL's
 * integer panel rounding) after a sequence of direction-flips.
 */
test('canvas pane does not drift on alternating window resize', async () => {
  const { app, appWindow } = await launch()

  await appWindow.waitForFunction(() => !!document.querySelector('.gstrap-canvas-host'), null, { timeout: 10_000 })

  const measure = () => appWindow.evaluate(() => {
    const main   = document.getElementById('gstrap-main')
    const canvas = document.querySelector('.gstrap-canvas-host')
    return {
      mainH:   main?.clientHeight   ?? -1,
      canvasH: canvas?.clientHeight ?? -1
    }
  })

  await appWindow.setViewportSize({ width: 1280, height: 800 })
  await appWindow.waitForTimeout(120)
  const start = await measure()

  for (const s of [
    { width: 1400, height: 900 },
    { width: 1100, height: 700 },
    { width: 1500, height: 950 },
    { width: 1000, height: 650 },
    { width: 1280, height: 800 }
  ]) {
    await appWindow.setViewportSize(s)
    await appWindow.waitForTimeout(80)
  }

  const end = await measure()

  // GL host must have non-zero height — pre-fix it was 0 because hiding the
  // linkedfiles row via display:none shifted the gstrap-main element into
  // the linkedfiles auto-row (which collapses to 0 with no content).
  expect(start.mainH).toBeGreaterThan(100)
  expect(end.mainH).toBeGreaterThan(100)

  // Drift assertion: returning to the same viewport size must yield the same
  // pixel-rounded heights as the baseline. (Canvas pane is in a GL stack so
  // it's ~28px shorter than the host's clientHeight for the tab header — that
  // delta is constant, so we don't compare canvas vs host directly.)
  expect(Math.abs(end.mainH - start.mainH)).toBeLessThanOrEqual(1)
  expect(Math.abs(end.canvasH - start.canvasH)).toBeLessThanOrEqual(1)

  await app.close()
})

test('View toggles: menu/keybind events hide & show the right region', async () => {
  // Reported on nola1: "I cant control what views are active. from the
  // top tool bar menu is that supposed to be wired yet?"
  // The view:toggle-* events were stubs. Verifies wireViewToggles now
  // routes them — fixed strips toggle the [hidden] attribute, GL panels
  // toggle a body class that hides their .lm_content via CSS.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-vt-'))
  const projectPath = join(projectDir, 'vt.gstrap')

  const { app, appWindow } = await launch()  // launch() isolates prefs per run
  await openSeedProject(appWindow, projectPath)

  // alpha.12: DOM / Properties / Custom CSS are tabs in the right stack.
  // Toggling one sets a body class that hides its .lm_tab + .lm_content.
  // The Properties content (.lm_content.gstrap-props-host) goes display:none.
  const propsHostHidden = () => appWindow.evaluate(() => {
    const el = document.querySelector('.lm_content.gstrap-props-host')
    return el ? getComputedStyle(el).display === 'none' : null
  })

  const initial = await appWindow.evaluate(() => ({
    insert: document.getElementById('gstrap-insert').hidden,
    strip:  document.getElementById('gstrap-strip').hidden,
    status: document.getElementById('gstrap-status').hidden,
    fmHide: document.body.classList.contains('is-hide-file-manager')
  }))
  expect(initial.insert).toBe(false)
  expect(initial.strip).toBe(false)
  expect(initial.status).toBe(false)
  expect(initial.fmHide).toBe(false)
  expect(await propsHostHidden()).toBe(false)

  // Fire all five toggles.
  await appWindow.evaluate(() => {
    const eb = window.__gstrap.eventBus
    eb.emit('view:toggle-insert')
    eb.emit('view:toggle-strip')
    eb.emit('view:toggle-status')
    eb.emit('view:toggle-file-manager')
    eb.emit('view:toggle-properties')
  })
  await appWindow.waitForTimeout(150)

  const afterToggle = await appWindow.evaluate(() => ({
    insert: document.getElementById('gstrap-insert').hidden,
    strip:  document.getElementById('gstrap-strip').hidden,
    status: document.getElementById('gstrap-status').hidden,
    fmHide: document.body.classList.contains('is-hide-file-manager')
  }))
  expect(afterToggle.insert).toBe(true)
  expect(afterToggle.strip).toBe(true)
  expect(afterToggle.status).toBe(true)
  expect(afterToggle.fmHide).toBe(true)
  expect(await propsHostHidden()).toBe(true)

  // Toggle insert back on, verify only it flipped.
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('view:toggle-insert'))
  const afterRestore = await appWindow.evaluate(() => ({
    insert: document.getElementById('gstrap-insert').hidden,
    strip:  document.getElementById('gstrap-strip').hidden
  }))
  expect(afterRestore.insert).toBe(false)
  expect(afterRestore.strip).toBe(true)

  // Persistence: prefs.view should reflect insert=true (re-shown) and
  // strip=false. Persist IPC is async — poll until it settles.
  let prefsView = {}
  for (let i = 0; i < 20; i++) {
    prefsView = await appWindow.evaluate(() => window.grapestrap.prefs.get('view'))
    if (prefsView?.propertyStripVisible === false && prefsView?.insertPanelVisible === true) break
    await new Promise(r => setTimeout(r, 100))
  }
  expect(prefsView.insertPanelVisible).toBe(true)
  expect(prefsView.propertyStripVisible).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Panel layout: hosts align with their .lm_items section, not the header', async () => {
  // Reported on nola1 2026-05-05 with screenshots: "the properties is over
  // the canvas... overlap and size of the properties squishing." Root cause:
  // panels.css and dom-tree.css applied `position: absolute !important; inset:
  // 0 !important` directly to the .lm_content element (the panel host class
  // is added TO container.element, which IS the .lm_content). That escaped
  // GL's containing block — content rendered at the header's Y instead of
  // below it, AND was 2px wider than its column. The fix swaps to
  // `height: 100% !important; overflow-y: auto !important` so GL keeps its
  // own positioning. Regression: each panel host's top-y must match its
  // surrounding .lm_items section's top-y (not the .lm_stack's top-y, which
  // sits behind the header).
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-panelpos-'))
  const projectPath = join(projectDir, 'panelpos.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Make every GL-managed panel visible so each host renders.
  await appWindow.evaluate(() => {
    document.body.classList.remove(
      'is-hide-dom-tree','is-hide-properties','is-hide-custom-css','is-hide-bootstrap-css','is-hide-file-manager')
  })
  await appWindow.waitForTimeout(100)

  // Activate each tab in turn so its .lm_content has a non-zero rect.
  // Inactive tabs in a stack are display:none (GL only renders the active
  // pane); we can only check positioning on the currently-active tab.
  async function activateAndMeasure(hostClass) {
    await appWindow.evaluate((cls) => {
      const titleMap = {
        'gstrap-dom-host': 'DOM',
        'gstrap-props-host': 'Properties',
        'gstrap-cssp-host': 'Custom CSS',
        'gstrap-bscss-host': 'Bootstrap',
        'gstrap-fm-host': 'Project'
      }
      const tab = document.querySelector(`.lm_tab[title="${titleMap[cls]}"]`)
      if (tab) tab.click()
    }, hostClass)
    await appWindow.waitForTimeout(150)
    return appWindow.evaluate((cls) => {
      const el = document.querySelector('.' + cls)
      if (!el) return { found: false }
      const r = el.getBoundingClientRect()
      let n = el.parentElement
      while (n && !(n.classList?.contains('lm_items'))) n = n.parentElement
      const itemsR = n ? n.getBoundingClientRect() : null
      return {
        found: true,
        hostY: Math.round(r.y),
        itemsY: itemsR ? Math.round(itemsR.y) : null,
        rendered: r.width > 0 && r.height > 0
      }
    }, hostClass)
  }

  for (const cls of ['gstrap-fm-host', 'gstrap-dom-host', 'gstrap-props-host', 'gstrap-cssp-host', 'gstrap-bscss-host']) {
    const p = await activateAndMeasure(cls)
    expect(p.found, `${cls} should exist`).toBe(true)
    expect(p.rendered, `${cls} should be rendered after activation`).toBe(true)
    // hostY should equal itemsY (within 1px tolerance for HiDPI rounding).
    expect(Math.abs(p.hostY - p.itemsY), `${cls} host Y (${p.hostY}) should align with .lm_items Y (${p.itemsY})`).toBeLessThanOrEqual(1)
  }

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Right-stack tabs: individual hide leaves stack, all-hidden collapses stack', async () => {
  // Consolidation 2026-05-05 (alpha.12): DOM Tree, Properties, and Custom CSS
  // are tabs in a single right-side stack (per nola1 user request: "all of
  // these separate views should all be on the right as tabs in one panel like
  // the library and assets"), joined by Bootstrap on 2026-08-18. Toggle
  // behavior:
  //
  //   - Hide one tab → only its tab+content goes away; stack stays for the
  //     others; canvas does NOT grow.
  //   - Hide EVERY tab → the whole right stack collapses; canvas reclaims
  //     the right column's 26%.
  //   - Show any one of them → stack restored; that tab becomes active.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-rs-'))
  const projectPath = join(projectDir, 'rs.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Reset to a known state: clear all three body classes; restore the stack
  // if a prior test collapsed it.
  await appWindow.evaluate(() => {
    document.body.classList.remove(
      'is-hide-dom-tree','is-hide-properties','is-hide-custom-css','is-hide-bootstrap-css')
    // If the right stack is currently collapsed (no in-process state to
    // restore via panel-visibility from outside), trigger any one show toggle.
    window.__gstrap.eventBus.emit('view:toggle-dom-tree')
    window.__gstrap.eventBus.emit('view:toggle-dom-tree') // back to visible
  })
  await appWindow.waitForTimeout(200)

  async function tabPresent(hostClass) {
    return appWindow.evaluate((cls) => {
      const el = document.querySelector(`.lm_content.${cls}`)
      if (!el) return false
      return getComputedStyle(el).display !== 'none'
    }, hostClass)
  }

  async function rightStackVisible() {
    return appWindow.evaluate(() => {
      // Right stack = the .lm_item.lm_stack containing all three host classes.
      const stack = document.querySelector('.lm_item.lm_stack:has(.gstrap-dom-host)')
      if (!stack) return false
      const r = stack.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
  }

  async function canvasWidth() {
    return appWindow.evaluate(() => {
      const c = document.querySelector('.lm_item.lm_stack:has(.gstrap-canvas-host)')
      return c ? Math.round(c.getBoundingClientRect().width) : 0
    })
  }

  // Baseline: all four visible, right stack visible
  expect(await tabPresent('gstrap-dom-host')).toBe(true)
  expect(await tabPresent('gstrap-props-host')).toBe(true)
  expect(await tabPresent('gstrap-cssp-host')).toBe(true)
  expect(await tabPresent('gstrap-bscss-host')).toBe(true)
  expect(await rightStackVisible()).toBe(true)
  const canvasBaseline = await canvasWidth()
  expect(canvasBaseline).toBeGreaterThan(0)

  // Hide DOM only — its tab+content gone; stack still there; canvas DOES NOT grow
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('view:toggle-dom-tree'))
  await appWindow.waitForTimeout(150)
  expect(await tabPresent('gstrap-dom-host')).toBe(false)
  expect(await rightStackVisible()).toBe(true)
  const canvasAfterDomHide = await canvasWidth()
  expect(Math.abs(canvasAfterDomHide - canvasBaseline)).toBeLessThan(5)

  // Hide Properties — tab gone; stack still there for Custom CSS + Bootstrap
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('view:toggle-properties'))
  await appWindow.waitForTimeout(150)
  expect(await tabPresent('gstrap-props-host')).toBe(false)
  expect(await rightStackVisible()).toBe(true)

  // Hide Custom CSS — Bootstrap still holds the stack open.
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('view:toggle-custom-css'))
  await appWindow.waitForTimeout(150)
  expect(await tabPresent('gstrap-cssp-host')).toBe(false)
  expect(await rightStackVisible()).toBe(true)

  // Hide Bootstrap — now EVERY tab is hidden, the stack must collapse and
  // canvas must grow to reclaim the right column.
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('view:toggle-bootstrap-css'))
  await appWindow.waitForTimeout(200)
  expect(await rightStackVisible()).toBe(false)
  const canvasAllHidden = await canvasWidth()
  expect(canvasAllHidden - canvasBaseline, `canvas should grow when every right tab is hidden (was ${canvasBaseline}, now ${canvasAllHidden})`).toBeGreaterThan(100)

  // Show DOM again — stack restores; DOM becomes the active tab; canvas shrinks back
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('view:toggle-dom-tree'))
  await appWindow.waitForTimeout(200)
  expect(await tabPresent('gstrap-dom-host')).toBe(true)
  expect(await rightStackVisible()).toBe(true)
  const canvasRestored = await canvasWidth()
  expect(Math.abs(canvasRestored - canvasBaseline)).toBeLessThan(10)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Splitter drag in a windowed layout: sidebars can shrink, never force-grow', async () => {
  // Reported on nola1 2026-07-06: "sidebar windows both left and right side
  // dont resize correctly when window not in max view. it only gets larger."
  // Root cause in GL v2.6: onSplitterDragStart bounds the drag with
  // calculateContentItemsTotalMinSize(stack.contentItems), which SUMS the
  // minWidth of every tab in the stack — but tabs display one at a time.
  // With 3 tabs × 180px the stack's effective floor was 540px; in any window
  // where a sidebar sits below that, Math.max(offset, positiveMin) turned
  // EVERY drag (including shrinks) into a forced jump out to 540px, and
  // dragStop persisted the bigger percentage. Same mechanism as the
  // alpha.9 "snaps ~50px then sticks" report (smaller jump at maximized
  // widths). Fix: per-tab minWidth is the intended stack floor ÷ tab count.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-split-'))
  const projectPath = join(projectDir, 'split.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Dismiss the first-run welcome for real: its .gstrap-modal-overlay spans
  // the window and swallows pointer input until a button is clicked. Specs
  // that drive everything through evaluate() never notice it — this spec
  // uses real mouse events, so it must clear the overlay like a user would.
  await dismissWelcome(appWindow)

  // Windowed (non-maximized) size — small enough that 18%/26% sidebars sit
  // far below the old broken 540px stack floor.
  await appWindow.setViewportSize({ width: 1200, height: 800 })
  await appWindow.waitForTimeout(400)

  const stackWidth = i => appWindow.evaluate(idx => {
    const stacks = document.querySelectorAll('#gstrap-main .lm_stack')
    return stacks[idx].getBoundingClientRect().width
  }, i)

  const dragSplitter = async (idx, dx) => {
    const box = await appWindow.evaluate(i => {
      const s = document.querySelectorAll('#gstrap-main .lm_splitter')[i]
      const r = s.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, idx)
    await appWindow.mouse.move(box.x, box.y)
    await appWindow.mouse.down()
    // Two intermediate moves so GL's drag listener sees real movement.
    await appWindow.mouse.move(box.x + dx / 2, box.y)
    await appWindow.mouse.move(box.x + dx, box.y)
    await appWindow.mouse.up()
    await appWindow.waitForTimeout(300) // dragStop applies sizes on rAF
  }

  // Left sidebar: drag the left splitter 30px LEFT — must shrink by ~30,
  // not jump out to the old 540px sum-of-tabs floor.
  const leftBefore = await stackWidth(0) // ~215px at 18% of 1200
  await dragSplitter(0, -30)
  const leftAfter = await stackWidth(0)
  expect(leftAfter).toBeLessThan(leftBefore)
  expect(Math.abs(leftBefore - 30 - leftAfter)).toBeLessThan(15)

  // The per-stack floor still holds: a huge shrink clamps at ~180px
  // (3 tabs × 60px per-tab minWidth), it doesn't collapse to nothing.
  await dragSplitter(0, -100)
  const leftFloor = await stackWidth(0)
  expect(Math.abs(leftFloor - 180)).toBeLessThan(15)

  // Right sidebar: drag the right splitter 60px RIGHT — must shrink it.
  const rightBefore = await stackWidth(2)
  await dragSplitter(1, 60)
  const rightAfter = await stackWidth(2)
  expect(rightAfter).toBeLessThan(rightBefore)
  expect(Math.abs(rightBefore - 60 - rightAfter)).toBeLessThan(15)

  // Growing still works and stays symmetric: drag left splitter back RIGHT.
  await dragSplitter(0, 40)
  const leftGrown = await stackWidth(0)
  expect(Math.abs(leftGrown - (leftFloor + 40))).toBeLessThan(15)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
