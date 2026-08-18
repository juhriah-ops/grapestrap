// =============================================================
// PATH: tests/e2e/navbar-behaviors.spec.js
// ROLE: End-to-end coverage for the INSERT leg of the two harvested navbar
//       sections (graphite-navbar, orbit-navbar) — the canvas markup, both
//       CSS markers, and the behaviors delivery pair (manifest flag, the two
//       copied runtime files, and the page's behaviors <script> tag) that a
//       `behaviors: true` section def turns on via insert-section.js's
//       enableSectionBehaviors() → editor/behaviors.js's ensureBehaviors().
//       The Navbar SETTINGS TAB (F7 — sticky/fixed toggles, scroll effects,
//       hide-on-scroll) is a sibling work package's surface and is NOT
//       exercised here; this file only proves the two sections wire the
//       runtime up correctly on insert. Section DATA correctness (namespacing,
//       markers, previews) is linted in tests/unit/template-sections-data.test.js;
//       row-count/library-panel coverage lives in template-sections.spec.js.
// DEPENDS: ./helpers.js (launch, openSeedProject, dismissWelcome, fileExists),
//          plugins/blocks-sections/{graphite,orbit}-sections.js (the defs),
//          src/renderer/editor/{insert-section,behaviors}.js (the wiring),
//          src/shared/page-html.js (BEHAVIORS_SCRIPT's data-grpstr-fw tag)
// CREATED: 2026-08-18
// =============================================================
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome, fileExists } from './helpers.js'

/**
 * Click a bundled Library row's insert button — same click path as
 * template-sections.spec.js's insertBundled, minus that helper's class-count
 * wait (the two navbar roots differ in tag/depth, so each caller here waits
 * on its own canvas selector instead — see waitForCanvasSelector).
 *
 * @param {import('@playwright/test').Page} appWindow
 * @param {string} sectionId - Registered section id (the row's data attribute)
 */
async function clickBundledInsert(appWindow, sectionId) {
  await appWindow.evaluate(id => {
    document.querySelector(`[data-lib-bundled-insert="${id}"]`).click()
  }, sectionId)
}

/**
 * Wait for a selector to appear inside the canvas iframe document. Insertion
 * is async (assets/behaviors copy over IPC before the markup lands), so a
 * plain querySelector right after the click would race it.
 *
 * @param {import('@playwright/test').Page} appWindow
 * @param {string} selector - CSS selector to find inside the canvas frame
 */
async function waitForCanvasSelector(appWindow, selector) {
  await appWindow.waitForFunction(sel => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector(sel)
  }, selector, { timeout: 15_000 })
}

test('graphite-navbar insert wires markup, both CSS markers, and the behaviors delivery pair', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-navbeh-graphite-'))
  const projectPath = join(projectDir, 'navbeh.gstrap')
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await openSeedProject(appWindow, projectPath)

  await clickBundledInsert(appWindow, 'graphite-navbar')
  await waitForCanvasSelector(appWindow, 'header.gs-graphite-navbar')

  const markers = await appWindow.evaluate(() => {
    const css = window.__gstrap.projectState.current.globalCSS || ''
    return {
      base: css.includes('/* gs-sec:graphite-base */'),
      navbar: css.includes('/* gs-sec:graphite-navbar */')
    }
  })
  expect(markers.base).toBe(true)
  expect(markers.navbar).toBe(true)

  // The runtime pair lands on disk as a side effect of the insert itself
  // (main's behaviors:ensure, awaited inside insertBundledSection before the
  // markup is added) — no explicit save needed to see it, same as a bundled
  // section's copied images.
  expect(await fileExists(join(projectDir, 'site', 'assets', 'js', 'gstrap-behaviors.js'))).toBe(true)
  expect(await fileExists(join(projectDir, 'site', 'assets', 'css', 'gstrap-behaviors.css'))).toBe(true)

  // Save so the manifest flag and the page's behaviors <script> tag hit disk.
  await appWindow.evaluate(async () => {
    await window.grapestrap.project.save(window.__gstrap.projectState.current)
  })

  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(manifest.behaviors).toBeTruthy()

  const pageOnDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')
  expect(pageOnDisk).toContain('data-grpstr-fw="gsb-js"')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('orbit-navbar insert renders without the starter theme-picker', async () => {
  // The theme-picker (seven accent swatches, localStorage, data-theme wiring
  // in the starter's own main.js) is starter machinery the harvest rules
  // deliberately drop — see orbit-sections.js's header. This is the one
  // negative assertion nothing else in the suite makes.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-navbeh-orbit-'))
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await openSeedProject(appWindow, join(projectDir, 'navbeh.gstrap'))

  await clickBundledInsert(appWindow, 'orbit-navbar')
  await waitForCanvasSelector(appWindow, 'nav.gs-orbit-navbar')

  const hasThemePicker = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    return !!doc.querySelector('.theme-picker')
  })
  expect(hasThemePicker).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
