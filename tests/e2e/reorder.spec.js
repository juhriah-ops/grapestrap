/**
 * GrapeStrap — E2E: component reorder affordances
 *
 * PATH: tests/e2e/reorder.spec.js
 * ROLE: Workstream A chunk A4 specs — the Move Up / Move Down / Move to Top
 *       of Page context-menu items (component-actions.js's moveComponent()
 *       and moveComponentToPageTop()), and their disabled states on the
 *       root component and on a locked master-template page wrapper.
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-08-11
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag, EXPECTED_PLUGIN_COUNT } from './helpers.js'

// Open the context menu for whatever's currently selected — same event the
// canvas iframe and DOM tree emit (single open path, main.js), the same
// pattern bs-docs-menu.spec.js uses.
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

/** parent's child tags, lowercased, in order — used to pin sibling order. */
function siblingTagsOfSelection() {
  return `(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const parent = ed.getSelected().parent()
    return parent.components().models.map(c => (c.get('tagName') || '').toLowerCase())
  })()`
}

test('Move to Top of Page: a nested h1 becomes the wrapper\'s first (and selected) child', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-reorder-'))
  const projectPath = join(projectDir, 'top.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  // Blank starter body: <main><h1>…</h1><p>…</p></main> — h1 starts nested
  // two levels below the wrapper (wrapper > main > h1).
  await selectFirstByTag(appWindow, 'h1')

  await openMenuForSelection(appWindow)
  await clickMenuItem(appWindow, 'Move to Top of Page')

  const result = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const first = ed.getWrapper().components().at(0)
    return { tag: (first?.get('tagName') || '').toLowerCase(), isSelected: ed.getSelected() === first }
  })
  expect(result.tag).toBe('h1')
  expect(result.isSelected).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Move Up / Move Down: swap order within the same parent, then swap back', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-reorder-'))
  const projectPath = join(projectDir, 'updown.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')  // main's children: [h1, p]

  const before = await appWindow.evaluate(siblingTagsOfSelection())
  expect(before).toEqual(['h1', 'p'])

  await openMenuForSelection(appWindow)
  await clickMenuItem(appWindow, 'Move Down')
  const afterDown = await appWindow.evaluate(siblingTagsOfSelection())
  expect(afterDown).toEqual(['p', 'h1'])

  await openMenuForSelection(appWindow)
  await clickMenuItem(appWindow, 'Move Up')
  const afterUp = await appWindow.evaluate(siblingTagsOfSelection())
  expect(afterUp).toEqual(['h1', 'p'])

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('disabled on root: selecting the wrapper disables Move Up / Move Down / Move to Top of Page', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-reorder-'))
  const projectPath = join(projectDir, 'root.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.select(ed.getWrapper())
  })

  await openMenuForSelection(appWindow)
  const states = await menuItemStates(appWindow)
  for (const label of ['Move Up', 'Move Down', 'Move to Top of Page']) {
    const item = states.find(s => s.label === label)
    expect(item, `menu item missing: ${label}`).toBeTruthy()
    expect(item.disabled).toBe(true)
  }

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('disabled (Move to Top of Page only) on a master-template page: wrapper stays locked while chrome propagates', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-reorder-landing-'))
  const projectPath = join(projectDir, 'landing.gstrap')

  const { app, appWindow } = await launch()
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 }
  )
  // 'landing' starter (src/main/starters/landing.js): one master template
  // ('site') with locked header/footer chrome + one composed page ('index')
  // whose wrapper goes droppable:false while it's active (panels/templates/
  // lock.js#relockTemplateChrome — not modified here).
  // Same project-creation-via-evaluate pattern as graphite-starter.spec.js.
  await appWindow.evaluate(async path => {
    const project = await window.grapestrap.project.new({
      name: 'landingtest', location: path, templateId: 'landing'
    })
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
  }, projectPath)
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('[data-grpstr-region="content"]')
  }, null, { timeout: 10_000 })

  // relockTemplateChrome's WRAPPER-level droppable:false only runs on its two
  // full-walk triggers (canvas:frame:load, sync:code-to-canvas) — neither
  // fires on a plain pageState.open() of a freshly-created project (that's
  // just setComponents; component:add locks each chrome element individually
  // as it's added, but never touches the wrapper). templates.spec.js's own
  // ROUND-TRIP spec hits the same seam and drives it through a code→design
  // rebuild before checking locks — do the same here via the real view-mode
  // toggle (same command path the toolbar uses), not by modifying lock.js.
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'view:mode-code'))
  await appWindow.waitForTimeout(400)
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'view:mode-design'))
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('[data-grpstr-region="content"]')
  }, null, { timeout: 10_000 })

  const wrapperLocked = await appWindow.evaluate(() =>
    window.__gstrap.pluginRegistry.bound.editor.getWrapper().get('droppable'))
  expect(wrapperLocked).toBe(false)

  // The region's own h1 ("Headline that converts") is free content, not
  // chrome — landing's header/footer carry no <h1> — so removable stays
  // true and isRoot is false: only the wrapper's droppable:false should gate
  // Move to Top of Page. Move Up/Down must stay enabled: they never leave
  // the region's own subtree, so the locked root is irrelevant to them.
  await selectFirstByTag(appWindow, 'h1')

  await openMenuForSelection(appWindow)
  const states = await menuItemStates(appWindow)
  expect(states.find(s => s.label === 'Move to Top of Page')?.disabled).toBe(true)
  expect(states.find(s => s.label === 'Move Up')?.disabled).toBe(false)
  expect(states.find(s => s.label === 'Move Down')?.disabled).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
