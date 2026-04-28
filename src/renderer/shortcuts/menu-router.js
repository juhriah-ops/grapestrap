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
    case 'edit:duplicate':     return eventBus.emit('canvas:duplicate-selected')
    case 'edit:delete':        return eventBus.emit('canvas:delete-selected')
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
  const name = window.prompt('Project name?', 'My Project') || 'Untitled'
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
  const name = window.prompt('Page name?', 'about')
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

async function cmdSave() {
  if (!projectState.current) return
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
  if (!projectState.current) return
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
  if (!projectState.current) return
  flushActiveTabIntoProject()
  const result = await window.grapestrap.project.export(projectState.current)
  if (result) {
    eventBus.emit('toast', { type: 'success', message: `Exported ${result.pageCount} page(s) to ${result.outputDir}` })
  }
}

function cmdUndo() {
  pluginRegistry.bound.editor?.UndoManager?.undo()
}
function cmdRedo() {
  pluginRegistry.bound.editor?.UndoManager?.redo()
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
  if (tab) pageState.setViewMode(tab.pageName, mode)
}
function cmdDevice(device) {
  const tab = pageState.active()
  if (tab) pageState.setDevice(tab.pageName, device)
  pluginRegistry.bound.editor?.setDevice(device)
}
