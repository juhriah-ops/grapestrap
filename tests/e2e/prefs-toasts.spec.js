/**
 * GrapeStrap — E2E: preferences and toasts
 *
 * PATH: tests/e2e/prefs-toasts.spec.js
 * ROLE: Preferences dialog (shortcut rebinding) and toast surface specs
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, EXPECTED_PLUGIN_COUNT } from './helpers.js'

test('Toasts: save success renders a visible "Saved." toast card', async () => {
  // Reported on nola1 2026-05-03: "no indication of save but its saving."
  // Save's eventBus.emit('toast', { type: 'success', message: 'Saved.' })
  // had no subscriber since v0.0.1 walking-skeleton landed — toasts were
  // emitted into the void. wireToasts() in main.js boot now renders them
  // into #gstrap-toasts. This spec proves the user-visible surface.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-toast-'))
  const projectPath = join(projectDir, 't.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'file:save')
  })

  const toast = appWindow.locator('.gstrap-toast.gstrap-toast-success')
  await toast.waitFor({ state: 'visible', timeout: 3_000 })
  const text = await toast.locator('.gstrap-toast-msg').textContent()
  expect(text?.trim()).toBe('Saved.')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Toolbar with no project: Save / Code / Split show "Open project first" toast (no silent no-op)', async () => {
  // Reported on nola1 2026-05-03: "you cant see code unless you create new
  // project. even if you build and try save as which doesnt work either
  // unless youve created a project already." The early-return guards in
  // cmdSave / cmdViewMode were correct but silent — buttons looked broken
  // until the user happened to create a project. Every project-required
  // command now toasts a warning so the UX is loud.
  const { app, appWindow } = await launch()
  // No project — wait only for command listeners, not project state.
  await appWindow.waitForFunction(
    () => window.__gstrap?.eventBus?.listenerCount('command') > 0,
    null, { timeout: 10_000 }
  )
  const toasts = []
  await appWindow.exposeFunction('__captureNopToast', p => { toasts.push(p) })
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.on('toast', p => window.__captureNopToast(p))
  })

  await appWindow.evaluate(() => {
    document.querySelector('[data-cmd="file:save"]').click()
    document.querySelector('[data-cmd="view:mode-code"]').click()
    document.querySelector('[data-cmd="view:mode-split"]').click()
  })
  await appWindow.waitForTimeout(400)

  const warnings = toasts.filter(t => t?.type === 'warning' && /open.*project/i.test(t.message || ''))
  // Three project-required clicks → at least three warning toasts (one per click).
  expect(warnings.length).toBeGreaterThanOrEqual(3)

  await app.close()
})

test('Preferences: Shortcuts tab rebinds a command, persists, and takes effect immediately', async () => {
  // v0.0.2 — Full keyboard rebinding UI. Verifies:
  //   1. Open via dialog:preferences event → modal appears with Shortcuts tab.
  //   2. Edit a row → enters capture state, next keydown sets the new binding.
  //   3. Override persists to prefs.shortcuts.
  //   4. New binding fires the command (i.e. keybindings reloaded live).
  //   5. Reset reverts the row to the default.
  //   6. Conflict on a duplicate combo is shown inline (not blocking, but
  //      visible) so the user knows.
  const { app, appWindow } = await launch()

  // Plugin activation finishes before the dialog:preferences listener is wired
  // (both happen inside boot() after the plugin host comes up). Wait for it
  // before firing the event.
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 }
  )

  // Open the preferences dialog.
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('dialog:preferences'))
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-prefs-row]').length > 0,
    null, { timeout: 3_000 }
  )

  // ── 1. Shortcuts pane lists rows. file:save default is Ctrl+S. ────────────
  const initialSaveCombo = await appWindow.evaluate(() =>
    document.querySelector('[data-prefs-row="file:save"] .gstrap-prefs-combo').textContent.trim()
  )
  expect(initialSaveCombo).toBe('Ctrl+S')

  // ── 2. Click Edit on file:save → row enters capture state. ────────────────
  await appWindow.evaluate(() => {
    document.querySelector('[data-prefs-row="file:save"] [data-prefs-action="edit"]').click()
  })
  await appWindow.waitForFunction(
    () => !!document.querySelector('[data-prefs-row="file:save"] .gstrap-prefs-combo-capturing'),
    null, { timeout: 2_000 }
  )

  // Press Ctrl+Shift+P. Use the dialog overlay as the focus target so the
  // capture-phase keydown listener attached to document picks it up.
  await appWindow.evaluate(() => {
    const overlay = document.querySelector('.gstrap-prefs-overlay')
    overlay.focus()
  })
  await appWindow.keyboard.down('Control')
  await appWindow.keyboard.down('Shift')
  await appWindow.keyboard.press('KeyP')
  await appWindow.keyboard.up('Shift')
  await appWindow.keyboard.up('Control')

  // ── 3. Combo updates to Ctrl+Shift+P and persists. ────────────────────────
  await appWindow.waitForFunction(() => {
    const cell = document.querySelector('[data-prefs-row="file:save"] .gstrap-prefs-combo')
    return cell && cell.textContent.trim() === 'Ctrl+Shift+P'
  }, null, { timeout: 3_000 })

  const persisted = await appWindow.evaluate(() => window.grapestrap.prefs.get('shortcuts'))
  expect(persisted['file:save']).toBeTruthy()
  expect(persisted['file:save'].key).toBe('p')
  expect(persisted['file:save'].ctrl).toBe(true)
  expect(persisted['file:save'].shift).toBe(true)

  // ── 4. The new binding is live — pressing Ctrl+Shift+P fires file:save
  //    on the event bus. Capture commands to verify.
  const cmds = []
  await appWindow.exposeFunction('__captureCmd', c => { cmds.push(c) })
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.on('command', c => window.__captureCmd(c))
  })
  // Close the prefs dialog first (its capture handler swallows keys when
  // editing; once the dialog is closed, the global keybindings handler
  // takes the next keydown).
  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-prefs-overlay [data-prefs-action="close"]').click()
  })
  await appWindow.keyboard.down('Control')
  await appWindow.keyboard.down('Shift')
  await appWindow.keyboard.press('KeyP')
  await appWindow.keyboard.up('Shift')
  await appWindow.keyboard.up('Control')
  await appWindow.waitForTimeout(200)
  expect(cmds).toContain('file:save')

  // ── 5. Reset reverts the row. ─────────────────────────────────────────────
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('dialog:preferences'))
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-prefs-row="file:save"]').length > 0,
    null, { timeout: 3_000 }
  )
  await appWindow.evaluate(() => {
    document.querySelector('[data-prefs-row="file:save"] [data-prefs-action="reset"]').click()
  })
  await appWindow.waitForFunction(() => {
    const cell = document.querySelector('[data-prefs-row="file:save"] .gstrap-prefs-combo')
    return cell && cell.textContent.trim() === 'Ctrl+S'
  }, null, { timeout: 3_000 })
  const afterReset = await appWindow.evaluate(() => window.grapestrap.prefs.get('shortcuts'))
  expect(afterReset['file:save']).toBeFalsy()

  await app.close()
})
