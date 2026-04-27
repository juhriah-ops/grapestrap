/**
 * GrapeStrap — Plugin registry (renderer)
 *
 * Holds all currently-registered contributions from active plugins. The host
 * dynamic-imports each plugin's entry module from a `gstrap-plugin://<uid>/<file>`
 * URL served by the privileged protocol handler in main.js. Because the URL
 * is hierarchical, plugins can use relative imports (`./helpers.js`,
 * `./messages.json`) — they resolve normally against the plugin's directory.
 *
 * Each plugin gets its own scoped API instance via buildApi(manifest).
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
  if (!summary.uid) throw new Error(`Plugin ${summary.name} missing uid (main-process registry out of sync)`)
  if (!summary.manifest?.main) throw new Error(`Plugin ${summary.name} manifest missing 'main'`)

  const url = `gstrap-plugin://${summary.uid}/${encodeURI(summary.manifest.main)}`
  const mod = await import(/* @vite-ignore */ url)

  if (typeof mod.default !== 'function') {
    throw new Error(`Plugin ${summary.name} has no default export function`)
  }

  const api = buildApi(summary.manifest)
  await mod.default(api)

  pluginRegistry.activated.push({ summary, manifest: summary.manifest })
  log.info(`activated ${summary.name}@${summary.version}`)
  eventBus.emit('plugin:activated', { name: summary.name, manifest: summary.manifest })
}
