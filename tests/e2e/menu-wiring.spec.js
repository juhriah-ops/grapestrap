/**
 * GrapeStrap — E2E: native-menu wiring sweep
 *
 * PATH: tests/e2e/menu-wiring.spec.js
 * ROLE: Every menu item this round wired for real gets driven through the
 *       REAL native application menu (MenuItem.click() → menu:action IPC →
 *       menu-router), same pattern as about.spec.js: the View toggles
 *       (Linked Files / Breakpoint Slider / Custom CSS), the Insert menu's
 *       insert:focus-tab routing, Edit → Find/Replace into Monaco's find
 *       widget, File → Project Settings rename, and Edit → Find in Project
 *       search + click-through to Code view.
 * DEPENDS: @playwright/test, ./helpers.js, src/renderer/shortcuts/menu-router.js
 * CREATED: 2026-08-06
 */
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome } from './helpers.js'

// Menu labels resolve from the on-disk lang-en catalog (menu-i18n.js) —
// threaded as args so evaluate predicates stay constant-free.
const L = {
  file: '&File', edit: '&Edit', view: '&View', insert: '&Insert',
  projectSettings: 'Project Settings…',
  find: 'Find', replace: 'Replace', findInProject: 'Find in Project',
  toggleLinked: 'Toggle Linked Files',
  toggleBreakpoints: 'Toggle Breakpoint Slider',
  toggleCustomCss: 'Toggle Custom CSS',
  insertForms: 'Forms'
}

async function clickMenuItem(app, topLabel, itemLabel) {
  const clicked = await app.evaluate(({ Menu }, [top, label]) => {
    const menu = Menu.getApplicationMenu()
    const topItem = menu?.items.find(i => i.label === top)
    const item = topItem?.submenu?.items.find(i => i.label === label)
    if (!item) return false
    item.click()
    return true
  }, [topLabel, itemLabel])
  expect(clicked, `menu item ${topLabel} → ${itemLabel}`).toBe(true)
}

async function seededLaunch() {
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-menuwire-'))
  const projectPath = join(projectDir, 'menuwire.gstrap')
  await openSeedProject(appWindow, projectPath)
  return { app, appWindow, projectPath }
}

test('View toggles: Linked Files, Breakpoint Slider, Custom CSS route through the native menu', async () => {
  const { app, appWindow } = await seededLaunch()

  // Linked Files + Breakpoints bars are visible with a page tab open;
  // one menu click hides, a second restores.
  for (const [label, id] of [
    [L.toggleLinked, 'gstrap-linkedfiles'],
    [L.toggleBreakpoints, 'gstrap-breakpoints']
  ]) {
    const visibleBefore = await appWindow.evaluate(i => !document.getElementById(i).hidden, id)
    expect(visibleBefore, `${id} visible before toggle`).toBe(true)
    await clickMenuItem(app, L.view, label)
    await appWindow.waitForFunction(i => document.getElementById(i).hidden, id, { timeout: 3_000 })
    await clickMenuItem(app, L.view, label)
    await appWindow.waitForFunction(i => !document.getElementById(i).hidden, id, { timeout: 3_000 })
  }

  // Custom CSS is a right-stack tab — hidden via a body class.
  await clickMenuItem(app, L.view, L.toggleCustomCss)
  await appWindow.waitForFunction(
    () => document.body.classList.contains('is-hide-custom-css'), null, { timeout: 3_000 })
  await clickMenuItem(app, L.view, L.toggleCustomCss)
  await appWindow.waitForFunction(
    () => !document.body.classList.contains('is-hide-custom-css'), null, { timeout: 3_000 })

  await app.close()
})

test('Insert menu focuses the matching Insert-panel tab', async () => {
  const { app, appWindow } = await seededLaunch()

  await clickMenuItem(app, L.insert, L.insertForms)
  await appWindow.waitForFunction(() => {
    const active = document.querySelector('#gstrap-insert .gstrap-insert-tab.is-active')
    return active?.dataset.tab === 'forms'
  }, null, { timeout: 3_000 })

  await app.close()
})

test('Edit → Find switches Design to Split and opens the Monaco find widget; Replace opens it too', async () => {
  const { app, appWindow } = await seededLaunch()

  const modeBefore = await appWindow.evaluate(() => window.__gstrap.pageState.active().viewMode)
  expect(modeBefore).toBe('design')

  await clickMenuItem(app, L.edit, L.find)
  await appWindow.waitForFunction(
    () => window.__gstrap.pageState.active().viewMode === 'split', null, { timeout: 5_000 })
  await appWindow.waitForFunction(
    () => !!document.querySelector('.monaco-editor .find-widget.visible'), null, { timeout: 5_000 })

  // Replace upgrades the widget to its replace form (replaceToggled) — and
  // proves the Ctrl+H accelerator path lands in Monaco instead of a toast.
  await clickMenuItem(app, L.edit, L.replace)
  await appWindow.waitForFunction(
    () => !!document.querySelector('.monaco-editor .find-widget.visible.replaceToggled'),
    null, { timeout: 5_000 })

  await app.close()
})

test('File → Project Settings renames the project and the status bar follows', async () => {
  const { app, appWindow } = await seededLaunch()

  await clickMenuItem(app, L.file, L.projectSettings)
  await appWindow.waitForFunction(
    () => !!document.querySelector('[data-ps-field="name"]'), null, { timeout: 3_000 })

  await appWindow.fill('[data-ps-field="name"]', 'Renamed Project')
  await appWindow.click('[data-ps-action="save"]')

  await appWindow.waitForFunction(
    () => window.__gstrap.projectState.current.manifest.metadata.name === 'Renamed Project',
    null, { timeout: 3_000 })
  const statusBar = await appWindow.evaluate(() => document.getElementById('gstrap-status').textContent)
  expect(statusBar).toContain('Renamed Project')

  // Empty name is rejected, dialog stays open, name untouched.
  await clickMenuItem(app, L.file, L.projectSettings)
  await appWindow.waitForFunction(
    () => !!document.querySelector('[data-ps-field="name"]'), null, { timeout: 3_000 })
  await appWindow.fill('[data-ps-field="name"]', '   ')
  await appWindow.click('[data-ps-action="save"]')
  const afterEmpty = await appWindow.evaluate(() => ({
    dialogOpen: !!document.querySelector('[data-ps-field="name"]'),
    name: window.__gstrap.projectState.current.manifest.metadata.name
  }))
  expect(afterEmpty.dialogOpen).toBe(true)
  expect(afterEmpty.name).toBe('Renamed Project')

  await app.close()
})

test('Edit → Find in Project lists matches and click-through opens the page in Code view', async () => {
  const { app, appWindow } = await seededLaunch()

  await clickMenuItem(app, L.edit, L.findInProject)
  await appWindow.waitForFunction(
    () => !!document.querySelector('[data-fip-field="query"]'), null, { timeout: 3_000 })

  // The seed project's index page body contains this string verbatim.
  await appWindow.fill('[data-fip-field="query"]', 'Welcome to your new GrapeStrap project')
  await appWindow.waitForFunction(() => {
    const hits = document.querySelectorAll('.gstrap-fip-hit[data-fip-kind="page"]')
    return hits.length >= 1
  }, null, { timeout: 3_000 })

  await appWindow.click('.gstrap-fip-hit[data-fip-kind="page"]')
  await appWindow.waitForFunction(() => {
    const tab = window.__gstrap.pageState.active()
    return tab?.kind === 'page' && tab.viewMode === 'code' &&
      !document.querySelector('[data-fip-field="query"]')
  }, null, { timeout: 5_000 })

  // No-match query reports rather than showing a stale list.
  await clickMenuItem(app, L.edit, L.findInProject)
  await appWindow.waitForFunction(
    () => !!document.querySelector('[data-fip-field="query"]'), null, { timeout: 3_000 })
  await appWindow.fill('[data-fip-field="query"]', 'zz-no-such-string-zz')
  await appWindow.waitForFunction(() =>
    !document.querySelector('.gstrap-fip-hit') &&
    !!document.querySelector('.gstrap-fip-results .gstrap-pp-fav-empty'),
  null, { timeout: 3_000 })

  await app.close()
})
