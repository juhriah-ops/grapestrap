/**
 * GrapeStrap — Project state
 *
 * The currently open project. One project per window in v0.x (multi-project may
 * come later via separate windows; not via tabs).
 *
 * Holds the project as returned by main process loadProject() — manifest +
 * pages[] + templates[] + libraryItems[] + globalCSS — all in memory. Edits
 * mutate this in place; saveProject() pushes back to disk via IPC.
 *
 * The dirty flag is per-page and per-template (and one for globalCSS) since the
 * UI shows dot indicators per file. A project is "dirty" if any sub-item is.
 */

import { eventBus } from './event-bus.js'

class ProjectState {
  constructor() {
    this.current = null
    this.dirtyPages = new Set()
    this.dirtyTemplates = new Set()
    this.dirtyLibrary = new Set()
    this.dirtySnippets = new Set()
    this.globalCssDirty = false
    this.manifestDirty = false  // metadata changes (favicon, etc.)
  }

  set(project) {
    this.current = project
    this.dirtyPages.clear()
    this.dirtyTemplates.clear()
    this.dirtyLibrary.clear()
    this.dirtySnippets.clear()
    this.globalCssDirty = false
    this.manifestDirty = false
    eventBus.emit('project:opened', project)
  }

  clear() {
    const had = !!this.current
    this.current = null
    this.dirtyPages.clear()
    this.dirtyTemplates.clear()
    this.dirtyLibrary.clear()
    this.dirtySnippets.clear()
    this.globalCssDirty = false
    this.manifestDirty = false
    if (had) eventBus.emit('project:closed')
  }

  markPageDirty(name)     { this.dirtyPages.add(name);     eventBus.emit('project:dirty-changed', this.snapshot()) }
  markPageClean(name)     { this.dirtyPages.delete(name);  eventBus.emit('project:dirty-changed', this.snapshot()) }
  markTemplateDirty(name) { this.dirtyTemplates.add(name); eventBus.emit('project:dirty-changed', this.snapshot()) }
  markTemplateClean(name) { this.dirtyTemplates.delete(name); eventBus.emit('project:dirty-changed', this.snapshot()) }
  markLibraryDirty(id)    { this.dirtyLibrary.add(id);     eventBus.emit('project:dirty-changed', this.snapshot()) }
  markLibraryClean(id)    { this.dirtyLibrary.delete(id);  eventBus.emit('project:dirty-changed', this.snapshot()) }
  // Snippets: add/remove/rename all dirty the whole snippet collection. We
  // track by id so the dirty-state view can show "3 snippets dirty" if/when
  // the status bar needs that granularity. Audit-found gap: snippets/index.js
  // and library-items/index.js cmdDelete were mutating the project without
  // touching any dirty set, so isDirty() lied and a future close-warn would
  // lose data.
  markSnippetsDirty(id)   { this.dirtySnippets.add(id || '*'); eventBus.emit('project:dirty-changed', this.snapshot()) }
  markSnippetsClean()     { this.dirtySnippets.clear();        eventBus.emit('project:dirty-changed', this.snapshot()) }
  markCssDirty()          { this.globalCssDirty = true;    eventBus.emit('project:dirty-changed', this.snapshot()) }
  markCssClean()          { this.globalCssDirty = false;   eventBus.emit('project:dirty-changed', this.snapshot()) }
  markManifestDirty()     { this.manifestDirty = true;     eventBus.emit('project:dirty-changed', this.snapshot()) }
  markManifestClean()     { this.manifestDirty = false;    eventBus.emit('project:dirty-changed', this.snapshot()) }

  isDirty() {
    return this.dirtyPages.size > 0 ||
           this.dirtyTemplates.size > 0 ||
           this.dirtyLibrary.size > 0 ||
           this.dirtySnippets.size > 0 ||
           this.globalCssDirty ||
           this.manifestDirty
  }

  snapshot() {
    return {
      pages: [...this.dirtyPages],
      templates: [...this.dirtyTemplates],
      library: [...this.dirtyLibrary],
      snippets: [...this.dirtySnippets],
      globalCss: this.globalCssDirty,
      manifest: this.manifestDirty,
      any: this.isDirty()
    }
  }

  getPage(name)      { return this.current?.pages.find(p => p.name === name) }
  getTemplate(name)  { return this.current?.templates?.find(t => t.name === name) }
  getLibraryItem(id) { return this.current?.libraryItems?.find(l => l.id === id) }
}

export const projectState = new ProjectState()
