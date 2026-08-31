/**
 * GrapeStrap — E2E: Preferences → AI settings pane
 *
 * PATH: tests/e2e/ai-settings.spec.js
 * ROLE: v0.2 Phase D coverage for the Preferences dialog's AI tab — proves
 *       it paints a real pane (not the General/Editor/Plugins stub), the
 *       model and effort selects are backed by prefs.ai and persist a
 *       change, and the account section renders a valid link state without
 *       throwing under the fake provider (hasKey:true, keySource:null —
 *       fake mode's needsKey:false path, which is NOT the keyring/env
 *       shape the real provider reports).
 * DEPENDS: @playwright/test, ./helpers.js, src/renderer/dialogs/preferences.js,
 *          src/main/ai/agent-session.js (fake mode, needs-key fake mode),
 *          plugins/lang-en/messages.json
 * CREATED: 2026-08-30
 * UPDATED: 2026-08-30 (review pass) — strengthened the paint/persist specs
 * (model+effort selects present, privacy note matches the catalog string
 * verbatim, persisted prefs.ai asserted as a full object — a replace-not-
 * merge regression guard); added two GSTRAP_AI_FAKE_NEEDS_KEY=1 specs
 * (wrong key / correct key), each probing ai.status().encryptionAvailable
 * at runtime and asserting whichever branch (link succeeds vs. no-keyring
 * guidance) is actually live on the machine running the suite.
 */
import { test, expect } from '@playwright/test'
import { launch, EXPECTED_PLUGIN_COUNT } from './helpers.js'

async function openPreferencesOnAiTab(appWindow) {
  // Plugin activation finishes before the dialog:preferences listener is
  // wired (both happen inside boot()) — same wait prefs-toasts.spec.js uses
  // before opening this dialog.
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 }
  )
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('dialog:preferences'))
  await appWindow.waitForSelector('[data-prefs-tab="ai"]', { timeout: 5_000 })
  await appWindow.click('[data-prefs-tab="ai"]')
  await appWindow.waitForSelector('.gstrap-prefs-pane .gstrap-prefs-ai', { timeout: 5_000 })
}

test('Preferences AI tab paints a real pane, not the General/Editor/Plugins stub', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await openPreferencesOnAiTab(appWindow)

  const hasStub = await appWindow.evaluate(
    () => !!document.querySelector('.gstrap-prefs-pane .gstrap-prefs-stub')
  )
  expect(hasStub).toBe(false)

  // Both sub-sections from the spec are present.
  const sectionCount = await appWindow.evaluate(
    () => document.querySelectorAll('.gstrap-prefs-ai .gstrap-prefs-ai-section').length
  )
  expect(sectionCount).toBe(2)

  // The two controls the Model & effort section promises exist…
  const hasModelSelect = await appWindow.evaluate(() => !!document.querySelector('#gstrap-prefs-ai-model'))
  const hasEffortSelect = await appWindow.evaluate(() => !!document.querySelector('#gstrap-prefs-ai-effort'))
  expect(hasModelSelect).toBe(true)
  expect(hasEffortSelect).toBe(true)

  // …and the privacy note is the actual catalog string, not a stub/placeholder.
  const privacyText = await appWindow.evaluate(
    () => document.querySelector('.gstrap-prefs-ai-privacy')?.textContent || ''
  )
  expect(privacyText).toBe(
    'Nothing leaves this machine until you link an account and use the AI panel. Once linked, the messages you type and any page or element content the assistant requests are sent to Anthropic under your own API key. GrapeStrap sends no telemetry, ever.'
  )

  await app.close()
})

test('Preferences AI tab: model select shows the curated ids and a change persists', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await openPreferencesOnAiTab(appWindow)

  const modelValues = await appWindow.evaluate(() =>
    Array.from(document.querySelectorAll('#gstrap-prefs-ai-model option')).map(o => o.value)
  )
  // The curated list (contract.js CURATED_MODELS) plus the "Other…" escape
  // hatch this pane adds on top of it.
  expect(modelValues).toEqual(expect.arrayContaining(['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5']))
  expect(modelValues).toContain('__other__')

  await appWindow.selectOption('#gstrap-prefs-ai-model', 'claude-sonnet-5')

  // Persistence, read back through the same bridge the app itself uses —
  // not a re-scrape of the DOM, which would only prove the <select> updated.
  await appWindow.waitForFunction(
    () => window.grapestrap.prefs.get('ai').then(ai => ai.model === 'claude-sonnet-5'),
    null, { timeout: 3_000 }
  )
  // Full-object equality, not just the field that changed: prefs:set
  // REPLACES prefs.ai rather than merging it (see persistAiPrefs in
  // preferences.js), so a regression that forgets to carry `provider` or
  // `effort` forward would silently drop them — this is the guard for that.
  const persisted = await appWindow.evaluate(() => window.grapestrap.prefs.get('ai'))
  expect(persisted).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5', effort: 'high' })

  await app.close()
})

test('Preferences AI tab: effort select persists a change', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await openPreferencesOnAiTab(appWindow)

  const defaultAi = await appWindow.evaluate(() => window.grapestrap.prefs.get('ai'))
  expect(defaultAi).toEqual({ provider: 'anthropic', model: 'claude-opus-5', effort: 'high' }) // DEFAULTS.ai, prefs.js

  await appWindow.selectOption('#gstrap-prefs-ai-effort', 'low')

  await appWindow.waitForFunction(
    () => window.grapestrap.prefs.get('ai').then(ai => ai.effort === 'low'),
    null, { timeout: 3_000 }
  )
  // Full-object equality — same replace-not-merge regression guard as the
  // model spec above, from the other field: a change to effort must not
  // silently drop provider/model.
  const persisted = await appWindow.evaluate(() => window.grapestrap.prefs.get('ai'))
  expect(persisted).toEqual({ provider: 'anthropic', model: 'claude-opus-5', effort: 'low' })

  await app.close()
})

test('Preferences AI tab: account section renders a valid link state under the fake provider, without throwing', async () => {
  // Fake mode reports status() as { hasKey: true, keySource: null,
  // encryptionAvailable: false } — the provider's needsKey:false shortcut
  // in readKeyInfo(), which is NOT the keyring/env shape the real
  // Anthropic provider reports. This spec pins that the pane degrades to a
  // bare "Linked" state (no source line, no Unlink button it can't back up)
  // instead of crashing on the unfamiliar keySource.
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })

  // Scope note: this only catches uncaught renderer errors from this point
  // forward (dialog-open onward) — it says nothing about errors during app
  // boot or launch(), which happened before the listener was registered.
  // That's the intended scope here: proving the AI tab's own paint doesn't
  // throw, not a whole-app error sweep.
  const pageErrors = []
  appWindow.on('pageerror', err => pageErrors.push(err))

  await openPreferencesOnAiTab(appWindow)

  const linkedText = await appWindow.evaluate(
    () => document.querySelector('.gstrap-prefs-ai-linked')?.textContent || ''
  )
  expect(linkedText).toContain('Linked')

  // keySource null (fake mode) must not paint an Unlink button — there is
  // nothing this dialog can clear for a sourceless "always linked" state.
  const hasUnlinkButton = await appWindow.evaluate(
    () => !!document.querySelector('[data-prefs-action="ai-unlink"]')
  )
  expect(hasUnlinkButton).toBe(false)

  expect(pageErrors).toEqual([])

  await app.close()
})

// ─── Needs-key fake mode (GSTRAP_AI_FAKE_NEEDS_KEY=1) ──────────────────────
// A second fake-provider variant with needsKey:true, so status() actually
// probes the real key store (unlike the sourceless needsKey:false mode
// above) — validateKey accepts only 'sk-fake-valid'. envKeyVars is
// deliberately empty in this mode, so a real ANTHROPIC_API_KEY in the dev
// environment can't leak into either spec below.
//
// Because status() now reflects the REAL safeStorage probe, whether
// encryptionAvailable is true or false depends on the machine running the
// suite (headless Linux under xvfb commonly has no usable keyring, which
// main's encryptionAvailable() now explicitly rejects — see SECURITY.md's
// basic_text note). Both specs probe it first and assert whichever branch
// is actually live, so they're green on a keyring machine and a
// keyring-less one alike.

test('Preferences AI tab (needs-key fake mode): a wrong key is rejected inline, input cleared, no crash', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1', GSTRAP_AI_FAKE_NEEDS_KEY: '1' })

  const pageErrors = []
  appWindow.on('pageerror', err => pageErrors.push(err))

  await openPreferencesOnAiTab(appWindow)

  const status = await appWindow.evaluate(() => window.grapestrap.ai.status())

  if (!status.encryptionAvailable) {
    // No keyring on this machine — the key input never renders at all (see
    // paintAiAccountSection's no-keyring branch), so there is nothing to
    // submit a wrong key into. The meaningful assertion left on this
    // machine is the same one every other "no keyring" path makes: the
    // guidance renders and nothing throws.
    const guidanceText = await appWindow.evaluate(
      () => document.querySelector('.gstrap-prefs-ai-guidance')?.textContent || ''
    )
    expect(guidanceText.length).toBeGreaterThan(0)
    expect(pageErrors).toEqual([])
    await app.close()
    return
  }

  const keyInputSelector = '[data-prefs-ai-key]'
  await appWindow.waitForSelector(keyInputSelector, { timeout: 5_000 })
  await appWindow.fill(keyInputSelector, 'sk-fake-wrong')
  await appWindow.click('[data-prefs-action="ai-link"]')

  await appWindow.waitForSelector('[data-prefs-ai-error]:not([hidden])', { timeout: 5_000 })
  const errorText = await appWindow.evaluate(
    () => document.querySelector('[data-prefs-ai-error]')?.textContent || ''
  )
  expect(errorText.length).toBeGreaterThan(0)

  // F1 — the input is zeroed immediately on submit, not left holding the
  // rejected key for the user to notice and worry about.
  const inputValue = await appWindow.inputValue(keyInputSelector)
  expect(inputValue).toBe('')

  expect(pageErrors).toEqual([])

  await app.close()
})

test('Preferences AI tab (needs-key fake mode): a correct key links, or the no-keyring guidance renders — whichever this machine supports', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1', GSTRAP_AI_FAKE_NEEDS_KEY: '1' })

  const pageErrors = []
  appWindow.on('pageerror', err => pageErrors.push(err))

  await openPreferencesOnAiTab(appWindow)

  const status = await appWindow.evaluate(() => window.grapestrap.ai.status())

  if (!status.encryptionAvailable) {
    const guidanceText = await appWindow.evaluate(
      () => document.querySelector('.gstrap-prefs-ai-guidance')?.textContent || ''
    )
    expect(guidanceText.length).toBeGreaterThan(0)
    expect(pageErrors).toEqual([])
    await app.close()
    return
  }

  const keyInputSelector = '[data-prefs-ai-key]'
  await appWindow.waitForSelector(keyInputSelector, { timeout: 5_000 })
  await appWindow.fill(keyInputSelector, 'sk-fake-valid')
  await appWindow.click('[data-prefs-action="ai-link"]')

  await appWindow.waitForSelector('.gstrap-prefs-ai-linked', { timeout: 5_000 })
  const linkedText = await appWindow.evaluate(
    () => document.querySelector('.gstrap-prefs-ai-linked')?.textContent || ''
  )
  expect(linkedText).toContain('Linked')
  // A real setKey only ever writes to the keyring-backed store — this is
  // the one source this exact flow can produce.
  expect(linkedText).toContain('keyring')

  expect(pageErrors).toEqual([])

  await app.close()
})
