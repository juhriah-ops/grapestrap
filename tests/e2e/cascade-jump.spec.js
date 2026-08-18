/**
 * GrapeStrap — E2E: jump to a CSS rule (F3a)
 *
 * PATH: tests/e2e/cascade-jump.spec.js
 * ROLE: Right-click a Cascade rule or a class chip and land on the rule that
 *       produced it. Covers all three rule origins — the project's own sheet
 *       (Custom CSS panel), the app-managed Bootstrap sheet (Bootstrap panel),
 *       and a stylesheet that belongs to the project but has no panel (a
 *       starter's vendored sheet → the code lane) — plus the enabled/disabled
 *       states the class-chip menu reports for a class that has no rule.
 * DEPENDS: @playwright/test, ./helpers.js,
 *          src/renderer/panels/style-manager/cascade.js,
 *          src/renderer/panels/style-manager/css-jump.js,
 *          src/renderer/panels/properties-side/index.js
 * CREATED: 2026-08-18
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag, createBundledStarterProject } from './helpers.js'

// English catalog strings (plugins/lang-en/messages.json) — asserted verbatim
// so a key that silently stops resolving fails here instead of shipping a raw
// key as a menu label.
const GOTO_CUSTOM = 'Go to Rule in Custom CSS'
const GOTO_BOOTSTRAP = 'Go to Rule in Bootstrap CSS'

/**
 * Fire a contextmenu at an element and return the menu that opens.
 * Dispatched rather than clicked: the Cascade rows sit inside whichever right
 * tab is currently behind the front one, and this spec is about the menu, not
 * about tab activation as a precondition for reaching it.
 */
async function openMenuOn(appWindow, cssSelector) {
  await appWindow.evaluate(selector => {
    const el = document.querySelector(selector)
    if (!el) throw new Error(`no element matching ${selector}`)
    const rect = el.getBoundingClientRect()
    el.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(rect.left) + 4,
      clientY: Math.round(rect.top) + 4
    }))
  }, cssSelector)
  await appWindow.waitForSelector('.gstrap-ctxmenu', { state: 'attached', timeout: 5_000 })
  return await appWindow.$$eval('.gstrap-ctxmenu-item', nodes => nodes.map(node => ({
    label: node.querySelector('.gstrap-ctxmenu-label').textContent,
    disabled: node.classList.contains('is-disabled')
  })))
}

/** Activate an open menu's item by its exact label. */
async function clickMenuItem(appWindow, label) {
  await appWindow.evaluate(text => {
    const item = [...document.querySelectorAll('.gstrap-ctxmenu-item')]
      .find(node => node.querySelector('.gstrap-ctxmenu-label').textContent === text)
    if (!item) throw new Error(`menu item not found: ${text}`)
    item.click()
  }, label)
}

/** Open the Cascade accordion section in the Style Manager. */
async function openCascadeSection(appWindow) {
  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-sm-section[data-sp="cascade"] [data-toggle="cascade"]').click()
  })
}

test('Cascade: a project rule jumps to Custom CSS, a Bootstrap rule to the Bootstrap panel', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-jump-'))
  const projectPath = join(projectDir, 'jump.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  // One class with a rule in the project sheet, one with a rule in Bootstrap.
  await appWindow.evaluate(() => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    const selected = editor.getSelected()
    selected.setClass([...(selected.getClasses() || []), 'btn', 'my-heading'])
    const { projectState, eventBus } = window.__gstrap
    projectState.current.globalCSS =
      (projectState.current.globalCSS || '') + '\n.my-heading { letter-spacing: 0.5px; }\n'
    projectState.markCssDirty()
    eventBus.emit('project:css-changed')
  })

  await openCascadeSection(appWindow)

  // ── Project rule → Custom CSS ──────────────────────────────────────────────
  const projectRow = '.gstrap-sm-cascade-rule[data-origin="project"][data-selector=".my-heading"]'
  await appWindow.waitForSelector(projectRow, { state: 'attached', timeout: 10_000 })

  const projectItems = await openMenuOn(appWindow, projectRow)
  expect(projectItems.map(item => item.label)).toContain(GOTO_CUSTOM)
  expect(projectItems.find(item => item.label === GOTO_CUSTOM).disabled).toBe(false)
  await clickMenuItem(appWindow, GOTO_CUSTOM)

  await appWindow.waitForFunction(() => {
    const active = document.querySelector('.lm_tab.lm_active[title="Custom CSS"]')
    const editor = window.__gstrap.getCssEditor()
    const model = editor?.getModel()
    if (!active || !model) return false
    return model.getValueInRange(editor.getSelection()) === '.my-heading'
  }, null, { timeout: 10_000 })

  // ── Bootstrap rule → the Bootstrap panel ───────────────────────────────────
  // The framework sheet loads into the canvas iframe asynchronously, so the
  // .btn row can appear a beat after the cascade first renders.
  const bootstrapRow = '.gstrap-sm-cascade-rule[data-origin="bootstrap"][data-selector=".btn"]'
  await appWindow.waitForSelector(bootstrapRow, { state: 'attached', timeout: 20_000 })

  const bootstrapItems = await openMenuOn(appWindow, bootstrapRow)
  expect(bootstrapItems.map(item => item.label)).toContain(GOTO_BOOTSTRAP)
  expect(bootstrapItems.find(item => item.label === GOTO_BOOTSTRAP).disabled).toBe(false)
  await clickMenuItem(appWindow, GOTO_BOOTSTRAP)

  await appWindow.waitForFunction(() => {
    const active = document.querySelector('.lm_tab.lm_active[title="Bootstrap"]')
    const editor = window.__gstrap.getBootstrapCssEditor()
    const model = editor?.getModel()
    if (!active || !model) return false
    return model.getValueInRange(editor.getSelection()) === '.btn'
  }, null, { timeout: 10_000 })

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Cascade: a starter project reaches its theme sheet by panel and its vendored sheets by code lane', async () => {
  // Graphite vendors its own framework and points manifest.globalCSS at
  // assets/css/theme.css — so the starter's theme rules ARE the Custom CSS
  // panel's buffer, and it is the vendored sheets under site/assets/vendor/
  // that have no panel of their own and route to the file-tab code lane.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-jump-graphite-'))
  const projectPath = join(projectDir, 'jumpgraphite.gstrap')

  const { app, appWindow } = await launch()
  await createBundledStarterProject(appWindow, projectPath, { starterId: 'graphite' })
  // h2, not h1: Graphite's pages have no <h1> at all (src/main/starters/
  // graphite.js), so selecting one left NOTHING selected — and with no
  // selection the Style Manager renders its empty state, which has no Cascade
  // section to open. theme.css styles `h1, h2, …` and `h2` directly, so an h2
  // carries the project-origin rules this test is about.
  const selectedTag = await selectFirstByTag(appWindow, 'h2')
  expect(selectedTag, 'no <h2> in the Graphite starter to select').toBe('h2')
  await openCascadeSection(appWindow)

  // theme.css is this project's own stylesheet → the Custom CSS panel.
  const themeRow = '.gstrap-sm-cascade-rule[data-origin="project"]'
  await appWindow.waitForSelector(themeRow, { state: 'attached', timeout: 20_000 })
  const themeItems = await openMenuOn(appWindow, themeRow)
  expect(themeItems.map(item => item.label)).toContain(GOTO_CUSTOM)

  // A vendored sheet resolves under site/ → offered in the code lane, by path.
  // Pinned to a row whose sheet HAS a file behind it: the same "other" bucket
  // also holds GrapesJS's own injected <style> rules, which have no href and
  // deliberately get the disabled explainer instead.
  const vendorRow = '.gstrap-sm-cascade-rule[data-origin="other"][data-href*="/assets/"]'
  await appWindow.waitForSelector(vendorRow, { state: 'attached', timeout: 20_000 })
  const vendorItems = await openMenuOn(appWindow, vendorRow)
  const openItem = vendorItems.find(item => /^Open assets\/.+\.css in Code View$/.test(item.label))
  expect(openItem, `expected an open-in-code-view item, got ${JSON.stringify(vendorItems)}`).toBeTruthy()
  expect(openItem.disabled).toBe(false)

  await clickMenuItem(appWindow, openItem.label)
  await appWindow.waitForFunction(() => {
    const tabs = window.__gstrap.pageState.tabs || []
    return tabs.some(tab => tab.kind === 'file' && tab.pageName.startsWith('assets/'))
  }, null, { timeout: 10_000 })

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Class chips: both goto items are offered, enabled only for the sheet that has the rule', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-jump-chip-'))
  const projectPath = join(projectDir, 'jumpchip.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  await appWindow.evaluate(() => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    const selected = editor.getSelected()
    selected.setClass([...(selected.getClasses() || []), 'btn', 'my-heading'])
    const { projectState, eventBus } = window.__gstrap
    projectState.current.globalCSS =
      (projectState.current.globalCSS || '') + '\n.my-heading { letter-spacing: 0.5px; }\n'
    projectState.markCssDirty()
    eventBus.emit('project:css-changed')
  })
  await appWindow.waitForSelector('.gstrap-chip[data-class="my-heading"]', { state: 'attached', timeout: 10_000 })

  // A class that only the project sheet defines.
  const projectClassItems = await openMenuOn(appWindow, '.gstrap-chip[data-class="my-heading"]')
  const projectGoto = projectClassItems.find(item => item.label === GOTO_CUSTOM)
  const projectGotoBs = projectClassItems.find(item => item.label === GOTO_BOOTSTRAP)
  expect(projectGoto.disabled).toBe(false)
  expect(projectGotoBs.disabled, 'no .my-heading rule in Bootstrap').toBe(true)

  // A class that only Bootstrap defines.
  const bsClassItems = await openMenuOn(appWindow, '.gstrap-chip[data-class="btn"]')
  expect(bsClassItems.find(item => item.label === GOTO_CUSTOM).disabled,
    'no .btn rule in the project sheet').toBe(true)
  expect(bsClassItems.find(item => item.label === GOTO_BOOTSTRAP).disabled).toBe(false)

  // The chip menu kept its Bootstrap-docs group (btn is a documented class).
  expect(bsClassItems.some(item => item.label.startsWith('More info: Bootstrap'))).toBe(true)

  // Jumping from a chip lands the same selection the Cascade row does.
  await clickMenuItem(appWindow, GOTO_BOOTSTRAP)
  await appWindow.waitForFunction(() => {
    const editor = window.__gstrap.getBootstrapCssEditor()
    const model = editor?.getModel()
    if (!model) return false
    return model.getValueInRange(editor.getSelection()) === '.btn'
  }, null, { timeout: 10_000 })

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
