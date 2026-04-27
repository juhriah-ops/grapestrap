/**
 * GrapeStrap — Renderer entry
 *
 * Bootstrap order:
 *   1. Connect to preload bridge (window.grapestrap.*)
 *   2. Initialize event bus + project state + page state
 *   3. Discover and activate plugins (built-ins first, then user, then project)
 *   4. Wire native menu actions to commands
 *   5. Initialize Golden Layout in #gstrap-main
 *   6. Render fixed regions: toolbar, tabs, status bar (Insert / Strip / Linked / DOM
 *      get filled per their milestone)
 *   7. Show empty-state until a project is opened
 */

import { eventBus } from './state/event-bus.js'
import { projectState } from './state/project-state.js'
import { pageState } from './state/page-state.js'
import { pluginRegistry, activateAllPlugins } from './plugin-host/registry.js'
import { initGoldenLayout } from './layout/golden-layout-config.js'
import { renderToolbar } from './panels/toolbar.js'
import { renderTabs } from './panels/tabs.js'
import { renderStatusBar } from './status-bar/status-bar.js'
import { renderInsertPanel } from './panels/insert/index.js'
import { renderPropertyStrip } from './panels/properties-strip/index.js'
import { wireMenuActions } from './shortcuts/menu-router.js'
import { showWelcomeIfFirstRun } from './dialogs/welcome.js'
import { log } from './log.js'

async function boot() {
  if (!window.grapestrap) {
    document.body.innerHTML = '<pre style="color:#f48771;padding:24px">FATAL: preload bridge missing. Check security configuration.</pre>'
    return
  }

  const info = await window.grapestrap.app.info()
  log.info('renderer boot', info)

  // 1. Activate plugins (loads them via dynamic import of their entry code)
  await activateAllPlugins()
  log.info(`activated ${pluginRegistry.activated.length} plugin(s)`)

  // 2. Render fixed regions
  renderToolbar(document.getElementById('gstrap-toolbar'))
  renderTabs(document.getElementById('gstrap-tabs'))
  renderInsertPanel(document.getElementById('gstrap-insert'))
  renderPropertyStrip(document.getElementById('gstrap-strip'))
  renderStatusBar(document.getElementById('gstrap-status'))

  // 3. Initialize Golden Layout in main region
  initGoldenLayout(document.getElementById('gstrap-main'))

  // 4. Wire menu actions
  wireMenuActions()

  // 5. First-run welcome
  await showWelcomeIfFirstRun()

  // 6. Empty state until project opens
  eventBus.emit('app:ready', { info })
}

boot().catch(err => {
  console.error('boot failure', err)
  document.body.innerHTML = `<pre style="color:#f48771;padding:24px">BOOT FAILURE\n\n${err.stack || err.message}</pre>`
})

// Internal handle for devtools and the Playwright smoke test. Not part of
// the public API surface — plugins access state via `api.*` from buildApi(),
// not through this. Containment relies on preload-bridge-only IPC + sandbox +
// contextIsolation, not on hiding this object.
window.__gstrap = { eventBus, projectState, pageState, pluginRegistry }
