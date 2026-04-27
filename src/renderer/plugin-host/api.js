/**
 * GrapeStrap — Plugin API surface (per-plugin instance)
 *
 * Each plugin's register() function receives one of these objects. The API is
 * scoped: the plugin only sees its own manifest, its own scoped fs (project-aware
 * via preload), and its own logger. Cross-plugin coupling happens through events
 * on the shared event bus.
 *
 * Stability: API is semver-versioned. v0.1.x maintains backward compat. Breaking
 * changes require a major version bump and a migration guide.
 */

import { eventBus } from '../state/event-bus.js'
import { log } from '../log.js'
import { pluginRegistry } from './registry.js'

export function buildApi(manifest) {
  const pluginLog = {
    info:  (...a) => log.info(`[${manifest.name}]`, ...a),
    warn:  (...a) => log.warn(`[${manifest.name}]`, ...a),
    error: (...a) => log.error(`[${manifest.name}]`, ...a),
    debug: (...a) => log.debug(`[${manifest.name}]`, ...a)
  }

  const api = {
    manifest: Object.freeze({ ...manifest }),

    // Registration
    registerBlock(def) {
      validateBlock(def)
      pluginRegistry.blocks.push({ ...def, _plugin: manifest.name })
      eventBus.emit('plugin:block-registered', { plugin: manifest.name, block: def })
    },
    registerSection(def) {
      validateSection(def)
      pluginRegistry.sections.push({ ...def, _plugin: manifest.name })
      eventBus.emit('plugin:section-registered', { plugin: manifest.name, section: def })
    },
    registerPanel(def) {
      validatePanel(def)
      pluginRegistry.panels.push({ ...def, _plugin: manifest.name })
      eventBus.emit('plugin:panel-registered', { plugin: manifest.name, panel: def })
    },
    registerExporter(def) {
      validateExporter(def)
      pluginRegistry.exporters.push({ ...def, _plugin: manifest.name })
      eventBus.emit('plugin:exporter-registered', { plugin: manifest.name, exporter: def })
    },
    registerCommand(def) {
      validateCommand(def)
      pluginRegistry.commands.set(def.id, { ...def, _plugin: manifest.name })
      eventBus.emit('plugin:command-registered', { plugin: manifest.name, command: def })
    },
    registerSnippet(def) {
      validateSnippet(def)
      pluginRegistry.snippets.push({ ...def, _plugin: manifest.name })
      eventBus.emit('plugin:snippet-registered', { plugin: manifest.name, snippet: def })
    },
    registerLanguage(def) {
      validateLanguage(def)
      pluginRegistry.languages.set(def.code, { ...def, _plugin: manifest.name })
      eventBus.emit('plugin:language-registered', { plugin: manifest.name, language: def })
    },

    // Menu / UI
    addMenuItem(def) {
      validateMenuItem(def)
      pluginRegistry.menuItems.push({ ...def, _plugin: manifest.name })
      eventBus.emit('plugin:menu-item-added', { plugin: manifest.name, item: def })
    },
    addStatusBarItem(def) {
      pluginRegistry.statusBarItems.push({ ...def, _plugin: manifest.name })
      eventBus.emit('plugin:status-item-added', { plugin: manifest.name, item: def })
    },
    addToolbarButton(def) {
      pluginRegistry.toolbarButtons.push({ ...def, _plugin: manifest.name })
      eventBus.emit('plugin:toolbar-button-added', { plugin: manifest.name, button: def })
    },

    // Events
    on:  (event, handler) => eventBus.on(event, handler),
    off: (event, handler) => eventBus.off(event, handler),
    emit:(event, payload) => eventBus.emit(event, payload),

    // Editor access (filled in once GrapesJS / Monaco mount; null until then)
    get editor()    { return pluginRegistry.bound.editor    },
    get monaco()    { return pluginRegistry.bound.monaco    },
    get project()   { return pluginRegistry.bound.project   },
    get activeTab() { return pluginRegistry.bound.activeTab },

    // Sandboxed I/O — plugin-data only via preload bridge (TODO v0.0.2: plumb
    // a real fs proxy through ipcRenderer with plugin-name-scoped paths)
    fs: {
      readFile:  (path) => Promise.reject(new Error('plugin fs not wired in v0.0.1')),
      writeFile: (path) => Promise.reject(new Error('plugin fs not wired in v0.0.1'))
    },

    // UI helpers
    notify: {
      success: (msg, opts) => eventBus.emit('toast', { type: 'success', message: msg, ...opts }),
      info:    (msg, opts) => eventBus.emit('toast', { type: 'info',    message: msg, ...opts }),
      warning: (msg, opts) => eventBus.emit('toast', { type: 'warning', message: msg, ...opts }),
      error:   (msg, opts) => eventBus.emit('toast', { type: 'error',   message: msg, ...opts })
    },
    log: pluginLog,

    preferences: {
      get: (key) => window.grapestrap.prefs.get(`plugins.${manifest.name}.${key}`),
      set: (key, value) => window.grapestrap.prefs.set(`plugins.${manifest.name}.${key}`, value)
    }
  }

  return api
}

// ─── Validators ──────────────────────────────────────────────────────────────

function validateBlock(def) {
  required(def, ['id', 'label', 'content'], 'registerBlock')
  if (def.category === undefined) def.category = 'Common'
}
function validateSection(def) {
  required(def, ['id', 'label', 'content'], 'registerSection')
}
function validatePanel(def) {
  required(def, ['id', 'title', 'component'], 'registerPanel')
}
function validateExporter(def) {
  required(def, ['id', 'label', 'exportFn'], 'registerExporter')
  if (typeof def.exportFn !== 'function') throw new Error('registerExporter: exportFn must be a function')
}
function validateCommand(def) {
  required(def, ['id', 'label', 'handler'], 'registerCommand')
  if (typeof def.handler !== 'function') throw new Error('registerCommand: handler must be a function')
}
function validateSnippet(def) {
  required(def, ['id', 'label', 'content'], 'registerSnippet')
}
function validateLanguage(def) {
  required(def, ['code', 'name', 'messages'], 'registerLanguage')
}
function validateMenuItem(def) {
  required(def, ['menu', 'label', 'command'], 'addMenuItem')
}

function required(obj, fields, where) {
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null) {
      throw new Error(`${where}: missing required field "${f}"`)
    }
  }
}
