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
import { resetLayout } from '../layout/golden-layout-config.js'
import { getCanvasHtml, getEditor } from '../editor/grapesjs-init.js'
import { showQuickTagDialog, formatComponentAsQuickTag } from '../dialogs/quick-tag.js'
import { showTextPrompt } from '../dialogs/text-prompt.js'
import { duplicateComponent, deleteComponent } from './component-actions.js'
import { log } from '../log.js'

// Pull the currently-displayed canvas html into the active page in projectState
// so that whatever's on screen is what gets persisted. Tab swaps already
// capture-on-switch; this covers the case where the user edits then saves
// without switching tabs first.
function flushActiveTabIntoProject() {
  if (!projectState.current) return
  const tab = pageState.active()
  if (!tab) return
  const page = projectState.getPage(tab.pageName)
  if (!page) return
  page.html = getCanvasHtml()
}

export function wireMenuActions() {
  window.grapestrap.menu.onAction(action => {
    log.debug('menu action', action)
    handleCommand(action)
  })

  // Toolbar/elsewhere also dispatch via this same path
  eventBus.on('command', cmd => handleCommand(cmd))
}

async function handleCommand(action) {
  try {
    return await dispatchCommand(action)
  } catch (err) {
    // The eventBus's own try/catch swallows handler exceptions, which is how
    // the cmdNewProject window.prompt failure went silent. Catch here, log,
    // toast — never silently eat a command error.
    log.error(`command "${action}" threw:`, err)
    eventBus.emit('toast', { type: 'error', message: `${action}: ${err?.message || err}` })
  }
}

async function dispatchCommand(action) {
  // Plugin-registered command? prefer that
  const command = pluginRegistry.commands.get(action)
  if (command) return command.handler()

  switch (action) {
    case 'file:new-project':   return cmdNewProject()
    case 'file:new-page':      return cmdNewPage()
    case 'file:open-project':  return cmdOpenProject()
    case 'file:save':          return cmdSave()
    case 'file:save-as':       return cmdSaveAs()
    case 'file:close-tab':     return cmdCloseTab()
    case 'file:export':        return cmdExport()

    case 'edit:undo':          return cmdUndo()
    case 'edit:redo':          return cmdRedo()
    case 'edit:duplicate':     return cmdDuplicate()
    case 'edit:delete':        return cmdDelete()
    case 'edit:quick-tag':     return cmdQuickTag()
    case 'edit:wrap-tag':      return cmdWrapTag()
    case 'edit:preferences':   return eventBus.emit('dialog:preferences')

    case 'view:mode-design':   return cmdViewMode('design')
    case 'view:mode-code':     return cmdViewMode('code')
    case 'view:mode-split':    return cmdViewMode('split')
    case 'view:device-desktop':return cmdDevice('Desktop')
    case 'view:device-tablet': return cmdDevice('Tablet')
    case 'view:device-mobile': return cmdDevice('Mobile')
    case 'view:reset-layout':  return resetLayout()
    case 'view:toggle-file-manager':
    case 'view:toggle-properties':
    case 'view:toggle-strip':
    case 'view:toggle-insert':
    case 'view:toggle-status':
    case 'view:toggle-dom-tree':
      return eventBus.emit(action)

    case 'help:about':         return eventBus.emit('dialog:about')
    case 'help:docs':          return window.grapestrap.shell.openExternal('https://grapestrap.org/docs')
    case 'help:github':        return window.grapestrap.shell.openExternal('https://github.com/grapestrap/grapestrap')
    case 'help:report-issue':  return window.grapestrap.shell.openExternal('https://github.com/grapestrap/grapestrap/issues/new/choose')
    case 'help:plugin-dev':    return window.grapestrap.shell.openExternal('https://grapestrap.org/docs/plugin-development')
    case 'help:shortcuts':     return eventBus.emit('dialog:shortcuts')

    default:
      log.warn(`unhandled command: ${action}`)
      eventBus.emit('toast', { type: 'warning', message: `Command "${action}" not yet wired in v0.0.1.` })
  }
}

// ─── Built-in command handlers ───────────────────────────────────────────────

async function cmdNewProject() {
  // window.prompt is blocked in modern Electron ("prompt() is and will not
  // be supported.") — it throws and the throw was being swallowed by the
  // eventBus try/catch, which is why New silently did nothing. Use our own
  // in-renderer prompt dialog instead.
  const name = await showTextPrompt({
    title: 'New project',
    label: 'Project name',
    initialValue: 'My Project',
    okLabel: 'Create…'
  })
  if (!name) return
  const project = await window.grapestrap.project.new({ name })
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

async function cmdNewPage() {
  if (!projectState.current) return eventBus.emit('toast', { type: 'warning', message: 'Open a project first.' })
  const name = await showTextPrompt({
    title: 'New page',
    label: 'Page name (no extension)',
    initialValue: 'about',
    placeholder: 'e.g. about',
    okLabel: 'Create'
  })
  if (!name) return
  const page = {
    name,
    file: `pages/${name}.html`,
    templateName: null,
    regions: {},
    head: { title: name, description: '' },
    html: `<main class="container py-5"><h1>${name}</h1></main>\n`
  }
  projectState.current.pages.push(page)
  projectState.markPageDirty(name)
  pageState.open(name)
  eventBus.emit('project:dirty-changed')
}

// User reported on nola1 2026-05-03 that toolbar Save / Code / Split
// silently did nothing on a fresh-launched editor with no project open.
// The early-return guards were correct (you can't save or switch view mode
// without a project) but the silent-no-op UX read as broken buttons. Every
// project-required command now toasts a warning explaining what to do.
const NO_PROJECT_MSG = 'Open or create a project first.'

async function cmdSave() {
  if (!projectState.current) {
    return eventBus.emit('toast', { type: 'warning', message: NO_PROJECT_MSG })
  }
  flushActiveTabIntoProject()
  const result = await window.grapestrap.project.save(projectState.current)
  if (result) {
    projectState.dirtyPages.clear()
    projectState.dirtyTemplates.clear()
    projectState.dirtyLibrary.clear()
    projectState.globalCssDirty = false
    eventBus.emit('project:saved', result)
    eventBus.emit('toast', { type: 'success', message: 'Saved.' })
  }
}

async function cmdSaveAs() {
  if (!projectState.current) {
    return eventBus.emit('toast', { type: 'warning', message: NO_PROJECT_MSG })
  }
  flushActiveTabIntoProject()
  const result = await window.grapestrap.project.saveAs(projectState.current)
  if (result) {
    eventBus.emit('project:saved', result)
    eventBus.emit('toast', { type: 'success', message: 'Saved as new file.' })
  }
}

async function cmdCloseTab() {
  const tab = pageState.active()
  if (tab) pageState.close(tab.pageName)
}

async function cmdExport() {
  if (!projectState.current) {
    return eventBus.emit('toast', { type: 'warning', message: NO_PROJECT_MSG })
  }
  flushActiveTabIntoProject()
  const result = await window.grapestrap.project.export(projectState.current)
  if (result) {
    eventBus.emit('toast', { type: 'success', message: `Exported ${result.pageCount} page(s) to ${result.outputDir}` })
  }
}

function cmdUndo() {
  const um = pluginRegistry.bound.editor?.UndoManager
  if (!um) return eventBus.emit('toast', { type: 'warning', message: NO_PROJECT_MSG })
  um.undo()
}
function cmdRedo() {
  const um = pluginRegistry.bound.editor?.UndoManager
  if (!um) return eventBus.emit('toast', { type: 'warning', message: NO_PROJECT_MSG })
  um.redo()
}

function cmdDuplicate() {
  const sel = getEditor()?.getSelected?.()
  if (!sel) return eventBus.emit('toast', { type: 'warning', message: 'Select an element first.' })
  if (!duplicateComponent(sel)) {
    eventBus.emit('toast', { type: 'warning', message: 'Cannot duplicate the page root.' })
  }
}
function cmdDelete() {
  const sel = getEditor()?.getSelected?.()
  if (!sel) return eventBus.emit('toast', { type: 'warning', message: 'Select an element first.' })
  if (!deleteComponent(sel)) {
    eventBus.emit('toast', { type: 'warning', message: 'Cannot delete the page root.' })
  }
}

async function cmdQuickTag() {
  const editor = getEditor()
  const sel = editor?.getSelected?.()
  if (!sel) return eventBus.emit('toast', { type: 'warning', message: 'Select an element first.' })
  const initialText = formatComponentAsQuickTag(sel)
  const parsed = await showQuickTagDialog({ initialText, mode: 'edit' })
  if (!parsed) return
  applyTagReplace(editor, sel, parsed)
}

async function cmdWrapTag() {
  const editor = getEditor()
  const sel = editor?.getSelected?.()
  if (!sel) return eventBus.emit('toast', { type: 'warning', message: 'Select an element first.' })
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

function cmdViewMode(mode) {
  const tab = pageState.active()
  if (!tab) {
    return eventBus.emit('toast', { type: 'warning', message: NO_PROJECT_MSG })
  }
  pageState.setViewMode(tab.pageName, mode)
}
function cmdDevice(device) {
  const tab = pageState.active()
  if (!tab) {
    return eventBus.emit('toast', { type: 'warning', message: NO_PROJECT_MSG })
  }
  pageState.setDevice(tab.pageName, device)
  pluginRegistry.bound.editor?.setDevice(device)
}
