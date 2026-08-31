/**
 * GrapeStrap — Preferences (persistent JSON config)
 *
 * Backed by electron-store, written to $XDG_CONFIG_HOME/GrapeStrap/preferences.json
 * (NOT the default Electron user data dir, which would be ~/.config/GrapeStrap/Config).
 *
 * Schema is loose by design — plugins namespace their own keys under `plugins.<name>.*`
 * and we don't validate plugin sub-trees here.
 */

import Store from 'electron-store'
import { dirname } from 'node:path'
import { xdg } from './platform/xdg.js'
import { OLLAMA_DEFAULT_HOST } from './ai/contract.js'

const DEFAULTS = {
  general: {
    welcomeShown: false,
    language: 'en',        // catalog code from a language plugin (@grapestrap/lang-en ships 'en')
    recentProjectsLimit: 10,
    confirmOnQuit: true,
    autosaveIntervalSeconds: 30
  },
  editor: {
    theme: 'dark',
    monaco: {
      fontSize: 13,
      tabSize: 2,
      wordWrap: 'off',
      minimap: false,
      lineNumbers: true
    },
    canvas: {
      defaultDevice: 'Desktop',
      showRulers: false
    }
  },
  view: {
    fileManagerVisible: true,
    propertiesPanelVisible: true,
    propertyStripVisible: true,
    insertPanelVisible: true,
    statusBarVisible: true,
    domTreeVisible: false,  // v0.0.2 default: false until that panel ships
    // Backfilled 2026-08-30: view-toggles.js's RIGHT_STACK_TABS has read
    // these two prefKeys since the Custom CSS / Bootstrap CSS right-stack
    // tabs shipped, but DEFAULTS never carried them — a fresh XDG config
    // (new install, or any e2e launch, which always starts from a clean
    // tmp XDG root) read `undefined` and fell back to view-toggles.js's
    // own inline `defaultVisible: true`, so behavior was right by luck,
    // not by DEFAULTS. Anything that reads prefs.view directly (rather
    // than through wireViewToggles' per-tab fallback) would have seen a
    // hole here.
    customCssVisible: true,
    bootstrapCssVisible: true,
    aiPanelVisible: true     // v0.2 Phase A: AI agent panel right-stack tab
  },
  shortcuts: {
    // Empty in v0.0.1; rebinds layered over default-bindings.js
  },
  plugins: {
    enabled: {},          // { '@grapestrap/blocks-bootstrap5': true, ... }
    trustedHashes: {}     // first-load trust prompt records: { name: sha256 }
  },
  // v0.2 Phase A: non-secret AI agent config. The API key itself NEVER goes
  // here — it lives encrypted in ai/key-store.js, outside prefs.json.
  // ollamaHost (added for the Ollama provider) is loopback-only by default —
  // GrapeStrap is a public app; a LAN/remote default would silently point a
  // fresh install at a host it never asked to reach. Sourced from
  // contract.js's OLLAMA_DEFAULT_HOST rather than a literal here — that was
  // a third hand-copied instance of the same address (this file,
  // contract.js, and a renderer initializer that's since been changed to
  // '' for the same reason); one constant now, imported.
  ai: {
    provider: 'anthropic',
    model: 'claude-opus-5',
    effort: 'high',
    ollamaHost: OLLAMA_DEFAULT_HOST
  },
  telemetry: false        // hardcoded; we never collect anything
}

let store = null

export function initPrefs() {
  store = new Store({
    cwd: dirname(xdg.prefsFile),
    name: 'preferences',
    defaults: DEFAULTS,
    fileExtension: 'json',
    clearInvalidConfig: true
  })
  return store
}

export function getPrefs() {
  if (!store) throw new Error('prefs not initialized — call initPrefs() first')
  return store
}

export function getPref(key) {
  return getPrefs().get(key)
}

export function setPref(key, value) {
  getPrefs().set(key, value)
}

export { DEFAULTS }
