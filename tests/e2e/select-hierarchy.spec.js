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
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag } from './helpers.js'

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
