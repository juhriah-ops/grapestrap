/**
 * GrapeStrap — E2E: i18n runtime core
 *
 * PATH: tests/e2e/i18n.spec.js
 * ROLE: Wave 1 i18n specs — catalog resolution, missing-key fallback,
 *       interpolation, locale switch + pref persistence, save-toast UI probe.
 *       Wave 4 sweep probes — swept renderer strings render from an injected
 *       catalog (plain + interpolated + missing-key en fallback, all in
 *       visible DOM) and the native menu resolves its labels from the
 *       lang-en messages.json read from disk in the main process.
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject } from './helpers.js'

// i18n init completes right after plugin activation in main.js boot(), but
// window.__gstrap is assigned at module load — so probe isReady(), not mere
// presence of the i18n object. Null-safe: nothing here throws mid-boot.
async function waitForI18nReady(appWindow) {
  await appWindow.waitForFunction(
    () => window.__gstrap?.i18n?.isReady?.() === true,
    null, { timeout: 15_000 }
  )
}

test('i18n: t() resolves a lang-en catalog key after boot, locale is en', async () => {
  // Happy path across the whole pipeline: @grapestrap/lang-en registers its
  // catalog during activateAllPlugins(), initI18n() drains
  // pluginRegistry.languages into i18next, and t() resolves the flat dotted
  // key. "toast.saved" is a real catalog entry (plugins/lang-en/messages.json).
  const { app, appWindow } = await launch()
  await waitForI18nReady(appWindow)

  const got = await appWindow.evaluate(() => ({
    saved:  window.__gstrap.i18n.t('toast.saved'),
    locale: window.__gstrap.i18n.getLocale(),
    langs:  window.__gstrap.i18n.getAvailableLanguages()
  }))
  expect(got.saved).toBe('Saved.')
  expect(got.locale).toBe('en')
  expect(got.langs).toContainEqual({ code: 'en', name: 'English' })

  await app.close()
})

test('i18n: missing key falls back to the key itself; bad key returns empty string', async () => {
  // Contract: current locale → English → the key verbatim. A dotted key in
  // the UI is visible and greppable — the debugging affordance the Wave 4
  // extraction sweep relies on. Non-string/empty keys return '' (never throw).
  const { app, appWindow } = await launch()
  await waitForI18nReady(appWindow)

  const got = await appWindow.evaluate(() => ({
    missing: window.__gstrap.i18n.t('i18n.spec.__missing-probe__'),
    empty:   window.__gstrap.i18n.t(''),
    nonStr:  window.__gstrap.i18n.t(42)
  }))
  expect(got.missing).toBe('i18n.spec.__missing-probe__')
  expect(got.empty).toBe('')
  expect(got.nonStr).toBe('')

  await app.close()
})

test('i18n: single-brace interpolation matches the lang-en catalog format', async () => {
  // Catalog placeholders are {count}/{dir} (single braces), not i18next's
  // default {{double}} — the runtime configures interpolation.prefix/suffix.
  // Passing `count` also exercises i18next plural resolution falling back to
  // the base key (no _one/_other variants exist in lang-en today).
  const { app, appWindow } = await launch()
  await waitForI18nReady(appWindow)

  const got = await appWindow.evaluate(() =>
    window.__gstrap.i18n.t('toast.export-success', { count: 2, dir: '/tmp/x' })
  )
  expect(got).toBe('Exported 2 page(s) to /tmp/x')

  await app.close()
})

test('i18n: late-registered catalog + setLocale switch takes effect and persists the pref', async () => {
  // Simulates a community translation pack registering through the exact
  // event api.registerLanguage() emits (plugin-host/api.js:62). The runtime
  // absorbs it via its 'plugin:language-registered' listener; setLocale()
  // switches, persists general.language, and emits i18n:locale-changed.
  const { app, appWindow } = await launch()
  await waitForI18nReady(appWindow)

  const got = await appWindow.evaluate(async () => {
    const events = []
    window.__gstrap.eventBus.on('i18n:locale-changed', p => events.push(p))
    window.__gstrap.eventBus.emit('plugin:language-registered', {
      plugin: '@i18n-spec/lang-xx',
      language: { code: 'xx', name: 'Spec Test', messages: { 'toast.saved': 'Gespeichert.' } }
    })
    await window.__gstrap.i18n.setLocale('xx')
    return {
      overridden: window.__gstrap.i18n.t('toast.saved'),
      fallback:   window.__gstrap.i18n.t('menu.file'),   // absent in xx → English
      locale:     window.__gstrap.i18n.getLocale(),
      pref:       await window.grapestrap.prefs.get('general.language'),
      events
    }
  })
  expect(got.overridden).toBe('Gespeichert.')
  expect(got.fallback).toBe('File')
  expect(got.locale).toBe('xx')
  expect(got.pref).toBe('xx')
  expect(got.events).toContainEqual({ locale: 'xx' })

  await app.close()
})

test('i18n: setLocale rejects non-string codes (documented programmer-error contract)', async () => {
  const { app, appWindow } = await launch()
  await waitForI18nReady(appWindow)

  const threw = await appWindow.evaluate(async () => {
    try { await window.__gstrap.i18n.setLocale(42); return null }
    catch (err) { return err.message }
  })
  expect(threw).toContain('setLocale')

  await app.close()
})

// ── UI probe — REQUIRES the demo conversion (EDITS.md §3, menu-router.js:220
// emits t('toast.saved')). If the integrator drops that conversion, delete
// this spec with it. Proves the full pipeline lands in visible DOM: plugin
// catalog → registry → i18next → t() → toast card.
test('i18n: save toast renders through t() after a locale switch (demo conversion)', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-i18n-'))
  const projectPath = join(projectDir, 'i18n.gstrap')

  const { app, appWindow } = await launch()
  await waitForI18nReady(appWindow)
  await openSeedProject(appWindow, projectPath)

  await appWindow.evaluate(async () => {
    window.__gstrap.eventBus.emit('plugin:language-registered', {
      plugin: '@i18n-spec/lang-xx',
      language: { code: 'xx', name: 'Spec Test', messages: { 'toast.saved': 'Gespeichert.' } }
    })
    await window.__gstrap.i18n.setLocale('xx')
    window.__gstrap.eventBus.emit('command', 'file:save')
  })

  const toast = appWindow.locator('.gstrap-toast.gstrap-toast-success')
  await toast.waitFor({ state: 'visible', timeout: 3_000 })
  const text = await toast.locator('.gstrap-toast-msg').textContent()
  expect(text?.trim()).toBe('Gespeichert.')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ── Wave 4 sweep probes ──────────────────────────────────────────────────────

test('i18n sweep: swept toasts render from an injected catalog — plain, interpolated, and en fallback', async () => {
  // One locale switch, three toast probes, all landing in visible DOM:
  //   1. toast.no-project (swept in Wave 4, menu-router noProjectMsg()) —
  //      plain string from the xx catalog.
  //   2. toast.command-not-wired — {cmd} interpolation from the xx catalog.
  //   3. toast.select-element — ABSENT from xx, must fall back to the
  //      English catalog value in the DOM (missing-key chain end-to-end).
  const { app, appWindow } = await launch()
  await waitForI18nReady(appWindow)

  await appWindow.evaluate(async () => {
    window.__gstrap.eventBus.emit('plugin:language-registered', {
      plugin: '@i18n-spec/lang-xx',
      language: {
        code: 'xx',
        name: 'Spec Test',
        messages: {
          'toast.no-project': 'XX kein Projekt.',
          'toast.command-not-wired': 'XX nicht verdrahtet: {cmd}!'
        }
      }
    })
    await window.__gstrap.i18n.setLocale('xx')
  })

  const toastText = async expected => {
    const toast = appWindow.locator('.gstrap-toast-msg', { hasText: expected })
    await toast.waitFor({ state: 'visible', timeout: 3_000 })
    return (await toast.first().textContent())?.trim()
  }

  // 1. Plain swept string (no project open → cmdSave warns).
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  expect(await toastText('XX kein Projekt.')).toBe('XX kein Projekt.')

  // 2. Interpolated swept string (unknown command → not-wired warning).
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'i18nspec:bogus'))
  expect(await toastText('XX nicht verdrahtet: i18nspec:bogus!'))
    .toBe('XX nicht verdrahtet: i18nspec:bogus!')

  // 3. Key missing in xx → English value renders (edit:duplicate without a
  //    selection or project → toast.select-element).
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'edit:duplicate'))
  expect(await toastText('Select an element first.')).toBe('Select an element first.')

  await app.close()
})

test('i18n sweep: native menu labels resolve from the on-disk lang-en catalog (main process)', async () => {
  // menus.js labels go through menu-i18n.js, which reads
  // plugins/lang-en/messages.json straight from disk (main can't use the
  // renderer i18next). Raw keys leaking into the menu — a missing/broken
  // catalog — would show up here as 'menu.file' instead of '&File'.
  const { app } = await launch()

  const labels = await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    if (!menu) return null
    return {
      top: menu.items.map(i => i.label),
      file: menu.items.find(i => i.label === '&File')?.submenu?.items.map(i => i.label) || []
    }
  })
  expect(labels).not.toBeNull()
  expect(labels.top).toEqual(['&File', '&Edit', '&View', '&Insert', '&Help'])
  expect(labels.file).toContain('Import Folder…')   // key only in the catalog since Wave 4
  expect(labels.file).toContain('Save As…')
  expect(labels.file.some(l => l.startsWith('menu.'))).toBe(false) // no raw keys

  await app.close()
})
