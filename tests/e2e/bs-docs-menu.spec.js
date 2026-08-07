/**
 * GrapeStrap — E2E: "More info" Bootstrap-docs context items
 *
 * PATH: tests/e2e/bs-docs-menu.spec.js
 * ROLE: Right-clicking a Bootstrap-classed element on the canvas appends
 *       "More info: Bootstrap <topic>" deep-links to the context menu
 *       (col-md-6 → Columns, mt-3 → Spacing); a plain element gets none.
 *       Right-clicking a class chip in the Properties panel opens a menu
 *       with that class's docs link, and an unrecognized class shows the
 *       disabled no-docs explainer.
 * DEPENDS: @playwright/test, ./helpers.js, src/shared/bs-docs.js,
 *          src/renderer/shortcuts/component-actions.js,
 *          src/renderer/panels/properties-side/index.js
 * CREATED: 2026-08-07
 */
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome } from './helpers.js'

async function seeded() {
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-bsdocs-'))
  await openSeedProject(appWindow, join(projectDir, 'bsdocs.gstrap'))
  return { app, appWindow }
}

test('canvas right-click on a Bootstrap-classed element lists More info links; plain element does not', async () => {
  const { app, appWindow } = await seeded()

  // Bootstrap-classed element via the single context-menu open path (the
  // same event the canvas iframe and DOM tree emit).
  const withClasses = await appWindow.evaluate(() => {
    const gjs = window.__gstrap.pluginRegistry.bound.editor
    const [comp] = gjs.getWrapper().append('<div class="col-md-6 mt-3">grid cell</div>')
    gjs.select(comp)
    window.__gstrap.eventBus.emit('canvas:context-menu', { x: 200, y: 200, component: comp })
    return [...document.querySelectorAll('.gstrap-ctxmenu-label')].map(el => el.textContent.trim())
  })
  expect(withClasses.some(l => l.includes('More info: Bootstrap Columns'))).toBe(true)
  expect(withClasses.some(l => l.includes('More info: Bootstrap Spacing'))).toBe(true)
  await appWindow.keyboard.press('Escape')

  // Element with no Bootstrap classes → no More info entries.
  const plain = await appWindow.evaluate(() => {
    const gjs = window.__gstrap.pluginRegistry.bound.editor
    const [comp] = gjs.getWrapper().append('<div class="my-own-thing">plain</div>')
    gjs.select(comp)
    window.__gstrap.eventBus.emit('canvas:context-menu', { x: 200, y: 200, component: comp })
    return [...document.querySelectorAll('.gstrap-ctxmenu-label')].map(el => el.textContent.trim())
  })
  expect(plain.some(l => l.includes('More info'))).toBe(false)
  await appWindow.keyboard.press('Escape')

  await app.close()
})

test('right-click on a Properties-panel class chip deep-links its docs; unknown class shows the explainer', async () => {
  const { app, appWindow } = await seeded()

  // Select an element carrying one known + one custom class, open the
  // Properties tab so the chips render.
  await appWindow.evaluate(() => {
    const gjs = window.__gstrap.pluginRegistry.bound.editor
    const [comp] = gjs.getWrapper().append('<div class="col-md-6 my-own-thing">cell</div>')
    gjs.select(comp)
    document.querySelector('.lm_tab[title="Properties"]')?.click()
  })
  await appWindow.waitForSelector('.gstrap-chip[data-class="col-md-6"]')

  await appWindow.click('.gstrap-chip[data-class="col-md-6"]', { button: 'right' })
  const known = await appWindow.evaluate(() =>
    [...document.querySelectorAll('.gstrap-ctxmenu-label')].map(el => el.textContent.trim()))
  expect(known.some(l => l.includes('More info: Bootstrap Columns'))).toBe(true)
  await appWindow.keyboard.press('Escape')

  await appWindow.click('.gstrap-chip[data-class="my-own-thing"]', { button: 'right' })
  const unknown = await appWindow.evaluate(() =>
    [...document.querySelectorAll('.gstrap-ctxmenu-label')].map(el => el.textContent.trim()))
  expect(unknown.some(l => l.includes('No Bootstrap docs'))).toBe(true)
  await appWindow.keyboard.press('Escape')

  await app.close()
})
