/**
 * GrapeStrap — E2E: About modal
 *
 * PATH: tests/e2e/about.spec.js
 * ROLE: Wave 5 About modal — real menu path (Help → About GrapeStrap via
 *       the native application menu) opens the modal; version text matches
 *       the RUNTIME app.getVersion() (never hardcoded); the no-telemetry
 *       pledge renders; Close dismisses.
 * DEPENDS: @playwright/test, ./helpers.js, src/renderer/dialogs/about.js
 * CREATED: 2026-07-12
 */
import { test, expect } from '@playwright/test'
import { launch, dismissWelcome } from './helpers.js'

// Menu labels resolve from the on-disk lang-en catalog (menu-i18n.js) —
// threaded as args so the evaluate predicate stays constant-free.
const MENU_LABELS = { help: '&Help', about: 'About GrapeStrap' }

test('About modal: Help menu opens it, shows runtime version + no-telemetry pledge, Close dismisses', async () => {
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)

  // Ground truth for the version assertion: Electron's own runtime value.
  const expectedVersion = await app.evaluate(({ app: electronApp }) => electronApp.getVersion())
  expect(expectedVersion).not.toBe('')

  // Drive the REAL menu path: MenuItem.click() runs the same handler a user
  // click does (main → menu:action IPC → menu-router → dialog:about).
  const clicked = await app.evaluate(({ Menu }, labels) => {
    const menu = Menu.getApplicationMenu()
    const help = menu?.items.find(i => i.label === labels.help)
    const about = help?.submenu?.items.find(i => i.label === labels.about)
    if (!about) return false
    about.click()
    return true
  }, MENU_LABELS)
  expect(clicked).toBe(true)

  await appWindow.waitForFunction(
    () => !!document.querySelector('.gstrap-about [data-about-version]'),
    null, { timeout: 5_000 }
  )

  const shown = await appWindow.evaluate(() => ({
    version: document.querySelector('.gstrap-about [data-about-version]')?.textContent || '',
    pledge:  document.querySelector('.gstrap-about [data-about-pledge]')?.textContent || ''
  }))
  expect(shown.version).toBe(expectedVersion)
  expect(shown.pledge).toContain('sends no telemetry')

  // Close button dismisses the modal.
  await appWindow.click('.gstrap-about [data-action="dismiss"]')
  await appWindow.waitForFunction(
    () => !document.querySelector('.gstrap-about'),
    null, { timeout: 3_000 }
  )

  await app.close()
})
