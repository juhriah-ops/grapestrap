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

// Vendor CSS — bundled by Vite. Without these the editor renders unstyled
// (Golden Layout panels stack at document-default top-left, GrapesJS chrome
// has no toolbar styling). Theme overrides live in styles/golden-layout-
// overrides.css.
import 'golden-layout/dist/css/goldenlayout-base.css'
import 'golden-layout/dist/css/themes/goldenlayout-dark-theme.css'
import 'grapesjs/dist/css/grapes.min.css'

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
import { wireKeybindings } from './shortcuts/keybindings.js'
import { showWelcomeIfFirstRun } from './dialogs/welcome.js'
import { showContextMenu } from './dialogs/context-menu.js'
import { buildComponentMenuItems } from './shortcuts/component-actions.js'
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

  // 4. Wire menu actions + renderer-side keybindings.
  //    Native menu accelerators don't fire reliably on Linux (auto-hide menu
  //    bar) or when an iframe / Monaco has focus, so wireKeybindings() is the
  //    actually-works path for Ctrl+S and friends. See keybindings.js.
  wireMenuActions()
  wireKeybindings()

  // 5. Single context-menu open path. Both the canvas iframe handler (in
  //    grapesjs-init.js) and the DOM tree (in panels/dom-tree) emit
  //    `canvas:context-menu` with viewport coords + component — one listener
  //    here opens the actual menu so the menu definition lives in exactly
  //    one place (component-actions.js).
  //
  //    Registered BEFORE the welcome dialog: showWelcomeIfFirstRun() awaits
  //    user dismissal on first run, and we don't want context-menu to be
  //    silently broken until the welcome is closed.
  eventBus.on('canvas:context-menu', ({ x, y, component }) => {
    showContextMenu(x, y, buildComponentMenuItems(component))
  })

  // 6. First-run welcome (blocks on user dismissal — must be after every
  //    listener that needs to be live during the welcome screen)
  await showWelcomeIfFirstRun()

  // 7. Empty state until project opens
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
