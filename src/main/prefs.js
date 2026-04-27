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

const DEFAULTS = {
  general: {
    welcomeShown: false,
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
    domTreeVisible: false   // v0.0.2 default: false until that panel ships
  },
  shortcuts: {
    // Empty in v0.0.1; rebinds layered over default-bindings.js
  },
  plugins: {
    enabled: {},          // { '@grapestrap/blocks-bootstrap5': true, ... }
    trustedHashes: {}     // first-load trust prompt records: { name: sha256 }
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
