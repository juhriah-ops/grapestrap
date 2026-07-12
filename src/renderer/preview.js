/**
 * GrapeStrap — Preview in Browser (renderer side)
 *
 * PATH: src/renderer/preview.js
 * ROLE: view:preview-browser command handler, save/watcher refresh debounce,
 *       and the __gstrap.preview test surface (Wave 3 preview-in-browser)
 * DEPENDS: state/event-bus.js, state/project-state.js, state/page-state.js,
 *          shortcuts/menu-router.js (flush contract — circular import, calls
 *          are runtime-only so the cycle is inert), i18n.js, log.js
 * CREATED: 2026-07-12
 *
 * Reload wiring (PLAN.md §1.3): no second chokidar — the EXISTING project
 * watcher already forwards external file events to the renderer, and saves
 * emit project:saved. Both funnel through one 300 ms trailing debounce into a
 * single preview:refresh carrying the in-memory project (exportProject
 * consumes renderer-held state — pages[].html lives here; main can't
 * re-export alone). The debounce also coalesces the save storm: one Save
 * writes N page files + manifest → N watcher events + 1 project:saved →
 * exactly one re-export/reload.
 */

import { eventBus } from './state/event-bus.js'
import { projectState } from './state/project-state.js'
import { pageState } from './state/page-state.js'
import { flushActiveTabIntoProject, NO_PROJECT_MSG } from './shortcuts/menu-router.js'
import { t } from './i18n.js'
import { log } from './log.js'

const REFRESH_DEBOUNCE_MS = 300

// Renderer-held mirror of the preview the renderer started. No preview:status
// IPC — the renderer initiated the start and owns this state (PLAN.md §3).
const state = { running: false, url: null, pageUrl: null, port: null, cacheDir: null }
let debounceTimer = null

/**
 * Toolbar button + Ctrl+F12 land here via menu-router. Same contract as
 * cmdExport: flush the on-screen canvas into project state, then export FROM
 * MEMORY — preview never saves the project. Errors thrown by the IPC (export
 * or bind failure, F3/F5) propagate to handleCommand's catch → error toast.
 */
export async function cmdPreviewBrowser() {
  const project = projectState.current
  if (!project) {
    return eventBus.emit('toast', { type: 'warning', message: NO_PROJECT_MSG })
  }
  // Preview the active tab when it's a page; template/library tabs aren't
  // exported, so fall back to the project's first page.
  const tab = pageState.active()
  const activePage = (tab?.kind === 'page' && project.pages?.some(p => p.name === tab.pageName))
    ? tab.pageName
    : project.pages?.[0]?.name
  if (!activePage) {
    return eventBus.emit('toast', { type: 'warning', message: t('preview.no-pages') })
  }

  flushActiveTabIntoProject()
  const result = await window.grapestrap.preview.start(project, { activePage })
  state.running = true
  state.url = result.url
  state.pageUrl = result.pageUrl
  state.port = result.port
  state.cacheDir = result.cacheDir

  if (result.browser == null) {
    // F4 degrade: probe miss or spawn failure — the server is up; hand the
    // user the URL instead of failing.
    eventBus.emit('toast', {
      type: 'warning',
      message: t('preview.no-browser', { url: result.pageUrl })
    })
  }
  // Success is silent — the opening browser window IS the feedback.
}

/** Renderer boot wiring (called from main.js boot alongside initWorkspaces). */
export function wirePreview() {
  eventBus.on('project:saved', scheduleRefresh)
  window.grapestrap.watcher.onChanged(scheduleRefresh)
  window.grapestrap.watcher.onAdded(scheduleRefresh)
  window.grapestrap.watcher.onDeleted(scheduleRefresh)
  // Project switch: main already tore the server down (bindProjectWatcher);
  // mirror it here so status() reads false and stale debounces go quiet.
  eventBus.on('project:opened', resetLocalState)
}

function scheduleRefresh() {
  if (!state.running) return
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runRefresh, REFRESH_DEBOUNCE_MS)
}

async function runRefresh() {
  if (!state.running || !projectState.current) return
  try {
    await window.grapestrap.preview.refresh(projectState.current)
  } catch (err) {
    // F6: a background refresh failing must not surface as a scary command
    // error — the previous export keeps serving; warn once, quietly.
    log.warn('preview refresh failed:', err?.message || err)
    eventBus.emit('toast', { type: 'warning', message: t('preview.refresh-failed') })
  }
}

function resetLocalState() {
  clearTimeout(debounceTimer)
  debounceTimer = null
  state.running = false
  state.url = null
  state.pageUrl = null
  state.port = null
  state.cacheDir = null
}

// Test/devtools handle — preview.spec.js reads status().cacheDir to assert
// the on-disk export stays pristine (pattern precedent: __gstrap.templates).
export const previewTestSurface = {
  status: () => ({ ...state }),
  refresh: () => runRefresh(),
  stop: async () => {
    await window.grapestrap.preview.stop()
    resetLocalState()
    return { ok: true }
  }
}
