/**
 * GrapeStrap — Preferences dialog
 *
 * v0.0.2 ships the Shortcuts tab (the v0.0.1 stub was a no-op). Other tabs
 * (General / Editor / Plugins) are scaffolded but only the Shortcuts pane is
 * fully wired here — the rest are deferred to v0.0.3.
 *
 * UPDATED: 2026-08-30 (v0.2 Phase D) — AI tab: account link/unlink flow
 * (window.grapestrap.ai.status/validateKey/setKey/clearKey), model + effort
 * selects backed by prefs.ai (window.grapestrap.ai.listModels for the
 * curated options, plus a free-text "Other…" model id), and a privacy note.
 * Everything key-shaped crosses the bridge exactly once per Link click and
 * is never re-rendered back into the DOM — see paintAiAccountSection.
 * UPDATED: 2026-08-30 (Ollama provider) — a Provider select (Anthropic /
 * Ollama) now tops the AI pane. Ollama is keyless: its branch swaps the
 * Account section for a host address field + a note, and skips key
 * management entirely. ai.listModels() now does a live fetch and can fail
 * (unreachable host) — the Model & effort section grew a load-failed state
 * with a Retry button, still keeping the free-text "Other…" id usable.
 * Every prefs.ai write now always carries all four fields — provider,
 * model, effort, ollamaHost — since prefs:set replaces the object rather
 * than merging it; see persistAiPrefs.
 *
 * Shortcuts UI:
 *   - One row per command from DEFAULT_BINDINGS, with the active binding
 *     pretty-printed.
 *   - "Edit" enters a per-row capture state: the row swaps to "Press a
 *     combo… (Esc cancels)", and the next non-modifier keydown is read as
 *     the new binding.
 *   - Conflict detection: if the new combo collides with another command's
 *     binding, the row shows a red "Conflict with <command>" inline and
 *     refuses the save until the user picks something else.
 *   - "Reset" reverts a row to its default (clears the override).
 *   - "Reset all" clears every override.
 *   - All edits persist to prefs.shortcuts immediately AND broadcast via
 *     eventBus 'shortcuts:user-changed' so keybindings.js takes effect
 *     without a restart.
 */

import { eventBus } from '../state/event-bus.js'
import { DEFAULT_BINDINGS, formatCombo, resolveBindings } from '../shortcuts/default-bindings.js'
import { t } from '../i18n.js'
import { codeMarkup } from '../i18n-html.js'

let overlay = null
let overrides = {}
let editingCommand = null

const TABS = [
  { id: 'shortcuts', labelKey: 'prefs.tab.shortcuts' },
  { id: 'general',   labelKey: 'prefs.tab.general'   },
  { id: 'editor',    labelKey: 'prefs.tab.editor'    },
  { id: 'plugins',   labelKey: 'prefs.tab.plugins'   },
  { id: 'ai',        labelKey: 'prefs.tab.ai'        }
]

// Effort options the AI pane offers, in order. Kept here (not read from the
// core agent's contract.js) because the renderer never imports main-process
// modules directly — everything about the AI panel crosses the
// window.grapestrap.ai bridge, this list included.
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

// A free-text "Other…" model id — letters, digits, dots, and hyphens only
// (Anthropic model ids look like `claude-opus-5`; this is intentionally a
// little more permissive than that one shape so a future/renamed id
// doesn't need this pattern touched). Also blocks the literal sentinel
// value the model <select> uses for its "Other…" option — see
// persistModelOther.
const MODEL_OTHER_PATTERN = /^[a-z0-9.-]+$/i

let activeTab = 'shortcuts'

// ─── AI pane state (v0.2 Phase D) ──────────────────────────────────────────
// aiStatus mirrors the last ai:status() result. aiPrefs is the pane's own
// working copy of prefs.ai (provider/model/effort) — kept local so a
// model/effort change can persist immediately without an async re-fetch
// round-trip first, the same pattern `overrides` uses for the Shortcuts pane
// above. None of this ever holds the key itself — that value lives only in
// the key input's own DOM node between typing and the Link click that reads
// it (see handleAiLink).
let aiStatus = null
let aiModels = []
// {type, message} when the last ai.listModels() call failed (e.g. an
// unreachable Ollama host) — null when the list loaded fine. An empty
// aiModels with this also null means "still loading" (see
// paintAiModelSection). Drives the Model & effort section's
// loading/load-failed/Retry states; see loadAiModels.
let aiModelsError = null
// KEEP IN SYNC: this initializer and loadAiStatus's replacement literal
// below (`aiPrefs = { provider: status.provider, ... }`, marked with the
// same comment) are the two places prefs.ai's shape is spelled out in
// this file. Adding a 5th key to
// DEFAULTS.ai (prefs.js) or to getStatus()'s return (agent-session.js,
// main-process) means updating BOTH literals here — miss either one and
// persistAiPrefs's replace-not-merge write silently drops the new field
// the next time anything in this pane persists.
// ollamaHost starts '' rather than the real default: this initial object
// is never actually painted (paintAiPane shows the loading/error pane
// until loadAiStatus resolves and overwrites it below), so duplicating
// the address literal here would just be a third copy to keep in sync —
// see prefs.js's DEFAULTS.ai / contract.js's OLLAMA_DEFAULT_HOST instead.
let aiPrefs = { provider: 'anthropic', model: '', effort: 'high', ollamaHost: '' }
let aiKeyLinkError = null
let aiUnlinkConfirming = false
let aiModelOtherMode = false
let aiModelOtherError = null
// Inline validation message for the Ollama host field — same textContent
// pattern as aiKeyLinkError/aiModelOtherError.
let aiHostError = null
// Single-flight guard on the Link button — without it a slow validateKey
// call plus a second click can race two setKey calls for the same
// provider; also what lets the button show a loading label instead of
// looking clickable while a request is outstanding.
let aiLinkInFlight = false
// Bumped at the top of handleProviderChange/handleModelsRetry — both are
// multi-await chains that mutate the same aiModels/aiModelsError/aiPrefs
// state, so a fast second switch (or a Retry racing a switch) needs a
// generation check, not just the `!overlay` guard, or the OLDER chain can
// resolve last and persist a model id that belongs to whichever provider
// it started against, not the one currently selected.
let aiSwitchGen = 0
// Session-scoped "last model picked per provider", so switching back to a
// provider restores what you had there instead of always re-picking the
// list's first entry. Never written to prefs — intentionally lost on
// relaunch, same as any other pane-only convenience state in this file.
let lastModelByProvider = {}

export function openPreferencesDialog() {
  if (overlay) return
  const host = document.getElementById('gstrap-modals')
  if (!host) return

  overlay = document.createElement('div')
  overlay.className = 'gstrap-prefs-overlay'
  host.appendChild(overlay)

  Promise.all([loadOverrides(), loadAiStatus(), loadAiModels()]).then(() => {
    // "Other…" starts open whenever the persisted model isn't one of the
    // curated ids — e.g. a value hand-edited into preferences.json, or a
    // model this build's/provider's curated list no longer carries. Left
    // false (harmlessly) when the list itself failed to load — that state
    // is rendered by paintAiModelSection's aiModelsError branch instead.
    aiModelOtherMode = !!aiStatus && !aiModels.some(model => model.id === aiPrefs.model)
    paint()
  })

  overlay.addEventListener('click', evt => {
    if (evt.target === overlay) close()
    const tab = evt.target.closest('[data-prefs-tab]')
    if (tab) { activeTab = tab.dataset.prefsTab; paint(); return }
    const action = evt.target.closest('[data-prefs-action]')
    if (action) handleAction(action.dataset.prefsAction, action.dataset.prefsCommand)
  })
  // Delegated 'change' for the AI pane's select/text fields (model, the
  // free-text "Other…" model id, effort) — the click listener above only
  // ever sees discrete button presses, so this is a second delegated
  // listener rather than overloading that one.
  overlay.addEventListener('change', evt => {
    const field = evt.target.closest('[data-prefs-ai-field]')
    if (field) handleAiFieldChange(field.dataset.prefsAiField, field.value)
  })
  document.addEventListener('keydown', onKeyDown, true)
}

function close() {
  if (!overlay) return
  // Flush a pending, not-yet-blurred "Other…" model id edit before the
  // overlay is torn down. Escape — the common way to close this dialog —
  // never fires the input's own 'change' event, so a typed-but-unblurred
  // custom model id would otherwise be silently lost (F8).
  const modelOtherInput = overlay.querySelector('[data-prefs-ai-field="model-other"]')
  if (modelOtherInput) persistModelOther(modelOtherInput.value)
  // Same reasoning, same flush, for a pending unblurred Ollama host edit.
  const hostInput = overlay.querySelector('[data-prefs-ai-field="ollama-host"]')
  if (hostInput) persistOllamaHost(hostInput.value)

  document.removeEventListener('keydown', onKeyDown, true)
  overlay.parentNode?.removeChild(overlay)
  overlay = null
  editingCommand = null
  // Transient AI-pane UI state must not survive to the next open — a
  // leftover "Really unlink?", link error, or in-flight flag would paint
  // (or leave the Link button permanently stuck) before the user did
  // anything this time.
  aiKeyLinkError = null
  aiUnlinkConfirming = false
  aiModelOtherError = null
  aiHostError = null
  aiLinkInFlight = false
}

async function loadOverrides() {
  try {
    overrides = (await window.grapestrap?.prefs?.get?.('shortcuts')) || {}
  } catch {
    overrides = {}
  }
}

/**
 * Refresh aiStatus/aiPrefs from the main process.
 *
 * Called on every dialog open (not lazily on first AI-tab visit) so
 * switching into the tab never shows a loading flash — the same eager-load
 * choice loadOverrides already makes for the Shortcuts tab.
 *
 * Model loading is a SEPARATE function (loadAiModels) — status() is a
 * cheap local read, while listModels() can be a live network call (Ollama)
 * with its own failure/Retry UI, and a provider switch needs to reload
 * only the model list, not re-probe key/host status.
 *
 * @returns {Promise<void>} never rejects — a failed status call degrades
 *          the pane to its "couldn't load" state instead of throwing out
 *          of the dialog's open sequence.
 */
async function loadAiStatus() {
  try {
    const status = await window.grapestrap?.ai?.status?.()
    if (status?.ok) {
      aiStatus = status
      // KEEP IN SYNC with the aiPrefs initializer above — same four keys,
      // same reason: prefs:set replaces the whole object, so a 5th key
      // added to DEFAULTS.ai / getStatus() and missed here gets silently
      // dropped the next time this pane persists.
      aiPrefs = { provider: status.provider, model: status.model, effort: status.effort, ollamaHost: status.ollamaHost }
    } else {
      aiStatus = null
    }
  } catch {
    aiStatus = null
  }
}

/**
 * Refresh aiModels/aiModelsError from the CURRENTLY persisted provider —
 * main resolves listModels() against prefs.ai.provider server-side, so
 * there is no per-call provider override; a provider switch must persist
 * first (see handleProviderChange) before calling this again.
 *
 * ai.listModels() now does a live fetch for some providers (Ollama) and
 * can resolve {ok:false} (e.g. an unreachable host) — that never throws
 * out of here, it just populates aiModelsError for paintAiModelSection's
 * load-failed/Retry branch.
 * @returns {Promise<void>}
 */
async function loadAiModels() {
  try {
    const result = await window.grapestrap?.ai?.listModels?.()
    if (result?.ok && Array.isArray(result.models)) {
      aiModels = result.models
      aiModelsError = null
    } else {
      aiModels = []
      aiModelsError = result?.error || { type: 'api', message: '' }
    }
  } catch (err) {
    aiModels = []
    aiModelsError = { type: 'api', message: err?.message || '' }
  }
}

function paint() {
  if (!overlay) return
  overlay.innerHTML = `
    <div class="gstrap-prefs-card" role="dialog" aria-modal="true">
      <div class="gstrap-prefs-header">
        <span class="gstrap-prefs-title">${escHtml(t('prefs.title'))}</span>
        <button class="gstrap-prefs-close" data-prefs-action="close" title="${escAttr(t('action.close'))}">✕</button>
      </div>
      <div class="gstrap-prefs-body">
        <div class="gstrap-prefs-tabs">
          ${TABS.map(tab => `
            <button class="gstrap-prefs-tab ${tab.id === activeTab ? 'is-active' : ''}"
                    data-prefs-tab="${tab.id}">${escHtml(t(tab.labelKey))}</button>
          `).join('')}
        </div>
        <div class="gstrap-prefs-pane">
          ${paintActivePane()}
        </div>
      </div>
    </div>
  `
  // The link-flow, model-other, host, and models-load error messages are
  // all set via real textContent, not templated into the innerHTML string
  // above — see paintAiErrorText / paintAiModelErrorText / paintAiHostErrorText
  // / paintAiModelsErrorText.
  if (activeTab === 'ai') {
    paintAiErrorText()
    paintAiModelErrorText()
    paintAiHostErrorText()
    paintAiModelsErrorText()
  }
}

function paintActivePane() {
  if (activeTab === 'shortcuts') return paintShortcutsPane()
  if (activeTab === 'ai') return paintAiPane()
  return paintStubPane(activeTab)
}

function paintShortcutsPane() {
  const active = resolveBindings(overrides)
  const byCommand = {}
  for (const b of active) byCommand[b.command] = b

  return `
    <div class="gstrap-prefs-toolbar">
      <button class="gstrap-prefs-btn" data-prefs-action="reset-all">${escHtml(t('prefs.reset-all'))}</button>
    </div>
    <table class="gstrap-prefs-shortcuts">
      <thead>
        <tr><th>${escHtml(t('prefs.header-action'))}</th><th>${escHtml(t('prefs.header-shortcut'))}</th><th></th></tr>
      </thead>
      <tbody>
        ${DEFAULT_BINDINGS.map(def => paintRow(def, byCommand[def.command])).join('')}
      </tbody>
    </table>
  `
}

function paintRow(def, active) {
  const isEditing = editingCommand === def.command
  const overridden = Object.prototype.hasOwnProperty.call(overrides, def.command)
  const conflict = isEditing ? null : findConflict(def.command, active)
  return `
    <tr data-prefs-row="${def.command}" class="${overridden ? 'is-overridden' : ''} ${conflict ? 'is-conflict' : ''}">
      <td class="gstrap-prefs-row-label">${escHtml(t(`shortcut.${def.command}`, { defaultValue: def.label }))}</td>
      <td class="gstrap-prefs-row-combo">
        ${isEditing
          ? `<span class="gstrap-prefs-combo-capturing">${escHtml(t('prefs.press-combo'))}</span>`
          : `<code class="gstrap-prefs-combo">${escHtml(formatCombo(active))}</code>`}
        ${conflict ? `<span class="gstrap-prefs-conflict">${escHtml(t('prefs.conflicts-with', { command: conflict }))}</span>` : ''}
      </td>
      <td class="gstrap-prefs-row-actions">
        ${isEditing
          ? `<button class="gstrap-prefs-btn" data-prefs-action="cancel-edit">${escHtml(t('action.cancel'))}</button>`
          : `
            <button class="gstrap-prefs-btn" data-prefs-action="edit"  data-prefs-command="${escAttr(def.command)}">${escHtml(t('action.edit'))}</button>
            ${overridden ? `<button class="gstrap-prefs-btn" data-prefs-action="reset" data-prefs-command="${escAttr(def.command)}">${escHtml(t('prefs.reset'))}</button>` : ''}
          `}
      </td>
    </tr>
  `
}

function paintStubPane(tab) {
  // The <strong> wraps the tab id (data) — the prose around it is split into
  // prefix/suffix keys so the emphasis markup survives translation.
  return `
    <div class="gstrap-prefs-stub">
      <p>${escHtml(t('prefs.stub-prefix'))} <strong>${escHtml(tab)}</strong> ${codeMarkup(t('prefs.stub-suffix'))}</p>
    </div>
  `
}

// ─── AI pane (v0.2 Phase D) ─────────────────────────────────────────────────

function paintAiPane() {
  if (!aiStatus) {
    return `<div class="gstrap-prefs-ai"><p class="gstrap-prefs-ai-guidance">${escHtml(t('ai.settings.status-error'))}</p></div>`
  }
  const isOllama = aiPrefs.provider === 'ollama'
  return `
    <div class="gstrap-prefs-ai">
      <section class="gstrap-prefs-ai-section">
        <h3 class="gstrap-prefs-ai-heading">${escHtml(t('ai.settings.provider.label'))}</h3>
        ${paintAiProviderSelect()}
      </section>
      <section class="gstrap-prefs-ai-section">
        <h3 class="gstrap-prefs-ai-heading">${escHtml(isOllama ? t('ai.settings.ollama.host-label') : t('ai.settings.account.heading'))}</h3>
        ${isOllama ? paintAiOllamaSection() : paintAiAccountSection()}
      </section>
      <section class="gstrap-prefs-ai-section">
        <h3 class="gstrap-prefs-ai-heading">${escHtml(t('ai.settings.model.heading'))}</h3>
        ${paintAiModelSection()}
      </section>
      <p class="gstrap-prefs-ai-privacy">${escHtml(t('ai.settings.privacy'))}</p>
    </div>
  `
}

/**
 * Paint the Provider select — Anthropic (key-based) or Ollama (local,
 * keyless). Its own heading doubles as the select's accessible label,
 * same pattern the Ollama host field below uses.
 * @returns {string} HTML for the provider select
 */
function paintAiProviderSelect() {
  return `
    <select id="gstrap-prefs-ai-provider" class="gstrap-prefs-ai-select" data-prefs-ai-field="provider"
            aria-label="${escAttr(t('ai.settings.provider.label'))}">
      <option value="anthropic" ${aiPrefs.provider === 'anthropic' ? 'selected' : ''}>${escHtml(t('ai.settings.provider.anthropic'))}</option>
      <option value="ollama" ${aiPrefs.provider === 'ollama' ? 'selected' : ''}>${escHtml(t('ai.settings.provider.ollama'))}</option>
    </select>
  `
}

/**
 * Paint the Ollama branch's connection section: a host address field
 * (persisted on change, validated as a full http(s):// URL) and a static
 * note that nothing here reaches Anthropic. No key management at all —
 * Ollama is keyless by design.
 * @returns {string} HTML for the Ollama host block
 */
function paintAiOllamaSection() {
  return `
    <input type="text" class="gstrap-prefs-ai-host-input" data-prefs-ai-field="ollama-host"
           value="${escAttr(aiPrefs.ollamaHost)}"
           aria-label="${escAttr(t('ai.settings.ollama.host-label'))}"
           placeholder="http://127.0.0.1:11434" autocomplete="off">
    <p class="gstrap-prefs-ai-error" data-prefs-ai-host-error hidden></p>
    <p class="gstrap-prefs-ai-guidance">${escHtml(t('ai.settings.ollama.note'))}</p>
  `
}

/**
 * Paint the Account sub-section: linked / not-linked / no-keyring states,
 * driven entirely by the last ai:status() result (see loadAiStatus).
 * @returns {string} HTML for the account block
 */
function paintAiAccountSection() {
  if (aiStatus.hasKey) {
    // A stored keyring entry is the only source this dialog can actually
    // clear — an environment variable (or fake mode's sourceless "always
    // linked", keySource null) stays set outside the app, so an Unlink
    // button there would be a confusing no-op. keySource outside
    // {'keyring','env'} degrades to a bare "Linked ✓" with no source line
    // and no Unlink button, rather than guessing at a label — this is the
    // path fake mode's needsKey:false status must hit without throwing.
    const sourceKey = aiStatus.keySource === 'keyring' ? 'ai.settings.source.keyring'
                     : aiStatus.keySource === 'env'     ? 'ai.settings.source.env'
                     : null
    const canUnlink = aiStatus.keySource === 'keyring'
    // An env-sourced key still leaves the keyring path open: readKeyInfo
    // prefers a keyring entry over the environment, so an env user who
    // links a keyring key here gets it picked up on the next status()
    // refresh — without this they could never move off ANTHROPIC_API_KEY.
    const canOfferKeyring = aiStatus.keySource === 'env' && aiStatus.encryptionAvailable
    return `
      <p class="gstrap-prefs-ai-linked">${escHtml(t('ai.settings.linked'))}${sourceKey ? ' · ' + escHtml(t(sourceKey)) : ''}</p>
      ${canUnlink ? `
        <button class="gstrap-prefs-btn" data-prefs-action="${aiUnlinkConfirming ? 'ai-unlink-confirm' : 'ai-unlink'}">
          ${escHtml(aiUnlinkConfirming ? t('ai.settings.unlink-confirm') : t('ai.settings.unlink'))}
        </button>
        ${aiUnlinkConfirming ? `<button class="gstrap-prefs-btn" data-prefs-action="ai-unlink-cancel">${escHtml(t('action.cancel'))}</button>` : ''}
      ` : ''}
      ${canOfferKeyring ? `
        <p class="gstrap-prefs-ai-alt-hint">${escHtml(t('ai.settings.use-different-key'))}</p>
        ${paintAiLinkRow()}
      ` : ''}
    `
  }

  if (!aiStatus.encryptionAvailable) {
    // No key input at all in this state — there is nowhere safe to put a
    // typed key on a system without a usable keyring.
    return `<p class="gstrap-prefs-ai-guidance">${escHtml(t('ai.settings.no-keyring'))}</p>`
  }

  return paintAiLinkRow()
}

/**
 * The password input + Link button + inline-error row. Shared by the
 * not-linked state and the env-linked "use a different key instead"
 * affordance — same fields, same validate→store→reload flow either way.
 * @returns {string} HTML for the link row
 */
function paintAiLinkRow() {
  return `
    <div class="gstrap-prefs-ai-link-row">
      <input type="password" class="gstrap-prefs-ai-key-input" data-prefs-ai-key
             placeholder="${escAttr(t('ai.settings.key-placeholder'))}"
             aria-label="${escAttr(t('ai.settings.key-placeholder'))}" autocomplete="off">
      <button class="gstrap-prefs-btn" data-prefs-action="ai-link" ${aiLinkInFlight ? 'disabled' : ''}>
        ${escHtml(aiLinkInFlight ? t('ai.settings.loading') : t('ai.settings.link'))}
      </button>
    </div>
    <p class="gstrap-prefs-ai-error" data-prefs-ai-error hidden></p>
  `
}

/**
 * Paint the Model & effort sub-section: a curated-model select (plus a
 * free-text "Other…" model id) and an effort select, both backed by the
 * local aiPrefs working copy of prefs.ai.
 * @returns {string} HTML for the model/effort block
 */
function paintAiModelSection() {
  if (aiModelsError) {
    // No empty/useless <select> — the load failed, so there is nothing
    // curated to offer. The free-text "Other…" id stays reachable (a user
    // who knows their model id shouldn't be blocked by a list that
    // couldn't load), and Retry re-runs the same fetch.
    return `
      <label class="gstrap-prefs-ai-field-label">${escHtml(t('ai.settings.model.label'))}</label>
      <p class="gstrap-prefs-ai-error" data-prefs-ai-models-error></p>
      <button class="gstrap-prefs-btn" data-prefs-action="ai-models-retry">${escHtml(t('ai.settings.models.retry'))}</button>
      <input type="text" class="gstrap-prefs-ai-model-other" data-prefs-ai-field="model-other"
             value="${escAttr(aiPrefs.model)}" placeholder="${escAttr(t('ai.settings.model-other-placeholder'))}">
      <p class="gstrap-prefs-ai-error" data-prefs-ai-model-error hidden></p>

      <label class="gstrap-prefs-ai-field-label" for="gstrap-prefs-ai-effort">${escHtml(t('ai.settings.effort.label'))}</label>
      <select id="gstrap-prefs-ai-effort" class="gstrap-prefs-ai-select" data-prefs-ai-field="effort" disabled>
        ${EFFORT_LEVELS.map(level => `<option value="${level}" ${aiPrefs.effort === level ? 'selected' : ''}>${escHtml(t(`ai.settings.effort.${level}`))}</option>`).join('')}
      </select>
      <p class="gstrap-prefs-ai-note">${escHtml(t('ai.settings.effort.unsupported'))}</p>
    `
  }

  if (aiModels.length === 0) {
    // Mid-fetch (or, rarer, a provider whose list is genuinely empty) —
    // either way there is nothing yet to put in a <select>, and painting
    // the PREVIOUS provider's list under this section while the new one
    // loads is worse than a plain loading line. loadAiModels always
    // settles this one way or the other (populated, or aiModelsError
    // above), so this never lingers.
    return `
      <label class="gstrap-prefs-ai-field-label">${escHtml(t('ai.settings.model.label'))}</label>
      <p class="gstrap-prefs-ai-guidance">${escHtml(t('ai.settings.loading'))}</p>
    `
  }

  const modelOptions = aiModels.map(model => `
    <option value="${escAttr(model.id)}" ${!aiModelOtherMode && aiPrefs.model === model.id ? 'selected' : ''}>${escHtml(model.label)}</option>
  `).join('')

  // supportsEffort is only knowable for a curated entry, and even there
  // only when the field is present — "fall back to true if absent" instead
  // of assuming the field's absence means unsupported. A free-text
  // "Other…" id has no curated entry to check at all, which is the
  // "unknown" case: treated the same as false rather than guessed at,
  // since sending effort to a model that silently rejects it is worse than
  // greying the control out.
  const selectedModel = aiModels.find(model => model.id === aiPrefs.model)
  const effortSupported = aiModelOtherMode
    ? false
    : (selectedModel ? selectedModel.supportsEffort !== false : true)

  return `
    <label class="gstrap-prefs-ai-field-label" for="gstrap-prefs-ai-model">${escHtml(t('ai.settings.model.label'))}</label>
    <select id="gstrap-prefs-ai-model" class="gstrap-prefs-ai-select" data-prefs-ai-field="model">
      ${modelOptions}
      <option value="__other__" ${aiModelOtherMode ? 'selected' : ''}>${escHtml(t('ai.settings.model-other'))}</option>
    </select>
    ${aiModelOtherMode ? `
      <input type="text" class="gstrap-prefs-ai-model-other" data-prefs-ai-field="model-other"
             value="${escAttr(aiPrefs.model)}" placeholder="${escAttr(t('ai.settings.model-other-placeholder'))}">
      <p class="gstrap-prefs-ai-error" data-prefs-ai-model-error hidden></p>
    ` : ''}

    <label class="gstrap-prefs-ai-field-label" for="gstrap-prefs-ai-effort">${escHtml(t('ai.settings.effort.label'))}</label>
    <select id="gstrap-prefs-ai-effort" class="gstrap-prefs-ai-select" data-prefs-ai-field="effort" ${effortSupported ? '' : 'disabled'}>
      ${EFFORT_LEVELS.map(level => `<option value="${level}" ${aiPrefs.effort === level ? 'selected' : ''}>${escHtml(t(`ai.settings.effort.${level}`))}</option>`).join('')}
    </select>
    ${effortSupported ? '' : `<p class="gstrap-prefs-ai-note">${escHtml(t('ai.settings.effort.unsupported'))}</p>`}
  `
}

/**
 * Push aiKeyLinkError into the DOM via real textContent (never templated
 * into the innerHTML string paint() builds) — the one place in this pane
 * where the text can originate outside our own i18n catalog (a provider's
 * own error message, echoed back from validateKey/setKey).
 */
function paintAiErrorText() {
  const el = overlay?.querySelector('[data-prefs-ai-error]')
  if (!el) return
  if (aiKeyLinkError) {
    el.hidden = false
    el.textContent = aiKeyLinkError
  } else {
    el.hidden = true
    el.textContent = ''
  }
}

/**
 * Push aiModelOtherError into the DOM via real textContent, same reasoning
 * and pattern as paintAiErrorText — the free-text model id is the other
 * place a validation message needs to reach the DOM without going through
 * the innerHTML template.
 */
function paintAiModelErrorText() {
  const el = overlay?.querySelector('[data-prefs-ai-model-error]')
  if (!el) return
  if (aiModelOtherError) {
    el.hidden = false
    el.textContent = aiModelOtherError
  } else {
    el.hidden = true
    el.textContent = ''
  }
}

/**
 * Push aiHostError into the DOM via real textContent — same pattern and
 * reasoning as paintAiErrorText, for the Ollama host field.
 */
function paintAiHostErrorText() {
  const el = overlay?.querySelector('[data-prefs-ai-host-error]')
  if (!el) return
  if (aiHostError) {
    el.hidden = false
    el.textContent = aiHostError
  } else {
    el.hidden = true
    el.textContent = ''
  }
}

/**
 * Push the models-load-failed message into the DOM via real textContent.
 * Unlike the other three error paragraphs, this element only exists in
 * the DOM at all when aiModelsError is set (paintAiModelSection's
 * load-failed branch), so there is no hidden-toggle to manage here — a
 * missing element (no error) is simply a no-op.
 */
function paintAiModelsErrorText() {
  const el = overlay?.querySelector('[data-prefs-ai-models-error]')
  if (!el || !aiModelsError) return
  el.textContent = t('ai.settings.models.load-failed', { error: aiModelsError.message || '' })
}

/**
 * Handle a 'change' event on one of the AI pane's data-prefs-ai-field
 * elements (provider select, the Ollama host field, model select, the
 * free-text "Other…" model id, effort select).
 * @param {string} field - 'provider' | 'ollama-host' | 'model' | 'model-other' | 'effort'
 * @param {string} value - the field's new value
 */
function handleAiFieldChange(field, value) {
  if (field === 'provider') {
    handleProviderChange(value)
    return
  }
  if (field === 'ollama-host') {
    persistOllamaHost(value)
    return
  }
  if (field === 'model') {
    if (value === '__other__') {
      aiModelOtherMode = true
      paint()
      return
    }
    aiModelOtherMode = false
    aiModelOtherError = null
    aiPrefs = { ...aiPrefs, model: value }
    persistAiPrefs()
    paint()
    return
  }
  if (field === 'model-other') {
    persistModelOther(value)
    return
  }
  if (field === 'effort') {
    aiPrefs = { ...aiPrefs, effort: value }
    persistAiPrefs()
  }
}

/**
 * Validate and persist the free-text "Other…" model id. Shared by the
 * field's own 'change' handler and close()'s pending-edit flush, so both
 * paths reject the same way.
 *
 * Empty and the literal sentinel value `__other__` (what the <select>'s
 * own "Other…" option uses — persisting it as a real model id would make
 * the pane's own curated/other detection ambiguous on the next load) are
 * both rejected the same as an invalid character, via the same inline
 * message; there is no meaningfully different guidance to give for each.
 *
 * @param {string} rawValue - the model-other input's current value
 */
function persistModelOther(rawValue) {
  const trimmed = rawValue.trim()
  if (!trimmed || trimmed === '__other__' || !MODEL_OTHER_PATTERN.test(trimmed)) {
    aiModelOtherError = t('ai.settings.model-other-invalid')
    paintAiModelErrorText()
    return
  }
  aiModelOtherError = null
  paintAiModelErrorText()
  aiPrefs = { ...aiPrefs, model: trimmed }
  persistAiPrefs()
}

/**
 * Is this a full http(s):// address, with no embedded whitespace ("no
 * trailing junk" — a pasted host with stray text after it reads as
 * whitespace inside what should be one token)?
 * @param {string} value - candidate Ollama host, already trimmed
 * @returns {boolean}
 */
function isValidOllamaHost(value) {
  if (!value || /\s/.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validate and persist the Ollama host field. Shared by the field's own
 * 'change' handler and close()'s pending-edit flush, same pattern as
 * persistModelOther.
 * @param {string} rawValue - the host input's current value
 */
function persistOllamaHost(rawValue) {
  const trimmed = rawValue.trim()
  if (!isValidOllamaHost(trimmed)) {
    aiHostError = t('ai.settings.ollama.host-invalid')
    paintAiHostErrorText()
    return
  }
  aiHostError = null
  paintAiHostErrorText()
  aiPrefs = { ...aiPrefs, ollamaHost: trimmed }
  persistAiPrefs()
}

/**
 * Handle switching the Provider select. The current model id almost
 * certainly belongs to the OTHER provider, so this never just flips
 * `provider` in place:
 *  1. Records the OUTGOING provider's model in lastModelByProvider first,
 *     so switching back later can restore it instead of always landing on
 *     the list's first entry (session-scoped memory only — no new prefs
 *     key).
 *  2. Persists provider + `model: ''` immediately — never the OLD
 *     provider's model silently relabeled under the new provider, even
 *     for the brief window before the list resolves. An empty model is a
 *     clean, provider-level "pick a model" state the pane already renders
 *     correctly; a foreign model id pointed at the wrong provider is not,
 *     and Esc/quit during the fetch would otherwise leave exactly that on
 *     disk until the dialog is reopened.
 *  3. Reloads the model list for the now-current provider (main resolves
 *     listModels() against prefs.ai.provider server-side, so the new list
 *     can't be fetched before step 2 lands).
 *  4. Prefers the remembered model for this provider when the fresh list
 *     still carries it, else the list's first entry, else '' (the
 *     load-failed state explains that case).
 *
 * Guarded against overlapping switches — and against Retry racing a
 * switch — by aiSwitchGen: every await re-checks the generation captured
 * at entry, so a fast second switch (or the dialog closing) can't let a
 * stale chain persist a cross-provider model id after the fact.
 *
 * Paints once immediately (Provider/Account-or-Host sections swap right
 * away; aiModels is cleared to [] so the Model & effort section shows its
 * loading state instead of the OLD provider's list under the NEW
 * provider's heading) and again once the model list settles.
 * @param {string} newProvider - 'anthropic' | 'ollama'
 * @returns {Promise<void>}
 */
async function handleProviderChange(newProvider) {
  const gen = ++aiSwitchGen
  lastModelByProvider[aiPrefs.provider] = aiPrefs.model
  aiPrefs = { ...aiPrefs, provider: newProvider, model: '' }
  aiModelOtherMode = false
  aiModelOtherError = null
  aiModelsError = null
  aiModels = []
  paint()
  await persistAiPrefs()
  if (!overlay || gen !== aiSwitchGen) return
  await loadAiModels()
  if (!overlay || gen !== aiSwitchGen) return
  const remembered = lastModelByProvider[newProvider]
  const chosen = (remembered && aiModels.some(model => model.id === remembered))
    ? remembered
    : (aiModels[0]?.id ?? '')
  aiPrefs = { ...aiPrefs, model: chosen }
  await persistAiPrefs()
  if (!overlay || gen !== aiSwitchGen) return
  paint()
}

/**
 * Handle the Model & effort section's Retry button (load-failed state):
 * re-run the model fetch for the current provider and repaint.
 *
 * Shares aiSwitchGen with handleProviderChange — Retry mutates the same
 * aiModels/aiModelsError state, so a Retry that resolves after a provider
 * switch started later (or a switch that resolves after a later Retry)
 * must not overwrite the newer result with a stale one.
 *
 * Recomputes aiModelOtherMode the same way the initial load does — if the
 * list comes back this time but no longer carries aiPrefs.model, the
 * select needs its "Other…" branch, not a silently-unselected dropdown.
 * @returns {Promise<void>}
 */
async function handleModelsRetry() {
  const gen = ++aiSwitchGen
  await loadAiModels()
  if (!overlay || gen !== aiSwitchGen) return
  aiModelOtherMode = !aiModelsError && !aiModels.some(model => model.id === aiPrefs.model)
  paint()
}

/**
 * Persist the current aiPrefs working copy to prefs.ai. prefs:set replaces
 * the whole 'ai' object rather than merging it, so aiPrefs always carries
 * all four fields (provider/model/effort/ollamaHost) even though only one
 * usually changed — losing any of the others here would silently reset
 * them on the next write.
 * @returns {Promise<void>}
 */
async function persistAiPrefs() {
  try {
    await window.grapestrap?.prefs?.set?.('ai', aiPrefs)
  } catch (err) {
    eventBus.emit('toast', {
      type: 'error',
      message: t('ai.settings.toast.save-failed', { error: err?.message || err })
    })
  }
}

/**
 * Handle the Link button: validate the typed key, then store it, then
 * refresh status. The key itself is read directly off the input's DOM
 * value at click time, and the input is cleared immediately — it is never
 * captured into module state, logged, or echoed anywhere except this one
 * round-trip to validateKey/setKey.
 *
 * Guarded two ways against the dialog closing mid-request: aiLinkInFlight
 * is a single-flight lock (also what lets the button show a loading label
 * instead of double-firing a second setKey for the same provider), and
 * every post-await step re-checks `overlay` before touching pane state —
 * without that, a slow request outliving a closed dialog could paint a
 * stale error into a dialog the user has since reopened fresh (F4).
 *
 * Always uses aiStatus.effectiveProvider — the provider actually resolved
 * and in effect (fake mode, or main's own unknown-id fallback) — never the
 * raw aiStatus.provider string from prefs, which a hand-edited
 * preferences.json could set to an id no provider registry recognizes;
 * storing a key under that string would orphan it where nothing ever
 * looks for it again.
 * @returns {Promise<void>}
 */
async function handleAiLink() {
  if (aiLinkInFlight) return
  const input = overlay?.querySelector('[data-prefs-ai-key]')
  const key = (input?.value || '').trim()
  if (input) input.value = ''
  if (!key) {
    aiKeyLinkError = t('ai.settings.key-required')
    paintAiErrorText()
    return
  }
  aiLinkInFlight = true
  paint()
  const providerId = aiStatus?.effectiveProvider || 'anthropic'
  try {
    const validation = await window.grapestrap?.ai?.validateKey?.(providerId, key)
    if (!overlay) return
    if (!validation?.ok) {
      aiKeyLinkError = validation?.error?.message || t('ai.settings.link-failed')
      return
    }
    const stored = await window.grapestrap?.ai?.setKey?.(providerId, key)
    if (!overlay) return
    if (!stored?.ok) {
      aiKeyLinkError = stored?.error?.message || t('ai.settings.link-failed')
      return
    }
    aiKeyLinkError = null
    await loadAiStatus()
    if (!overlay) return
  } catch (err) {
    if (!overlay) return
    // A rejected invoke (IPC/transport failure), not a validateKey/setKey
    // error envelope — surface the caught error's own message, never `key`.
    aiKeyLinkError = err?.message || t('ai.settings.link-failed')
  } finally {
    aiLinkInFlight = false
    if (overlay) paint()
  }
}

/**
 * Handle the confirmed Unlink click: clear the stored key, then refresh
 * status so the pane falls back to its not-linked (or no-keyring) state.
 * Uses effectiveProvider for the same reason handleAiLink does — see there.
 * @returns {Promise<void>}
 */
async function handleAiUnlink() {
  const providerId = aiStatus?.effectiveProvider || 'anthropic'
  aiUnlinkConfirming = false
  try {
    await window.grapestrap?.ai?.clearKey?.(providerId)
  } catch (err) {
    if (!overlay) return
    eventBus.emit('toast', {
      type: 'error',
      message: t('ai.settings.toast.unlink-failed', { error: err?.message || err })
    })
  }
  await loadAiStatus()
  if (!overlay) return
  paint()
}

function handleAction(action, command) {
  switch (action) {
    case 'close':              close(); return
    case 'edit':               editingCommand = command; paint(); return
    case 'cancel-edit':        editingCommand = null; paint(); return
    case 'reset':              resetCommand(command); return
    case 'reset-all':          resetAll(); return
    case 'ai-link':            handleAiLink(); return
    case 'ai-unlink':          aiUnlinkConfirming = true; paint(); return
    case 'ai-unlink-cancel':   aiUnlinkConfirming = false; paint(); return
    case 'ai-unlink-confirm':  handleAiUnlink(); return
    case 'ai-models-retry':    handleModelsRetry(); return
  }
}

function onKeyDown(evt) {
  if (!overlay) return
  // Capture combos for the row currently in edit mode.
  if (editingCommand) {
    if (evt.key === 'Escape') {
      evt.preventDefault(); evt.stopImmediatePropagation()
      editingCommand = null; paint()
      return
    }
    // Wait for a non-modifier key. Skip pure-modifier keydowns.
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(evt.key)) return
    evt.preventDefault(); evt.stopImmediatePropagation()
    const next = {
      key:   (evt.key || '').toLowerCase(),
      ctrl:  !!(evt.ctrlKey || evt.metaKey),
      shift: !!evt.shiftKey,
      alt:   !!evt.altKey
    }
    overrides = { ...overrides, [editingCommand]: next }
    persistOverrides()
    editingCommand = null
    paint()
    return
  }
  // Plain Esc when not editing closes the dialog.
  if (evt.key === 'Escape') {
    evt.preventDefault(); evt.stopImmediatePropagation()
    close()
  }
}

function resetCommand(command) {
  if (!Object.prototype.hasOwnProperty.call(overrides, command)) return
  const next = { ...overrides }
  delete next[command]
  overrides = next
  persistOverrides()
  paint()
}

function resetAll() {
  overrides = {}
  persistOverrides()
  paint()
}

async function persistOverrides() {
  try { await window.grapestrap?.prefs?.set?.('shortcuts', overrides) }
  catch (err) {
    // Audit-found gap: silent swallow meant the user could rebind shortcuts
    // and lose the change on relaunch with no warning. Toast so the failure
    // is visible — in-memory state still works for the session.
    eventBus.emit('toast', {
      type: 'error',
      message: t('prefs.toast.save-failed', { error: err?.message || err })
    })
  }
  eventBus.emit('shortcuts:user-changed', overrides)
}

function findConflict(commandId, binding) {
  if (!binding || !binding.key) return null
  // Find any OTHER active binding with the same combo.
  const all = resolveBindings(overrides)
  for (const b of all) {
    if (b.command === commandId) continue
    if (b.key   !== binding.key) continue
    if (!!b.ctrl  !== !!binding.ctrl)  continue
    if (!!b.shift !== !!binding.shift) continue
    if (!!b.alt   !== !!binding.alt)   continue
    return b.command
  }
  return null
}

function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]) }
function escAttr(s) { return escHtml(s) }
