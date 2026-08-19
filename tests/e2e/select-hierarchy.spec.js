/**
 * GrapeStrap — E2E: Select Parent / Select Child context-menu items
 *
 * PATH: tests/e2e/select-hierarchy.spec.js
 * ROLE: Workstream B WP-B1 specs — the Select Parent / Select Child
 *       context-menu items (component-actions.js's selectParent(),
 *       selectChild(), selectableChildren(), buildSelectHierarchyItems()),
 *       including the disabled root case and the 6-item child cap with its
 *       disabled "… N more" overflow row.
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-08-18
 * UPDATED: 2026-08-18 — added the REAL-PATH block at the bottom of the file.
 *          Everything above it opens the menu by emitting `canvas:context-menu`
 *          on the event bus, which skips the code that decides WHICH component
 *          the menu is for — and that code was broken in the shipped app
 *          (canvas right-click synthesised a mousedown, which grapesjs 0.21.13
 *          does not select on, then read editor.getSelected() a microtask
 *          later: null on a fresh page, so the whole hierarchy block was
 *          missing from the real menu). The real-path specs right-click for
 *          real — canvas iframe and DOM-tree row — so that resolution step can
 *          never go untested again. See editor/canvas-context-target.js.
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag, dismissWelcome } from './helpers.js'

// Same open-menu / read-labels / click-by-label idiom reorder.spec.js and
// bs-docs-menu.spec.js use: emit the same event the canvas iframe and DOM
// tree emit (single open path, main.js) for whatever's currently selected.
async function openMenuForSelection(appWindow) {
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const comp = ed.getSelected()
    window.__gstrap.eventBus.emit('canvas:context-menu', { x: 200, y: 200, component: comp })
  })
}

// [{ label, disabled }] for every non-separator item in the open menu.
async function menuItemStates(appWindow) {
  return appWindow.evaluate(() =>
    [...document.querySelectorAll('.gstrap-ctxmenu-item')].map(li => ({
      label: li.querySelector('.gstrap-ctxmenu-label')?.textContent.trim(),
      disabled: li.classList.contains('is-disabled')
    }))
  )
}

async function clickMenuItem(appWindow, label) {
  const labels = await appWindow.evaluate(() =>
    [...document.querySelectorAll('.gstrap-ctxmenu-item')].map(
      li => li.querySelector('.gstrap-ctxmenu-label')?.textContent.trim()))
  const idx = labels.indexOf(label)
  if (idx === -1) throw new Error(`menu item not found: "${label}" (have: ${labels.join(', ')})`)
  await appWindow.evaluate(i => {
    document.querySelectorAll('.gstrap-ctxmenu-item')[i].click()
  }, idx)
}

/** lowercased tagName of whatever's currently selected. */
function selectedTag() {
  return `(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return (ed.getSelected()?.get('tagName') || '').toLowerCase()
  })()`
}

test('Select Parent selects the clicked element\'s parent', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-selecthier-'))
  const projectPath = join(projectDir, 'parent.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  // Blank starter body: <main><h1>…</h1><p>…</p></main> — h1's parent is main.
  await selectFirstByTag(appWindow, 'h1')

  await openMenuForSelection(appWindow)
  await clickMenuItem(appWindow, 'Select Parent (main)')

  expect(await appWindow.evaluate(selectedTag())).toBe('main')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Select Parent is disabled when the wrapper/body root is selected', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-selecthier-'))
  const projectPath = join(projectDir, 'root.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.select(ed.getWrapper())
  })

  await openMenuForSelection(appWindow)
  const states = await menuItemStates(appWindow)
  const item = states.find(s => s.label === 'Select Parent (body)')
  expect(item, `menu item missing: Select Parent (body) (have: ${states.map(s => s.label).join(', ')})`).toBeTruthy()
  expect(item.disabled).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Select Child uses the single-child label form when there is exactly one child', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-selecthier-'))
  const projectPath = join(projectDir, 'single-child.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  // The wrapper's only direct child is <main> — a natural single-child case.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.select(ed.getWrapper())
  })

  await openMenuForSelection(appWindow)
  const states = await menuItemStates(appWindow)
  const item = states.find(s => s.label === 'Select Child (main)')
  expect(item, `menu item missing: Select Child (main) (have: ${states.map(s => s.label).join(', ')})`).toBeTruthy()
  expect(item.disabled).toBeFalsy()

  await clickMenuItem(appWindow, 'Select Child (main)')
  expect(await appWindow.evaluate(selectedTag())).toBe('main')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Select Child list caps at 6 children with a disabled overflow row, skipping textnodes', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-selecthier-'))
  const projectPath = join(projectDir, 'many-children.gstrap')
  const EXTRA_CHILD_COUNT = 8   // main starts with [h1, p] → 10 children total

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'main')

  // Pad main out past the 6-item cap. Each child is a plain <div> with its
  // own class so describeComponent()'s "tag.class" form is distinguishable
  // per row; main's existing h1/p children (each holding a lone textnode,
  // which selectableChildren() must skip) come first in document order.
  await appWindow.evaluate(count => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const main = ed.getSelected()
    for (let i = 0; i < count; i++) {
      main.append(`<div class="extra-child-${i}">extra</div>`)
    }
  }, EXTRA_CHILD_COUNT)

  await openMenuForSelection(appWindow)
  const states = await menuItemStates(appWindow)
  const childRows = states.filter(s => s.label?.startsWith('Select Child:'))
  const overflowRow = states.find(s => s.label === '… 4 more children')

  expect(childRows).toHaveLength(6)
  expect(childRows.every(row => !row.disabled)).toBe(true)
  // main's own children carry the blank starter's classes (h1 "display-5
  // fw-bold", p "lead") — describeComponent() reports tag + first class.
  expect(childRows.map(row => row.label)).toEqual([
    'Select Child: h1.display-5',
    'Select Child: p.lead',
    'Select Child: div.extra-child-0',
    'Select Child: div.extra-child-1',
    'Select Child: div.extra-child-2',
    'Select Child: div.extra-child-3'
  ])
  expect(overflowRow, `overflow row missing (have: ${states.map(s => s.label).join(', ')})`).toBeTruthy()
  expect(overflowRow.disabled).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ── REAL PATH: a genuine right-click, not an eventBus emit ───────────────────
// The specs above hand the menu a component the test itself picked. These
// drive the two handlers that pick it in the app — the canvas iframe's
// contextmenu listener (editor/grapesjs-init.js) and the DOM tree's
// (panels/dom-tree/index.js) — with real mouse input, so a regression in
// target resolution fails here instead of shipping.

/** Host-window centre point of a canvas element, for appWindow.mouse. */
function canvasElementPoint(appWindow, selector) {
  return appWindow.evaluate(sel => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const frame = ed?.Canvas?.getFrameEl?.()
    const el = frame?.contentDocument?.querySelector(sel)
    if (!frame || !el) return null
    const frameRect = frame.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    return {
      x: frameRect.left + rect.left + rect.width / 2,
      y: frameRect.top + rect.top + rect.height / 2
    }
  }, selector)
}

/** Real right-click on a canvas element; resolves once the menu has painted. */
async function rightClickCanvasElement(appWindow, selector) {
  const point = await canvasElementPoint(appWindow, selector)
  expect(point, `no canvas element matched ${selector}`).toBeTruthy()
  await appWindow.mouse.click(point.x, point.y, { button: 'right' })
  await appWindow.waitForSelector('.gstrap-ctxmenu-item', { timeout: 5_000 })
}

/** Just the labels of the open menu — for the presence assertions below. */
async function menuLabels(appWindow) {
  return (await menuItemStates(appWindow)).map(state => state.label)
}

test('REAL right-click in the canvas builds the hierarchy items for the element under the cursor', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-selecthier-'))
  const projectPath = join(projectDir, 'real-canvas.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  // The welcome overlay spans the window and swallows real pointer input.
  await dismissWelcome(appWindow)

  // Deliberately NO prior selection: this is the state the user reported the
  // bug from (open a project, right-click something). With the old synthetic-
  // mousedown resolution the menu was built for `null` here and the whole
  // Select Parent / Select Child block was absent.
  expect(await appWindow.evaluate(selectedTag())).toBe('')

  await rightClickCanvasElement(appWindow, 'h1')

  // Right-click SELECTS what it menus — the targeting contract.
  expect(await appWindow.evaluate(selectedTag())).toBe('h1')
  const states = await menuItemStates(appWindow)
  const parentItem = states.find(state => state.label === 'Select Parent (main)')
  expect(parentItem, `menu built for the wrong component (have: ${states.map(s => s.label).join(', ')})`).toBeTruthy()
  expect(parentItem.disabled).toBeFalsy()

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('REAL right-click retargets the menu away from a stale selection', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-selecthier-'))
  const projectPath = join(projectDir, 'real-stale.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await dismissWelcome(appWindow)

  // A nested section, so the right-click target's parent tag differs from the
  // stale selection's — the assertion below can then tell "resolved the
  // element under the cursor" from "reused whatever was selected before".
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.getWrapper().append(
      '<section class="promo-band"><div class="promo-inner"><h2 class="promo-title">Promo</h2></div></section>')
  })
  await selectFirstByTag(appWindow, 'p')     // stale selection: <p> inside <main>

  await rightClickCanvasElement(appWindow, '.promo-title')

  expect(await appWindow.evaluate(selectedTag())).toBe('h2')
  const labels = await menuLabels(appWindow)
  expect(labels, `menu still built for the stale <p> (have: ${labels.join(', ')})`)
    .toContain('Select Parent (div)')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('REAL right-click on a DOM-tree row builds the hierarchy items for that row', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-selecthier-'))
  const projectPath = join(projectDir, 'real-domtree.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await dismissWelcome(appWindow)

  // Two things hide the tree from a real mouse at boot: the DOM panel is
  // toggled off (body.is-hide-dom-tree), and its tab shares a GoldenLayout
  // stack with Properties/Custom CSS so only the active one is rendered. Undo
  // both the way a user would — the View toggle, then the tab — or the rows
  // are present in the DOM but display:none and Playwright refuses to click.
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('view:toggle-dom-tree'))
  await appWindow.evaluate(() => document.querySelector('.lm_tab[title="DOM"]')?.click())
  await appWindow.waitForSelector('.gstrap-dom-host [data-cid]', { state: 'visible', timeout: 5_000 })

  // The tree's top row is <main> (the wrapper itself gets no row) — its
  // children are the blank starter's h1 and p, so both label forms appear.
  const mainRow = appWindow.locator('.gstrap-dom-host [data-cid]').first()
  await expect(mainRow.locator('.gstrap-dom-tag')).toHaveText('main')
  await mainRow.click({ button: 'right' })
  await appWindow.waitForSelector('.gstrap-ctxmenu-item', { timeout: 5_000 })

  const labels = await menuLabels(appWindow)
  expect(labels, `hierarchy items missing (have: ${labels.join(', ')})`)
    .toEqual(expect.arrayContaining([
      'Select Parent (body)',
      'Select Child: h1.display-5',
      'Select Child: p.lead'
    ]))

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
