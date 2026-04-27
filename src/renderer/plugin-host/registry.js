/**
 * GrapeStrap — Plugin registry (renderer)
 *
 * Holds all currently-registered contributions from active plugins. The host
 * fetches plugin code from the main process (via grapestrap.plugins.readEntry),
 * dynamic-imports it as a Blob URL ES module, and calls its default export.
 *
 * Note: Blob URL imports are required because Electron's renderer can't
 * dynamic-import paths outside of its bundle by default. Each plugin gets its
 * own scoped API instance via buildApi().
 */

import { buildApi } from './api.js'
import { trustPrompt } from './trust-prompt.js'
import { eventBus } from '../state/event-bus.js'
import { log } from '../log.js'

export const pluginRegistry = {
  available: [],
  activated: [],
  failed: [],

  // Contributions
  blocks: [],
  sections: [],
  panels: [],
  exporters: [],
  commands: new Map(),
  snippets: [],
  languages: new Map(),
  menuItems: [],
  statusBarItems: [],
  toolbarButtons: [],

  // Bound editor handles, filled in by editor inits once they're up
  bound: {
    editor: null,
    monaco: null,
    project: null,
    activeTab: null
  },

  setBound(key, value) {
    this.bound[key] = value
  }
}

export async function activateAllPlugins() {
  pluginRegistry.available = await window.grapestrap.plugins.list()
  log.info('plugins available:', pluginRegistry.available.map(p => `${p.name}@${p.version}(${p.source})`))

  for (const summary of pluginRegistry.available) {
    try {
      // Trust prompt for user-installed plugins on first encounter
      if (summary.source === 'user') {
        const trusted = await trustPrompt(summary)
        if (!trusted) {
          log.warn(`Skipping untrusted user plugin: ${summary.name}`)
          continue
        }
      }
      await activatePlugin(summary)
    } catch (err) {
      log.error(`Plugin activation failed: ${summary.name}`, err)
      pluginRegistry.failed.push({ summary, error: err.message })
      eventBus.emit('toast', {
        type: 'error',
        message: `Plugin "${summary.name}" failed to load: ${err.message}`
      })
    }
  }
}

async function activatePlugin(summary) {
  const entry = await window.grapestrap.plugins.readEntry(summary.name)
  if (!entry) throw new Error('plugin entry not readable')

  const blob = new Blob([entry.code], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)

  let mod
  try { mod = await import(/* @vite-ignore */ url) }
  finally { URL.revokeObjectURL(url) }

  if (typeof mod.default !== 'function') {
    throw new Error(`Plugin ${summary.name} has no default export function`)
  }

  const api = buildApi(entry.manifest)
  await mod.default(api)

  pluginRegistry.activated.push({ summary, manifest: entry.manifest })
  log.info(`activated ${summary.name}@${summary.version}`)
  eventBus.emit('plugin:activated', { name: summary.name, manifest: entry.manifest })
}
