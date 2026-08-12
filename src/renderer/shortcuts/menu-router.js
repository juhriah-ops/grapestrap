/**
 * GrapeStrap — Menu action router
 *
 * Bridges native menu actions (sent from main via `menu:action` IPC) into the
 * renderer's command bus. Plugins listen on the same event bus, so menu items
 * registered by plugins get wired automatically.
 *
 * Built-in command handlers for v0.0.1 are sparse — we route to handlers that
 * mostly emit events for other modules to handle. v0.0.2 wires the full set.
 */

import { eventBus } from '../state/event-bus.js'
import { pluginRegistry } from '../plugin-host/registry.js'
import { projectState } from '../state/project-state.js'
import { pageState } from '../state/page-state.js'
import {
  resetToDefaultLayout, applyWorkspaceByName, saveWorkspaceAs, openWorkspaceManager
} from '../layout/workspaces.js'
import { getCanvasHtml, getEditor } from '../editor/grapesjs-init.js'
import { rebuildCanvasFromCode } from '../editor/canvas-sync.js'
import { showQuickTagDialog, formatComponentAsQuickTag } from '../dialogs/quick-tag.js'
import { showNewPageDialog } from '../dialogs/new-page.js'
import { showNewProjectDialog } from '../dialogs/new-project.js'
import { duplicateComponent, deleteComponent } from './component-actions.js'
import { propagateLibraryItem } from '../panels/library-items/propagate.js'
import { createPage, createPageFromLayout, validateNewName } from '../panels/templates/manage.js'
import { propagateTemplate, templateRegionsMeta, refreshPageRegionsSnapshot } from '../panels/templates/propagate.js'
import { openPagePropertiesDialog } from '../dialogs/page-properties.js'
import { openProjectSettingsDialog } from '../dialogs/project-settings.js'
import { openFindInProjectDialog } from '../dialogs/find-in-project.js'
import { getMonacoPair } from '../panels/canvas/index.js'
import { getFileEditor } from '../editor/file-tabs.js'
import { getFocusedMonacoEditor } from '../editor/monaco-init.js'
import { cmdPreviewBrowser } from '../preview.js'
import { t } from '../i18n.js'
import { log } from '../log.js'

// Pull the currently-displayed canvas html into the active tab's source-of-
// truth in projectState (page html or library item html) so that whatever's
// on screen is what gets persisted. Tab swaps already capture-on-switch; this
// covers the case where the user edits then saves without switching tabs first.
// Exported: preview.js reuses cmdExport's exact flush-then-export contract.
export function flushActiveTabIntoProject() {
  if (!projectState.current) return
  const tab = pageState.active()
  if (!tab) return
  // File tabs (Wave 4) never round-trip through the canvas: their buffer is
  // their own Monaco model, flushed to disk by editor/file-tabs.js on
  // project:saved. Bail BEFORE the code-view rebuild below — a file tab is
  // always viewMode 'code', and rebuildCanvasFromCode() here would resurrect
  // the html Monaco's stale page content into the hidden canvas.
  if (tab.kind === 'file') return
  // If the user is editing in Code view (or split view, where code may have
  // last focus), the canvas component tree is stale — Monaco edits don't
  // propagate to GrapesJS until view-mode switch back to design. Rebuild now
  // so getCanvasHtml() returns what the user actually sees in Code.
  if (tab.viewMode === 'code' || tab.viewMode === 'split') {
    rebuildCanvasFromCode()
  }
  const captured = getCanvasHtml()
  if (tab.kind === 'library') {
    const item = projectState.current.libraryItems?.find(it => it.id === tab.pageName)
    if (!item) return
    if (item.html !== captured) {
      item.html = captured
      // Save also propagates: an item edited and immediately saved (no tab
      // swap) still fans out to all pages.
      propagateLibraryItem(item.id, captured)
    }
    return
  }
  if (tab.kind === 'template') {
    const tpl = projectState.getTemplate(tab.pageName)
    if (!tpl) return
    if (tpl.html !== captured) {
      tpl.html = captured
      tpl.regions = templateRegionsMeta(captured)
      // Save also propagates (same contract as library items).
      propagateTemplate(tpl.name, captured)
    }
    return
  }
  const page = projectState.getPage(tab.pageName)
  if (!page) return
  page.html = captured
  // Templated pages keep their manifest regions{} snapshot fresh at save.
  refreshPageRegionsSnapshot(page)
}

export function wireMenuActions() {
  // Args-transport fix (Wave 3): menus.js has sent per-item args since
  // v0.0.1 (`insert:focus-tab <tab>`, now `workspace:apply <name>`) and
  // preload's subscribe forwards them — but this handler used to drop them,
  // so arg-carrying menu items silently did nothing. Thread them through.
  // (Wiring insert:focus-tab itself is a follow-up, not Wave-3 scope.)
  window.grapestrap.menu.onAction((action, ...args) => {
    log.debug('menu action', action, args)
    handleCommand(action, args)
  })

  // Toolbar/elsewhere also dispatch via this same path
  eventBus.on('command', cmd => handleCommand(cmd))
}

async function handleCommand(action, args = []) {
  try {
    return await dispatchCommand(action, args)
  } catch (err) {
    // The eventBus's own try/catch swallows handler exceptions, which is how
    // the cmdNewProject window.prompt failure went silent. Catch here, log,
    // toast — never silently eat a command error.
    log.error(`command "${action}" threw:`, err)
    eventBus.emit('toast', { type: 'error', message: t('toast.command-failed', { action, error: err?.message || err }) })
  }
}

async function dispatchCommand(action, args = []) {
  // Plugin-registered command? prefer that
  const command = pluginRegistry.commands.get(action)
  if (command) return command.handler()

  switch (action) {
    case 'file:new-project':   return cmdNewProject()
    case 'file:new-page':      return cmdNewPage()
    case 'file:open-project':  return cmdOpenProject()
    case 'file:import-folder': return cmdImportFolder()
    case 'file:page-properties': return openPagePropertiesDialog()
    case 'file:project-settings': return openProjectSettingsDialog()
    case 'file:save':          return cmdSave()
    case 'file:save-as':       return cmdSaveAs()
    case 'file:refresh':       return cmdRefresh()
    case 'file:close-tab':     return cmdCloseTab()
    case 'file:export':        return cmdExport()

    case 'edit:undo':          return cmdUndo()
    case 'edit:redo':          return cmdRedo()
    case 'edit:duplicate':     return cmdDuplicate()
    case 'edit:delete':        return cmdDelete()
    case 'edit:quick-tag':     return cmdQuickTag()
    case 'edit:wrap-tag':      return cmdWrapTag()
    case 'edit:preferences':   return eventBus.emit('dialog:preferences')
    case 'edit:find':          return cmdFind(false)
    case 'edit:replace':       return cmdFind(true)
    case 'edit:find-in-project': return openFindInProjectDialog()

    case 'view:mode-design':   return cmdViewMode('design')
    case 'view:mode-code':     return cmdViewMode('code')
    case 'view:mode-split':    return cmdViewMode('split')
    case 'view:device-desktop':return cmdDevice('Desktop')
    case 'view:device-tablet': return cmdDevice('Tablet')
    case 'view:device-mobile': return cmdDevice('Mobile')
    case 'view:reset-layout':  return resetToDefaultLayout()
    case 'view:preview-browser': return cmdPreviewBrowser()

    // Workspace layouts (Wave 3). apply carries the layout name as a menu
    // action arg; e2e drives the same paths via __gstrap.workspaces.
    case 'workspace:apply':    return applyWorkspaceByName(args[0])
    case 'workspace:save-as':  return saveWorkspaceAs()
    case 'workspace:manage':   return openWorkspaceManager()

    case 'view:toggle-file-manager':
    case 'view:toggle-properties':
    case 'view:toggle-strip':
    case 'view:toggle-insert':
    case 'view:toggle-status':
    case 'view:toggle-dom-tree':
    case 'view:toggle-linked-files':
    case 'view:toggle-breakpoints':
    case 'view:toggle-custom-css':
      return eventBus.emit(action)

    // Insert menu items focus the matching Insert-panel tab. If the panel
    // strip is hidden (View → Toggle Insert), un-hide it through the normal
    // toggle path first so visibility prefs stay consistent — focusing a tab
    // in a hidden panel would otherwise be a silent no-op.
    case 'insert:focus-tab': {
      const host = document.getElementById('gstrap-insert')
      if (host?.hidden) eventBus.emit('view:toggle-insert')
      return eventBus.emit('insert:focus-tab', args[0])
    }

    case 'help:about':         return eventBus.emit('dialog:about')
    case 'help:docs':          return window.grapestrap.shell.openExternal('https://github.com/juhriah-ops/grapestrap/tree/main/docs')
    case 'help:github':        return window.grapestrap.shell.openExternal('https://github.com/juhriah-ops/grapestrap')
    case 'help:report-issue':  return window.grapestrap.shell.openExternal('https://github.com/juhriah-ops/grapestrap/issues/new/choose')
    case 'help:plugin-dev':    return window.grapestrap.shell.openExternal('https://github.com/juhriah-ops/grapestrap/blob/main/docs/PLUGIN-DEVELOPMENT.md')
    case 'help:shortcuts':     return eventBus.emit('dialog:shortcuts')

    default:
      log.warn(`unhandled command: ${action}`)
      eventBus.emit('toast', { type: 'warning', message: t('toast.command-not-wired', { cmd: action }) })
  }
}

// ─── Built-in command handlers ───────────────────────────────────────────────

async function cmdNewProject() {
  // Starter list is cosmetic — if the IPC fails the dialog degrades to a
  // Blank-only select rather than blocking project creation (Wave 4, F5).
  const starters = await window.grapestrap.project.starters().catch(() => [])
  const result = await showNewProjectDialog({ starters })
  if (!result) return
  const project = await window.grapestrap.project.new({
    name: result.name, templateId: result.templateId, selectedPages: result.selectedPages
  })
  if (project) {
    projectState.set(project)
    if (project.pages?.[0]) pageState.open(project.pages[0].name)
    await window.grapestrap.project.addRecent(project.manifestPath, project.manifest.metadata.name)
  }
}

async function cmdOpenProject() {
  const project = await window.grapestrap.project.open()
  if (project) {
    projectState.set(project)
    if (project.pages?.[0]) pageState.open(project.pages[0].name)
    await window.grapestrap.project.addRecent(project.manifestPath, project.manifest.metadata.name)
  }
}

async function cmdImportFolder() {
  // Two dialogs: source folder picker, then "save manifest as…" target.
  // The main-side handler chains them when the renderer doesn't pre-supply
  // either path. Returns a fully-loaded project on success.
  const project = await window.grapestrap.project.importDir()
  if (project) {
    projectState.set(project)
    if (project.pages?.[0]) pageState.open(project.pages[0].name)
    await window.grapestrap.project.addRecent(project.manifestPath, project.manifest.metadata.name)
    eventBus.emit('toast', {
      type: 'success',
      message: t('toast.import-success', {
        count: project.pages.length,
        source: project.manifest.metadata.importedFrom || 'folder'
      })
    })
  }
}

async function cmdNewPage() {
  if (!projectState.current) return eventBus.emit('toast', { type: 'warning', message: t('toast.open-project-first') })
  // Starter-aware select: a project created from a multi-page starter (its id
  // lives at manifest.metadata.starter — absent on blank/imported projects)
  // gets grouped layout/template options instead of the flat template list.
  // Best-effort lookup — an IPC failure or a stale/removed starter id just
  // degrades to the flat markup (same fail-open posture as cmdNewProject's
  // starter list).
  const starterId = projectState.current.manifest?.metadata?.starter
  let starter = null
  if (starterId) {
    const starters = await window.grapestrap.project.starters().catch(() => [])
    starter = starters.find(s => s.id === starterId) || null
  }
  // Dialog validates inline (duplicate names — Wave 0 bug #6 — and unsafe
  // charsets); page creation/composition lives in templates/manage.js so the
  // dialog stays a dumb collector.
  const result = await showNewPageDialog({
    templates: projectState.current.templates || [],
    starter,
    validateName: validateNewName
  })
  if (!result) return
  const { name, source } = result
  if (source.kind === 'blank') return createPage(name)
  if (source.kind === 'template') return createPage(name, source.templateName)
  // source.kind === 'starter-layout'
  const layout = await window.grapestrap.project.starterPage(starterId, source.pageName)
  if (!layout) {
    return eventBus.emit('toast', { type: 'error', message: t('toast.starter-layout-failed') })
  }
  createPageFromLayout(name, layout)
}

// User reported on nola1 2026-05-03 that toolbar Save / Code / Split
// silently did nothing on a fresh-launched editor with no project open.
// The early-return guards were correct (you can't save or switch view mode
// without a project) but the silent-no-op UX read as broken buttons. Every
// project-required command now toasts a warning explaining what to do.
// (Wave 4 sweep: the message itself moved to the catalog as toast.no-project;
// resolve at emit time so a late locale switch reaches later toasts.)
export const noProjectMsg = () => t('toast.no-project')

async function cmdSave() {
  if (!projectState.current) {
    return eventBus.emit('toast', { type: 'warning', message: noProjectMsg() })
  }
  flushActiveTabIntoProject()
  const result = await window.grapestrap.project.save(projectState.current)
  if (result) {
    projectState.markAllClean()
    eventBus.emit('project:saved', result)
    // Wave 1 i18n demo conversion — the ONE end-to-end t() proof. The
    // retroactive sweep over every literal is deliberately Wave 4.
    eventBus.emit('toast', { type: 'success', message: t('toast.saved') })
  }
}

// Refresh: belt-and-suspenders save + canvas resync. Use this when you've
// dragged files into assets/ from outside the app, edited Custom CSS in
// the panel, or just want a single button that flushes everything to disk
// AND forces every panel + the canvas iframe to re-read its source state.
// Reported on nola1 2026-05-04 as "a refresh ability to make sure all
// assets actually save."
async function cmdRefresh() {
  if (!projectState.current) {
    return eventBus.emit('toast', { type: 'warning', message: noProjectMsg() })
  }
  flushActiveTabIntoProject()
  const result = await window.grapestrap.project.save(projectState.current)
  if (result) {
    projectState.markAllClean()
    eventBus.emit('project:saved', result)
  }
  // Re-sync everything that subscribes to these channels: globalCSS into
  // canvas iframe, base href, asset list, library wrappers, breakpoint
  // strip's responsive chips. Also call GrapesJS refresh() so rulers /
  // selection overlays catch any mid-flight layout changes.
  eventBus.emit('project:css-changed')
  eventBus.emit('assets:changed')
  eventBus.emit('library:changed')
  try {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    ed?.refresh?.()
  } catch { /* GrapesJS not ready */ }
  eventBus.emit('toast', { type: 'success', message: t('toast.refreshed') })
}

async function cmdSaveAs() {
  if (!projectState.current) {
    return eventBus.emit('toast', { type: 'warning', message: noProjectMsg() })
  }
  flushActiveTabIntoProject()
  const result = await window.grapestrap.project.saveAs(projectState.current)
  if (result) {
    eventBus.emit('project:saved', result)
    eventBus.emit('toast', { type: 'success', message: t('toast.saved-as') })
  }
}

async function cmdCloseTab() {
  const tab = pageState.active()
  if (tab) pageState.close(tab.pageName)
}

async function cmdExport() {
  if (!projectState.current) {
    return eventBus.emit('toast', { type: 'warning', message: noProjectMsg() })
  }
  flushActiveTabIntoProject()
  const result = await window.grapestrap.project.export(projectState.current)
  if (result) {
    eventBus.emit('toast', { type: 'success', message: t('toast.export-success', { count: result.pageCount, dir: result.outputDir }) })
  }
}

// Undo/redo route to WHERE THE USER IS EDITING. The renderer Ctrl+Z
// keybinding captures the key before Monaco's own handler ever sees it, so
// until this check existed, undo while typing in a code editor rewound the
// CANVAS undo stack instead of the code — the nola1 "Ctrl+Z doesn't work in
// code view / feels inconsistent" report. Focused Monaco → model undo;
// otherwise the GrapesJS component UndoManager (design view).
function cmdUndo() {
  const focused = getFocusedMonacoEditor()
  if (focused) return focused.trigger('gstrap', 'undo', {})
  const um = pluginRegistry.bound.editor?.UndoManager
  if (!um) return eventBus.emit('toast', { type: 'warning', message: noProjectMsg() })
  um.undo()
}
function cmdRedo() {
  const focused = getFocusedMonacoEditor()
  if (focused) return focused.trigger('gstrap', 'redo', {})
  const um = pluginRegistry.bound.editor?.UndoManager
  if (!um) return eventBus.emit('toast', { type: 'warning', message: noProjectMsg() })
  um.redo()
}

function cmdDuplicate() {
  const sel = getEditor()?.getSelected?.()
  if (!sel) return eventBus.emit('toast', { type: 'warning', message: t('toast.select-element') })
  if (!duplicateComponent(sel)) {
    eventBus.emit('toast', { type: 'warning', message: t('toast.cannot-duplicate') })
  }
}
function cmdDelete() {
  const sel = getEditor()?.getSelected?.()
  if (!sel) return eventBus.emit('toast', { type: 'warning', message: t('toast.select-element') })
  if (!deleteComponent(sel)) {
    eventBus.emit('toast', { type: 'warning', message: t('toast.cannot-delete') })
  }
}

async function cmdQuickTag() {
  const editor = getEditor()
  const sel = editor?.getSelected?.()
  if (!sel) return eventBus.emit('toast', { type: 'warning', message: t('toast.select-element') })
  const initialText = formatComponentAsQuickTag(sel)
  const parsed = await showQuickTagDialog({ initialText, mode: 'edit' })
  if (!parsed) return
  applyTagReplace(editor, sel, parsed)
}

async function cmdWrapTag() {
  const editor = getEditor()
  const sel = editor?.getSelected?.()
  if (!sel) return eventBus.emit('toast', { type: 'warning', message: t('toast.select-element') })
  const parsed = await showQuickTagDialog({ initialText: '<div>', mode: 'wrap' })
  if (!parsed) return
  applyTagWrap(editor, sel, parsed)
}

function applyTagReplace(editor, component, { tag, attrs }) {
  const innerHTML = component.getInnerHTML?.() || ''
  const newHtml = `<${tag}${attrsToHtml(attrs)}>${innerHTML}</${tag}>`
  const replaced = component.replaceWith(newHtml)
  selectFirst(editor, replaced)
  eventBus.emit('canvas:content-changed')
}

function applyTagWrap(editor, component, { tag, attrs }) {
  // toHTML() gives the full outer markup so we wrap the element and its children.
  const outerHTML = component.toHTML?.() || ''
  const newHtml = `<${tag}${attrsToHtml(attrs)}>${outerHTML}</${tag}>`
  const replaced = component.replaceWith(newHtml)
  selectFirst(editor, replaced)
  eventBus.emit('canvas:content-changed')
}

function attrsToHtml(attrs) {
  const parts = []
  for (const [k, v] of Object.entries(attrs)) {
    if (v === '') parts.push(k)
    else parts.push(`${k}="${escAttr(String(v))}"`)
  }
  return parts.length ? ' ' + parts.join(' ') : ''
}

function escAttr(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

// component.replaceWith may return the new component, an array, or undefined
// depending on the GrapesJS version. Normalize.
function selectFirst(editor, replaced) {
  const next = Array.isArray(replaced) ? replaced[0] : replaced
  if (next && typeof editor.select === 'function') editor.select(next)
}

// Edit → Find / Replace. The native-menu accelerators (Ctrl+F / Ctrl+H)
// swallow those keys app-wide — before this was wired, Monaco's built-in
// find widget could never open. Route the action back INTO a Monaco editor:
// whichever one holds the caret (page pair, Custom CSS panel, file tab), so
// Ctrl+F in the Custom CSS panel searches THAT stylesheet. With no editor
// focused, fall back to the active tab's code editor; Design view has no
// visible code pane, so switch to Split first (canvas stays, code pane
// appears — least surprising place to land).
async function cmdFind(replace) {
  const tab = pageState.active()
  if (!tab) {
    return eventBus.emit('toast', { type: 'warning', message: noProjectMsg() })
  }
  let target = getFocusedMonacoEditor()
  if (!target && tab.kind === 'file') {
    target = getFileEditor()
  } else if (!target) {
    if (tab.viewMode === 'design') pageState.setViewMode(tab.pageName, 'split')
    target = getMonacoPair()?.htmlEditor
  }
  if (!target) {
    return eventBus.emit('toast', { type: 'warning', message: noProjectMsg() })
  }
  // Double-rAF: after a design→split switch the code pane needs a layout
  // pass before Monaco can position the find widget.
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  target.focus()
  const actionId = replace ? 'editor.action.startFindReplaceAction' : 'actions.find'
  target.getAction(actionId)?.run()
}

function cmdViewMode(mode) {
  const tab = pageState.active()
  if (!tab) {
    return eventBus.emit('toast', { type: 'warning', message: noProjectMsg() })
  }
  pageState.setViewMode(tab.pageName, mode)
}
function cmdDevice(device) {
  const tab = pageState.active()
  if (!tab) {
    return eventBus.emit('toast', { type: 'warning', message: noProjectMsg() })
  }
  pageState.setDevice(tab.pageName, device)
  pluginRegistry.bound.editor?.setDevice(device)
}
