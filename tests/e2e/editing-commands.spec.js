/**
 * GrapeStrap — E2E: editing commands
 *
 * PATH: tests/e2e/editing-commands.spec.js
 * ROLE: Element-editing commands: quick tag, wrap-with-tag, property strip, DOM tree + context menu
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag, EXPECTED_PLUGIN_COUNT } from './helpers.js'

test('Quick Tag Editor: Ctrl+T renames the selected element', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-qt-'))
  const projectPath = join(projectDir, 'qt.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  // Trigger the menu command, then fill and submit the dialog.
  await appWindow.evaluate(() =>
    window.__gstrap.eventBus.emit('command', 'edit:quick-tag')
  )
  const input = appWindow.locator('.gstrap-quick-tag-input')
  await input.waitFor({ state: 'visible', timeout: 5_000 })
  await input.fill('<h2 class="rebranded">')
  await input.press('Enter')

  // After Enter, dialog should be gone and the selected component should be h2.
  await appWindow.waitForFunction(() => !document.querySelector('.gstrap-quick-tag-input'))
  const newTag = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return ed.getSelected?.()?.get?.('tagName')?.toLowerCase?.()
  })
  expect(newTag).toBe('h2')

  // Page html should reflect the rename.
  const htmlAfter = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return ed.getHtml()
  })
  expect(htmlAfter).toContain('<h2')
  expect(htmlAfter).toContain('rebranded')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Wrap with Tag: Ctrl+Shift+W wraps the selected element', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-wrap-'))
  const projectPath = join(projectDir, 'wrap.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  await appWindow.evaluate(() =>
    window.__gstrap.eventBus.emit('command', 'edit:wrap-tag')
  )
  const input = appWindow.locator('.gstrap-quick-tag-input')
  await input.waitFor({ state: 'visible', timeout: 5_000 })
  await input.fill('<header class="page-head">')
  await input.press('Enter')

  await appWindow.waitForFunction(() => !document.querySelector('.gstrap-quick-tag-input'))

  const html = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return ed.getHtml()
  })
  // <header class="page-head"><h1 …>…</h1></header> should now exist.
  expect(html).toMatch(/<header[^>]*class="page-head"[^>]*>\s*<h1/i)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Property strip heading-level dropdown changes the tag', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-strip-'))
  const projectPath = join(projectDir, 'strip.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  // The strip should have rendered for the h1 selection — find the level select.
  const select = appWindow.locator('[data-field="heading-level"]')
  await select.waitFor({ state: 'visible', timeout: 5_000 })
  await expect(select).toHaveValue('h1')

  await select.selectOption('h3')

  // Dispatch a real change event matches what the keyboard would do; verify
  // the editor's selected component is now h3.
  const newTag = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return ed.getSelected?.()?.get?.('tagName')?.toLowerCase?.()
  })
  expect(newTag).toBe('h3')

  // The strip itself should have re-rendered for the new selection (h3).
  await appWindow.waitForFunction(
    () => document.querySelector('[data-field="heading-level"]')?.value === 'h3',
    null, { timeout: 5_000 }
  )

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('DOM tree mirrors canvas + click selects component', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-domtree-'))
  const projectPath = join(projectDir, 'tree.gstrap')

  const { app, appWindow } = await launch()
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 }
  )

  // Create + open a project so the canvas has the seed index page loaded.
  await appWindow.evaluate(async path => {
    const project = await window.grapestrap.project.new({ name: 'tree', location: path })
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
  }, projectPath)

  // Wait until GrapesJS has populated the wrapper with the seed page's
  // components and the DOM tree has rendered at least one row.
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-cid]').length > 0,
    null, { timeout: 10_000 }
  )

  // The seed page contains <main>…<h1>…<p>… — assert the tree shows them.
  const tags = await appWindow.$$eval(
    '[data-cid] .gstrap-dom-tag',
    nodes => nodes.map(n => n.textContent)
  )
  expect(tags).toContain('main')
  expect(tags).toContain('h1')
  expect(tags).toContain('p')

  // Click the h1 row → editor should select the matching component.
  const selectedTag = await appWindow.evaluate(() => {
    const h1Row = [...document.querySelectorAll('[data-cid]')]
      .find(r => r.querySelector('.gstrap-dom-tag')?.textContent === 'h1')
    h1Row.click()
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return ed?.getSelected?.()?.get?.('tagName')?.toLowerCase?.()
  })
  expect(selectedTag).toBe('h1')

  // Selection should highlight in the tree.
  const highlighted = await appWindow.locator('[data-cid].is-selected').count()
  expect(highlighted).toBe(1)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Right-click on DOM tree row opens context menu; Duplicate adds a sibling; Delete removes', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ctxmenu-'))
  const projectPath = join(projectDir, 'cm.gstrap')

  const { app, appWindow } = await launch()
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 }
  )

  await appWindow.evaluate(async path => {
    const project = await window.grapestrap.project.new({ name: 'cm', location: path })
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
  }, projectPath)

  await appWindow.waitForFunction(
    () => [...document.querySelectorAll('[data-cid] .gstrap-dom-tag')]
      .some(n => n.textContent === 'p'),
    null, { timeout: 10_000 }
  )

  const countP = () => appWindow.evaluate(() =>
    [...document.querySelectorAll('.gstrap-dom-tag')].filter(n => n.textContent === 'p').length
  )

  expect(await countP()).toBe(1)

  // Right-click on the <p> row.
  await appWindow.evaluate(() => {
    const row = [...document.querySelectorAll('[data-cid]')]
      .find(r => r.querySelector('.gstrap-dom-tag')?.textContent === 'p')
    const rect = row.getBoundingClientRect()
    row.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true,
      clientX: rect.left + 10, clientY: rect.top + 5, button: 2
    }))
  })

  // Menu visible.
  await appWindow.waitForSelector('.gstrap-ctxmenu', { timeout: 2_000 })
  const itemLabels = await appWindow.$$eval('.gstrap-ctxmenu-item .gstrap-ctxmenu-label', els => els.map(e => e.textContent))
  expect(itemLabels).toEqual(expect.arrayContaining(['Edit Tag…', 'Wrap with Tag…', 'Duplicate', 'Copy HTML', 'Delete']))

  // Click Duplicate.
  await appWindow.evaluate(() => {
    const dup = [...document.querySelectorAll('.gstrap-ctxmenu-item')]
      .find(li => li.querySelector('.gstrap-ctxmenu-label')?.textContent === 'Duplicate')
    dup.click()
  })

  await appWindow.waitForFunction(
    () => [...document.querySelectorAll('.gstrap-dom-tag')].filter(n => n.textContent === 'p').length === 2,
    null, { timeout: 3_000 }
  )
  expect(await countP()).toBe(2)

  // Right-click the same <p> (now: any of the two) and Delete.
  await appWindow.evaluate(() => {
    const row = [...document.querySelectorAll('[data-cid]')]
      .find(r => r.querySelector('.gstrap-dom-tag')?.textContent === 'p')
    const rect = row.getBoundingClientRect()
    row.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true,
      clientX: rect.left + 10, clientY: rect.top + 5, button: 2
    }))
  })
  await appWindow.waitForSelector('.gstrap-ctxmenu', { timeout: 2_000 })
  await appWindow.evaluate(() => {
    const del = [...document.querySelectorAll('.gstrap-ctxmenu-item')]
      .find(li => li.querySelector('.gstrap-ctxmenu-label')?.textContent === 'Delete')
    del.click()
  })
  await appWindow.waitForFunction(
    () => [...document.querySelectorAll('.gstrap-dom-tag')].filter(n => n.textContent === 'p').length === 1,
    null, { timeout: 3_000 }
  )
  expect(await countP()).toBe(1)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
