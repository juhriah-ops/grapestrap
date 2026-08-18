/**
 * GrapeStrap — E2E: class-name typeahead on the add-class input (F6)
 *
 * PATH: tests/e2e/class-typeahead.spec.js
 * ROLE: Drives the real popover (dialogs/typeahead.js) attached to the
 *       Properties panel's add-class input, with suggestions sourced by
 *       panels/properties-side/class-suggestions.js: typing opens it with
 *       real Bootstrap classes from the project's own bootstrap.css, the
 *       Enter/Esc/Tab/Arrow contract from the typeahead's header doc, and
 *       both project-stylesheet suggestion sources (globalCSS and the
 *       project's edited bootstrap.css) actually surfacing a class that only
 *       exists in each.
 * DEPENDS: @playwright/test, ./helpers.js,
 *          src/renderer/dialogs/typeahead.js,
 *          src/renderer/panels/properties-side/index.js,
 *          src/renderer/panels/properties-side/class-suggestions.js
 * CREATED: 2026-08-18
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag, dismissWelcome } from './helpers.js'

const ADD_CLASS_INPUT = '[data-field="add-class"]'

/**
 * Select the first <h1>, bring the Properties tab forward, and wait for the
 * add-class input to actually be there. Real Playwright input (fill/press)
 * is used throughout this file rather than evaluate()-dispatched events, so
 * (unlike the evaluate-only specs) the welcome modal has to be dismissed and
 * the tab genuinely has to be the frontmost one for those actions to land.
 */
async function openPropertiesOnH1(appWindow) {
  const selectedTag = await selectFirstByTag(appWindow, 'h1')
  expect(selectedTag, 'seed project has no <h1> to select').toBe('h1')
  await appWindow.evaluate(() => {
    document.querySelector('.lm_tab[title="Properties"]')?.click()
  })
  await appWindow.waitForSelector(ADD_CLASS_INPUT, { state: 'visible', timeout: 10_000 })
}

/** Suggestion row values currently rendered in the open popover. */
function typeaheadValues(appWindow) {
  return appWindow.$$eval('.gstrap-typeahead-item .gstrap-typeahead-value', nodes => nodes.map(n => n.textContent))
}

async function launchSeeded(prefix) {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), prefix))
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await openSeedProject(appWindow, join(projectDir, 'typeahead.gstrap'))
  await openPropertiesOnH1(appWindow)
  return { app, appWindow, projectDir }
}

test('typing lists real Bootstrap suggestions; ArrowDown+Enter commits a chip and applies the class on the canvas', async () => {
  const { app, appWindow, projectDir } = await launchSeeded('gstrap-typeahead-')

  await appWindow.fill(ADD_CLASS_INPUT, 'btn')
  await appWindow.waitForSelector('.gstrap-typeahead', { state: 'attached', timeout: 5_000 })

  const values = await typeaheadValues(appWindow)
  expect(values).toContain('btn')
  expect(values.some(v => v === 'btn-primary')).toBe(true)

  // The exact match ranks first (shortest prefix match) and carries the
  // bs-docs topic hint — proves class-suggestions.js's hint wiring, not just
  // its candidate list.
  const firstHint = await appWindow.$eval('.gstrap-typeahead-item:first-child .gstrap-typeahead-hint', el => el.textContent)
  expect(firstHint).toBe('Buttons')

  await appWindow.press(ADD_CLASS_INPUT, 'ArrowDown')
  await appWindow.waitForSelector('.gstrap-typeahead-item.is-active', { timeout: 3_000 })
  const activeValue = await appWindow.$eval('.gstrap-typeahead-item.is-active .gstrap-typeahead-value', el => el.textContent)
  expect(activeValue).toBe('btn')

  await appWindow.press(ADD_CLASS_INPUT, 'Enter')
  await appWindow.waitForSelector('.gstrap-typeahead', { state: 'detached', timeout: 3_000 })
  await appWindow.waitForSelector('.gstrap-chip[data-class="btn"]', { state: 'attached', timeout: 5_000 })

  const appliedOnComponent = await appWindow.evaluate(() =>
    window.__gstrap.pluginRegistry.bound.editor.getSelected()?.getClasses() || [])
  expect(appliedOnComponent).toContain('btn')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Esc closes the popover without touching the typed text; Enter afterwards commits it as raw text', async () => {
  const { app, appWindow, projectDir } = await launchSeeded('gstrap-typeahead-esc-')

  // A single character matches plenty of real classes (bg-*, border-*,
  // btn…), so the popover is guaranteed to open — but "b" alone is never
  // itself one of the suggested VALUES, which is what makes the eventual
  // chip proof that Enter committed the raw text rather than a pick.
  await appWindow.fill(ADD_CLASS_INPUT, 'b')
  await appWindow.waitForSelector('.gstrap-typeahead', { state: 'attached', timeout: 5_000 })
  const values = await typeaheadValues(appWindow)
  expect(values).not.toContain('b')

  await appWindow.press(ADD_CLASS_INPUT, 'Escape')
  await appWindow.waitForSelector('.gstrap-typeahead', { state: 'detached', timeout: 3_000 })
  await expect(appWindow.locator(ADD_CLASS_INPUT)).toHaveValue('b')

  await appWindow.press(ADD_CLASS_INPUT, 'Enter')
  await appWindow.waitForSelector('.gstrap-chip[data-class="b"]', { state: 'attached', timeout: 5_000 })
  // Still no popover — the Enter that just fired was never intercepted.
  expect(await appWindow.locator('.gstrap-typeahead').count()).toBe(0)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Tab commits the highlighted suggestion', async () => {
  const { app, appWindow, projectDir } = await launchSeeded('gstrap-typeahead-tab-')

  await appWindow.fill(ADD_CLASS_INPUT, 'car')
  await appWindow.waitForSelector('.gstrap-typeahead', { state: 'attached', timeout: 5_000 })
  await appWindow.press(ADD_CLASS_INPUT, 'ArrowDown')
  await appWindow.waitForSelector('.gstrap-typeahead-item.is-active', { timeout: 3_000 })
  const activeValue = await appWindow.$eval('.gstrap-typeahead-item.is-active .gstrap-typeahead-value', el => el.textContent)
  expect(activeValue).toBe('card')

  await appWindow.press(ADD_CLASS_INPUT, 'Tab')
  await appWindow.waitForSelector('.gstrap-typeahead', { state: 'detached', timeout: 3_000 })
  await appWindow.waitForSelector('.gstrap-chip[data-class="card"]', { state: 'attached', timeout: 5_000 })

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('suggestions include classes unique to globalCSS and to the project\'s edited bootstrap sheet', async () => {
  const { app, appWindow, projectDir } = await launchSeeded('gstrap-typeahead-sources-')

  // ── globalCSS-only class ────────────────────────────────────────────────
  // A query with no matches first, to prove the LATER match comes from the
  // cache actually being invalidated by project:css-changed, not from the
  // static enumeration already containing something coincidentally similar.
  await appWindow.fill(ADD_CLASS_INPUT, 'gstrap-e2e-global')
  await appWindow.waitForFunction(() => !document.querySelector('.gstrap-typeahead'), null, { timeout: 3_000 })

  await appWindow.evaluate(() => {
    const { projectState, eventBus } = window.__gstrap
    projectState.current.globalCSS =
      (projectState.current.globalCSS || '') + '\n.gstrap-e2e-global-only { color: red; }\n'
    projectState.markCssDirty()
    eventBus.emit('project:css-changed')
  })
  await appWindow.fill(ADD_CLASS_INPUT, 'gstrap-e2e-global')
  await appWindow.waitForSelector('.gstrap-typeahead', { state: 'attached', timeout: 5_000 })
  const globalValues = await typeaheadValues(appWindow)
  expect(globalValues).toContain('gstrap-e2e-global-only')
  const globalHint = await appWindow.evaluate(() => {
    const row = [...document.querySelectorAll('.gstrap-typeahead-item')]
      .find(el => el.querySelector('.gstrap-typeahead-value')?.textContent === 'gstrap-e2e-global-only')
    return row?.querySelector('.gstrap-typeahead-hint')?.textContent ?? null
  })
  expect(globalHint).toBe('project class')
  await appWindow.press(ADD_CLASS_INPUT, 'Escape')

  // ── Bootstrap-sheet-only class ──────────────────────────────────────────
  // Appended straight to projectState.current.bootstrapCSS via evaluate, per
  // the same direct-mutation pattern cascade-jump.spec.js uses for globalCSS
  // — exercises the real cache + project:bootstrap-css-changed invalidation
  // without going through Monaco.
  await appWindow.fill(ADD_CLASS_INPUT, 'gstrap-e2e-probe')
  await appWindow.waitForFunction(() => !document.querySelector('.gstrap-typeahead'), null, { timeout: 3_000 })

  await appWindow.evaluate(() => {
    const { projectState, eventBus } = window.__gstrap
    projectState.current.bootstrapCSS =
      (projectState.current.bootstrapCSS || '') + '\n.gstrap-e2e-probe-class { letter-spacing: 7px; }\n'
    projectState.markBootstrapCssDirty()
    eventBus.emit('project:bootstrap-css-changed')
  })
  await appWindow.fill(ADD_CLASS_INPUT, 'gstrap-e2e-probe')
  await appWindow.waitForSelector('.gstrap-typeahead', { state: 'attached', timeout: 5_000 })
  const bootstrapValues = await typeaheadValues(appWindow)
  expect(bootstrapValues).toContain('gstrap-e2e-probe-class')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
