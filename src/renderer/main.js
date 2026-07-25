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

// Font Awesome 6 Free — GrapesJS's default panel button icons are FA v4
// class names ("fa fa-arrow-up", "fa fa-eye", etc.). Without these
// stylesheets the buttons render as invisible-but-clickable rectangles
// (reported on nola1 2026-05-03: "things arent visible on the canvas
// theres buttons i didnt know were there"). The v4-shims map FA v4
// names to FA v6's solid set.
import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import '@fortawesome/fontawesome-free/css/solid.min.css'
import '@fortawesome/fontawesome-free/css/regular.min.css'
import '@fortawesome/fontawesome-free/css/v4-shims.min.css'

import { eventBus } from './state/event-bus.js'
import { projectState } from './state/project-state.js'
import { pageState } from './state/page-state.js'
import { wireRecovery, checkRecoveryAtBoot, recoveryState } from './state/recovery.js'
import { pluginRegistry, activateAllPlugins } from './plugin-host/registry.js'
import { initI18n, t, setLocale, getLocale, getAvailableLanguages, isReady } from './i18n.js'
import { initGoldenLayout } from './layout/golden-layout-config.js'
import { renderToolbar } from './panels/toolbar.js'
import { renderTabs } from './panels/tabs.js'
import { renderLinkedFilesBar } from './panels/linked-files/index.js'
import { renderBreakpointsBar } from './panels/breakpoints/index.js'
import { wireViewToggles } from './panels/view-toggles.js'
import { initWorkspaces, workspacesTestSurface } from './layout/workspaces.js'
import { wirePreview, previewTestSurface } from './preview.js'
import { initGitState, gitState } from './state/git-state.js'
import { renderStatusBar } from './status-bar/status-bar.js'
import { renderInsertPanel } from './panels/insert/index.js'
import { renderPropertyStrip } from './panels/properties-strip/index.js'
import { wireMenuActions } from './shortcuts/menu-router.js'
import { wireKeybindings } from './shortcuts/keybindings.js'
import { wireToasts } from './dialogs/toasts.js'
import { openPreferencesDialog } from './dialogs/preferences.js'
import { showAboutDialog } from './dialogs/about.js'
import { showWelcomeIfFirstRun } from './dialogs/welcome.js'
import { showContextMenu } from './dialogs/context-menu.js'
import { buildComponentMenuItems } from './shortcuts/component-actions.js'
import { wireTemplateLock } from './panels/templates/lock.js'
import { buildTemplateMenuItems } from './panels/templates/context-items.js'
import { createTemplate, deleteTemplate, createPage, detachActivePage } from './panels/templates/manage.js'
import { propagateTemplate, extractRegions, composeFromTemplate } from './panels/templates/propagate.js'
import { getCssEditor } from './panels/custom-css/index.js'
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

  // 1b. i18n — must follow plugin activation (catalogs come from language
  //     plugins via api.registerLanguage) and precede every fixed-region
  //     render so t() resolves from the first paint. Wave 1 wires the
  //     runtime only; the retroactive t() extraction sweep is Wave 4.
  await initI18n()

  // 2. Render fixed regions
  renderToolbar(document.getElementById('gstrap-toolbar'))
  renderTabs(document.getElementById('gstrap-tabs'))
  renderLinkedFilesBar(document.getElementById('gstrap-linkedfiles'))
  renderBreakpointsBar(document.getElementById('gstrap-breakpoints'))
  renderInsertPanel(document.getElementById('gstrap-insert'))
  renderPropertyStrip(document.getElementById('gstrap-strip'))
  renderStatusBar(document.getElementById('gstrap-status'))

  // 3. Initialize Golden Layout in main region
  initGoldenLayout(document.getElementById('gstrap-main'))

  // 4. Wire menu actions + renderer-side keybindings + toast renderer.
  //    Native menu accelerators don't fire reliably on Linux (auto-hide menu
  //    bar) or when an iframe / Monaco has focus, so wireKeybindings() is the
  //    actually-works path for Ctrl+S and friends. See keybindings.js.
  //    Toasts have been emitted across the codebase since v0.0.1 but had no
  //    listener — wireToasts() finally renders them in #gstrap-toasts.
  wireMenuActions()
  wireKeybindings()
  wireToasts()
  wireViewToggles()
  wireRecovery()
  wireTemplateLock()
  // Workspace layouts (Wave 3): seed the saved-name cache and push the list
  // into the native View → Workspace Layouts submenu. Fire-and-forget — the
  // submenu fills in when the list IPC round-trips.
  initWorkspaces()
  // Preview in browser (Wave 3): funnel project:saved + external watcher
  // events into the refresh debounce, and reset preview state on project
  // switch. The server side lives in main's preview-server.js.
  wirePreview()
  // Git status (Wave 3): cache main's git:status pushes and re-emit them on
  // the eventBus with late-subscriber replay via gitState.latest. Wired
  // before any project can open so no push is missed; rendering lives in
  // file-manager (dots) + status-bar (branch cell).
  initGitState()
  eventBus.on('dialog:preferences', () => openPreferencesDialog())

  // Help menu wiring — both items used to emit events nothing listened to.
  // dialog:shortcuts opens Preferences (Shortcuts tab is the default view).
  // dialog:about opens the About modal (Wave 5 — replaced the v0.0.2 toast);
  // version comes from the app:info payload fetched at boot, never hardcoded.
  eventBus.on('dialog:shortcuts', () => openPreferencesDialog())
  eventBus.on('dialog:about', () => showAboutDialog(info))

  // Linked-files chip → focus the Custom CSS panel. The toast in linked-files
  // claimed the panel was opened but nothing actually surfaced it; this
  // closes that loop by toggling the panel visible if it was hidden.
  eventBus.on('linked-files:open-globalcss', () => {
    if (document.body.classList.contains('is-hide-custom-css')) {
      eventBus.emit('view:toggle-custom-css')
    }
  })

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
    showContextMenu(x, y, [
      ...buildComponentMenuItems(component),
      ...buildTemplateMenuItems(component)
    ])
  })

  // Fail-open warning (F1): loadProject keeps a template entry with
  // missingFile=true when its .gstrap-tpl is unreadable — surface it.
  eventBus.on('project:opened', project => {
    const missing = (project?.templates || []).filter(tp => tp.missingFile).map(tp => tp.name)
    if (missing.length) {
      eventBus.emit('toast', {
        type: 'warning',
        message: t('tpl.toast.missing-file', { names: missing.join(', ') })
      })
    }
    // loadProject migrated legacy site-root-relative url()s in globalCSS to
    // the file-relative convention (in memory only — load never writes disk).
    // Mark the CSS dirty so the file-manager dot shows and the user's next
    // save persists the migrated text.
    if (project?.globalCssMigrated) projectState.markCssDirty()
  })

  // 6. First-run welcome (blocks on user dismissal — must be after every
  //    listener that needs to be live during the welcome screen)
  await showWelcomeIfFirstRun()

  // 7. Empty state until project opens
  eventBus.emit('app:ready', { info })

  // 8. Crash-recovery boot check — strictly AFTER the welcome dialog (which
  //    awaits dismissal, so the two modal overlays can never stack) and
  //    after app:ready so the empty state is painted behind the recovery
  //    modal. Never throws; sets recoveryState.bootCheckDone when finished.
  await checkRecoveryAtBoot()
}

boot().catch(err => {
  console.error('boot failure', err)
  document.body.innerHTML = `<pre style="color:#f48771;padding:24px">BOOT FAILURE\n\n${err.stack || err.message}</pre>`
})

// Internal handle for devtools and the Playwright smoke test. Not part of
// the public API surface — plugins access state via `api.*` from buildApi(),
// not through this. Containment relies on preload-bridge-only IPC + sandbox +
// contextIsolation, not on hiding this object.
window.__gstrap = {
  eventBus, projectState, pageState, pluginRegistry, getCssEditor, recoveryState,
  i18n: { t, setLocale, getLocale, getAvailableLanguages, isReady },
  // Wave 2 test surface — templates.spec.js drives these; also handy in devtools.
  templates: {
    createTemplate, deleteTemplate, createPage, detachActivePage,
    propagateTemplate, extractRegions, composeFromTemplate
  },
  // Wave 3 test surface — workspaces.spec.js drives these (e2e never touches
  // native menus; they're not in the DOM).
  workspaces: workspacesTestSurface,
  // Wave 3 test surface — preview.spec.js reads status() (url/port/cacheDir)
  // and drives refresh()/stop().
  preview: previewTestSurface,
  // Wave 3 test surface — git-status.spec.js reads the latest pushed payload
  // (refresh itself is driven through the public window.grapestrap.git bridge).
  git: gitState
}
