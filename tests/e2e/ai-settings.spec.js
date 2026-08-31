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
 *          src/main/ai/ollama-provider.js (provider registry only —
 *          GSTRAP_AI_FAKE=1 still overrides listModels()/createTurn, see
 *          the Ollama provider section below), plugins/lang-en/messages.json
 * CREATED: 2026-08-30
 * UPDATED: 2026-08-30 (review pass) — strengthened the paint/persist specs
 * (model+effort selects present, privacy note matches the catalog string
 * verbatim, persisted prefs.ai asserted as a full object — a replace-not-
 * merge regression guard); added two GSTRAP_AI_FAKE_NEEDS_KEY=1 specs
 * (wrong key / correct key), each probing ai.status().encryptionAvailable
 * at runtime and asserting whichever branch (link succeeds vs. no-keyring
 * guidance) is actually live on the machine running the suite.
 * UPDATED: 2026-08-30 (Ollama provider) — pane now has three sections, not
 * two (Provider select added ahead of Account/Host); added Provider-select
 * specs (switch persists the full 4-key object, host section paints,
 * account/key section is gone) and Ollama host validation. The model-list
 * load-failure branch is NOT reachable under GSTRAP_AI_FAKE=1 — see the
 * comment above that spec for why, and what it asserts instead.
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

  // Three sections: Provider, Account (or Host), Model & effort.
  const sectionCount = await appWindow.evaluate(
    () => document.querySelectorAll('.gstrap-prefs-ai .gstrap-prefs-ai-section').length
  )
  expect(sectionCount).toBe(3)

  // The controls each section promises exist…
  const hasProviderSelect = await appWindow.evaluate(() => !!document.querySelector('#gstrap-prefs-ai-provider'))
  const hasModelSelect = await appWindow.evaluate(() => !!document.querySelector('#gstrap-prefs-ai-model'))
  const hasEffortSelect = await appWindow.evaluate(() => !!document.querySelector('#gstrap-prefs-ai-effort'))
  expect(hasProviderSelect).toBe(true)
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
  // preferences.js), so a regression that forgets to carry `provider`,
  // `effort`, or `ollamaHost` forward would silently drop them — this is
  // the guard for that.
  const persisted = await appWindow.evaluate(() => window.grapestrap.prefs.get('ai'))
  expect(persisted).toEqual({
    provider: 'anthropic', model: 'claude-sonnet-5', effort: 'high', ollamaHost: 'http://127.0.0.1:11434'
  })

  await app.close()
})

test('Preferences AI tab: effort select persists a change', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await openPreferencesOnAiTab(appWindow)

  const defaultAi = await appWindow.evaluate(() => window.grapestrap.prefs.get('ai'))
  expect(defaultAi).toEqual({
    provider: 'anthropic', model: 'claude-opus-5', effort: 'high', ollamaHost: 'http://127.0.0.1:11434'
  }) // DEFAULTS.ai, prefs.js

  await appWindow.selectOption('#gstrap-prefs-ai-effort', 'low')

  await appWindow.waitForFunction(
    () => window.grapestrap.prefs.get('ai').then(ai => ai.effort === 'low'),
    null, { timeout: 3_000 }
  )
  // Full-object equality — same replace-not-merge regression guard as the
  // model spec above, from the other field: a change to effort must not
  // silently drop provider/model/ollamaHost.
  const persisted = await appWindow.evaluate(() => window.grapestrap.prefs.get('ai'))
  expect(persisted).toEqual({
    provider: 'anthropic', model: 'claude-opus-5', effort: 'low', ollamaHost: 'http://127.0.0.1:11434'
  })

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

// ─── Ollama provider ────────────────────────────────────────────────────────
// GSTRAP_AI_FAKE=1 is still in effect for these — provider.js's getProvider()
// checks isFakeMode() BEFORE ever reading prefs.ai.provider, so switching the
// Provider select to 'ollama' changes what's PERSISTED and what the PANE
// renders, but agent-session.js still routes every actual model-list/turn
// call to fake-provider.js regardless. That's exactly the boundary these
// specs are testing (prefs + pane behavior are real; provider execution
// stays faked) — see the model-list spec below for what that means for the
// load-failed/Retry branch specifically.

test('Preferences AI tab: switching Provider to Ollama persists the full 4-key object, paints the host section, and removes the account/key section', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await openPreferencesOnAiTab(appWindow)

  const providerValues = await appWindow.evaluate(() =>
    Array.from(document.querySelectorAll('#gstrap-prefs-ai-provider option')).map(o => o.value)
  )
  expect(providerValues).toEqual(['anthropic', 'ollama'])

  await appWindow.selectOption('#gstrap-prefs-ai-provider', 'ollama')
  await appWindow.waitForFunction(
    () => window.grapestrap.prefs.get('ai').then(ai => ai.provider === 'ollama'),
    null, { timeout: 5_000 }
  )

  // Full-object equality on the keys, not a specific model id: switching
  // providers persists a model from the NEW provider's list, but under
  // GSTRAP_AI_FAKE=1 that list is always the same fake CURATED_MODELS
  // array regardless of provider (see the note above) — so the exact id
  // this settles on isn't meaningful here, only that all four keys exist
  // and provider/ollamaHost are correct.
  const persisted = await appWindow.evaluate(() => window.grapestrap.prefs.get('ai'))
  expect(Object.keys(persisted).sort()).toEqual(['effort', 'model', 'ollamaHost', 'provider'])
  expect(persisted.provider).toBe('ollama')
  expect(persisted.ollamaHost).toBe('http://127.0.0.1:11434')
  expect(typeof persisted.model).toBe('string')
  expect(persisted.model.length).toBeGreaterThan(0)

  // The host section paints — input + note.
  const hasHostInput = await appWindow.evaluate(() => !!document.querySelector('[data-prefs-ai-field="ollama-host"]'))
  expect(hasHostInput).toBe(true)
  const noteText = await appWindow.evaluate(
    () => document.querySelector('.gstrap-prefs-ai-guidance')?.textContent || ''
  )
  expect(noteText).toBe('Runs on your own machine or network — nothing is sent to Anthropic.')

  // …and the Anthropic account/key UI is gone.
  const hasKeyInput = await appWindow.evaluate(() => !!document.querySelector('[data-prefs-ai-key]'))
  const hasLinkedText = await appWindow.evaluate(() => !!document.querySelector('.gstrap-prefs-ai-linked'))
  expect(hasKeyInput).toBe(false)
  expect(hasLinkedText).toBe(false)

  await app.close()
})

test('Preferences AI tab (Ollama provider): host validation — garbage rejected inline, a valid http(s) address persists', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await openPreferencesOnAiTab(appWindow)
  await appWindow.selectOption('#gstrap-prefs-ai-provider', 'ollama')
  await appWindow.waitForSelector('[data-prefs-ai-field="ollama-host"]', { timeout: 5_000 })

  const hostInputSelector = '[data-prefs-ai-field="ollama-host"]'

  // Garbage — no scheme at all — is rejected inline and never persisted.
  await appWindow.fill(hostInputSelector, 'not a url')
  await appWindow.locator(hostInputSelector).blur()
  await appWindow.waitForSelector('[data-prefs-ai-host-error]:not([hidden])', { timeout: 5_000 })
  const errorText = await appWindow.evaluate(
    () => document.querySelector('[data-prefs-ai-host-error]')?.textContent || ''
  )
  expect(errorText).toBe('Enter a full http(s):// address.')
  const afterGarbage = await appWindow.evaluate(() => window.grapestrap.prefs.get('ai'))
  expect(afterGarbage.ollamaHost).toBe('http://127.0.0.1:11434') // unchanged — the default, not the rejected value

  // A valid address (a different port, so this actually proves a change
  // landed rather than coincidentally matching the untouched default)
  // clears the error and persists.
  await appWindow.fill(hostInputSelector, 'http://127.0.0.1:12345')
  await appWindow.locator(hostInputSelector).blur()
  await appWindow.waitForFunction(
    () => window.grapestrap.prefs.get('ai').then(ai => ai.ollamaHost === 'http://127.0.0.1:12345'),
    null, { timeout: 3_000 }
  )
  const errorHiddenNow = await appWindow.evaluate(
    () => document.querySelector('[data-prefs-ai-host-error]')?.hidden
  )
  expect(errorHiddenNow).toBe(true)

  // The exact address named in the task brief also round-trips cleanly.
  await appWindow.fill(hostInputSelector, 'http://127.0.0.1:11434')
  await appWindow.locator(hostInputSelector).blur()
  await appWindow.waitForFunction(
    () => window.grapestrap.prefs.get('ai').then(ai => ai.ollamaHost === 'http://127.0.0.1:11434'),
    null, { timeout: 3_000 }
  )

  await app.close()
})

test('Preferences AI tab (Ollama provider): ai.listModels() is intercepted by GSTRAP_AI_FAKE=1 regardless of provider — the load-failed/Retry branch is unreachable here', async () => {
  // Finding, per the task brief's fallback instruction: provider.js's
  // getProvider() checks isFakeMode() BEFORE reading prefs.ai.provider at
  // all (`if (isFakeMode()) return fakeProvider`), and fakeProvider's own
  // listModels() ignores whatever arguments agent-session.js passes and
  // always resolves the same synchronous CURATED_MODELS array. So under
  // GSTRAP_AI_FAKE=1, setting provider to 'ollama' does NOT route
  // ai.listModels() to a real network fetch, and it can never fail — the
  // load-failed/Retry UI this task asked for genuinely can't be exercised
  // through this env var alone; that needs a real (or a deliberately
  // unreachable) Ollama host with GSTRAP_AI_FAKE unset, which is out of
  // scope for a spec that must stay green with no server running in CI.
  //
  // What IS true and worth pinning instead: switching to Ollama under fake
  // mode still resolves a normal, successful model list — the pane must
  // not assume "provider is ollama" implies "listModels() might fail" and
  // paint a failure state that isn't actually happening.
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await openPreferencesOnAiTab(appWindow)
  await appWindow.selectOption('#gstrap-prefs-ai-provider', 'ollama')
  await appWindow.waitForSelector('[data-prefs-ai-field="ollama-host"]', { timeout: 5_000 })

  const modelsResult = await appWindow.evaluate(() => window.grapestrap.ai.listModels())
  expect(modelsResult.ok).toBe(true)
  expect(modelsResult.models.map(m => m.id)).toEqual(
    expect.arrayContaining(['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'])
  )

  // The pane reflects that success: a normal select, not the load-failed
  // error/Retry block.
  const hasModelSelect = await appWindow.evaluate(() => !!document.querySelector('#gstrap-prefs-ai-model'))
  const hasRetryButton = await appWindow.evaluate(() => !!document.querySelector('[data-prefs-action="ai-models-retry"]'))
  expect(hasModelSelect).toBe(true)
  expect(hasRetryButton).toBe(false)

  await app.close()
})
