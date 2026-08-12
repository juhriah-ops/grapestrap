/**
 * GrapeStrap — E2E: New Project dialog's per-page checklist
 *
 * PATH: tests/e2e/new-project-checklist.spec.js
 * ROLE: B2 coverage — dialogs/new-project.js's per-page checklist that
 *       narrows project:new's selectedPages. Drives the dialog only (no
 *       project needed first, same as starter-templates.spec.js's existing
 *       "New Project dialog" spec); submit paths that would validate clean
 *       are deliberately never exercised here — reaching project.new()'s
 *       native parent-folder picker would hang a headless run, same
 *       constraint that spec documents.
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-08-11
 */
import { test, expect } from '@playwright/test'
import { launch, EXPECTED_PLUGIN_COUNT } from './helpers.js'

async function openNewProjectDialog(appWindow) {
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 })
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:new-project'))
  await appWindow.waitForSelector('[data-npr-starter]')
}

test('Selecting a multi-page starter (graphite) reveals the checklist with all 5 pages checked', async () => {
  const { app, appWindow } = await launch()
  await openNewProjectDialog(appWindow)

  await appWindow.selectOption('[data-npr-starter]', 'graphite')
  await appWindow.waitForSelector('[data-npr-pages]:not([hidden])', { timeout: 3_000 })

  const state = await appWindow.evaluate(() => {
    const boxes = [...document.querySelectorAll('[data-npr-page]')]
    return {
      names: boxes.map(b => b.dataset.nprPage),
      allChecked: boxes.every(b => b.checked),
      selectAllChecked: document.querySelector('[data-npr-pages-all]').checked
    }
  })
  expect(state.names).toEqual(['index', 'elements', 'left-sidebar', 'right-sidebar', 'no-sidebar'])
  expect(state.allChecked).toBe(true)
  expect(state.selectAllChecked).toBe(true)

  await app.close()
})

test('Single-page starters (landing) never show the checklist; Blank hides it again after Graphite', async () => {
  const { app, appWindow } = await launch()
  await openNewProjectDialog(appWindow)

  await appWindow.selectOption('[data-npr-starter]', 'landing')
  expect(await appWindow.evaluate(() => document.querySelector('[data-npr-pages]').hidden)).toBe(true)

  await appWindow.selectOption('[data-npr-starter]', 'graphite')
  expect(await appWindow.evaluate(() => document.querySelector('[data-npr-pages]').hidden)).toBe(false)

  await appWindow.selectOption('[data-npr-starter]', 'blank')
  const afterBlank = await appWindow.evaluate(() => ({
    hidden: document.querySelector('[data-npr-pages]').hidden,
    itemCount: document.querySelectorAll('[data-npr-page]').length
  }))
  expect(afterBlank.hidden).toBe(true)
  expect(afterBlank.itemCount).toBe(0) // emptied, not just hidden — a stale list must never reach submit()

  await app.close()
})

test('Select-all round-trips: unchecking clears every item, rechecking checks every item', async () => {
  const { app, appWindow } = await launch()
  await openNewProjectDialog(appWindow)
  await appWindow.selectOption('[data-npr-starter]', 'graphite')
  await appWindow.waitForSelector('[data-npr-pages]:not([hidden])', { timeout: 3_000 })

  await appWindow.click('[data-npr-pages-all]')
  expect(await appWindow.evaluate(() =>
    [...document.querySelectorAll('[data-npr-page]')].filter(b => b.checked).length
  )).toBe(0)

  await appWindow.click('[data-npr-pages-all]')
  expect(await appWindow.evaluate(() =>
    [...document.querySelectorAll('[data-npr-page]')].filter(b => b.checked).length
  )).toBe(5)

  await app.close()
})

test('Unchecking one item drops select-all to unchecked; re-checking it manually restores select-all', async () => {
  const { app, appWindow } = await launch()
  await openNewProjectDialog(appWindow)
  await appWindow.selectOption('[data-npr-starter]', 'graphite')
  await appWindow.waitForSelector('[data-npr-pages]:not([hidden])', { timeout: 3_000 })

  await appWindow.click('[data-npr-page="elements"]')
  expect(await appWindow.evaluate(() =>
    document.querySelector('[data-npr-pages-all]').checked)).toBe(false)

  await appWindow.click('[data-npr-page="elements"]')
  expect(await appWindow.evaluate(() =>
    document.querySelector('[data-npr-pages-all]').checked)).toBe(true)

  await app.close()
})

test('Zero pages checked blocks submit with an inline error; dialog stays open', async () => {
  const { app, appWindow } = await launch()
  await openNewProjectDialog(appWindow)
  await appWindow.selectOption('[data-npr-starter]', 'graphite')
  await appWindow.waitForSelector('[data-npr-pages]:not([hidden])', { timeout: 3_000 })

  await appWindow.click('[data-npr-pages-all]') // unchecks every item
  await appWindow.click('[data-npr-ok]')

  await appWindow.waitForSelector('[data-npr-error]:not([hidden])', { timeout: 3_000 })
  // Validation must block BEFORE project.new() runs — if it didn't, the
  // native parent-folder picker would open and this evaluate() would hang
  // waiting on an OS-modal dialog Playwright never dismisses.
  expect(await appWindow.evaluate(() => !!document.querySelector('.gstrap-prompt-card'))).toBe(true)

  await app.close()
})

test('Esc closes the dialog', async () => {
  const { app, appWindow } = await launch()
  await openNewProjectDialog(appWindow)
  await appWindow.selectOption('[data-npr-starter]', 'graphite')
  await appWindow.waitForSelector('[data-npr-pages]:not([hidden])', { timeout: 3_000 })

  await appWindow.keyboard.press('Escape')
  await appWindow.waitForFunction(
    () => document.querySelector('[data-npr-starter]') === null,
    null, { timeout: 5_000 })

  await app.close()
})
