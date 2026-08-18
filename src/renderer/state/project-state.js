/**
 * GrapeStrap — Project state
 *
 * The currently open project. One project per window in v0.x (multi-project may
 * come later via separate windows; not via tabs).
 *
 * Holds the project as returned by main process loadProject() — manifest +
 * pages[] + templates[] + libraryItems[] + globalCSS + bootstrapCSS — all in
 * memory. Edits mutate this in place; saveProject() pushes back to disk via IPC.
 *
 * The dirty flag is per-page and per-template (and one each for globalCSS and
 * the project's Bootstrap sheet) since the UI shows dot indicators per file. A
 * project is "dirty" if any sub-item is.
 */

import { eventBus } from './event-bus.js'
import { pageState } from './page-state.js'

class ProjectState {
  constructor() {
    this.current = null
    this.dirtyPages = new Set()
    this.dirtyTemplates = new Set()
    this.dirtyLibrary = new Set()
    this.dirtySnippets = new Set()
    this.globalCssDirty = false
    // The project's own site/assets/css/bootstrap.css buffer (Bootstrap panel).
    // Separate from globalCssDirty because they are different files with
    // different writers, even though both save on the same Ctrl+S.
    this.bootstrapCssDirty = false
    this.manifestDirty = false  // metadata changes (favicon, etc.)
  }

  // Opening over an already-open project is a real switch: tear the old one
  // down first. Without this, the outgoing project's tabs survived — and
  // since most projects name their first page "index", pageState.open() on
  // the new project re-focused the STALE tab, swapToTab's same-name guard
  // skipped the canvas load (old project kept showing), and the next tab
  // switch captured the old canvas into the NEW project's same-named page.
  // Reported on nola1 2026-08-06: "opened another project — Custom CSS
  // updated but design view is still the last project".
  set(project) {
    if (this.current) this.clear()
    this.current = project
    this.dirtyPages.clear()
    this.dirtyTemplates.clear()
    this.dirtyLibrary.clear()
    this.dirtySnippets.clear()
    this.globalCssDirty = false
    this.bootstrapCssDirty = false
    this.manifestDirty = false
    eventBus.emit('project:opened', project)
  }

  clear() {
    const had = !!this.current
    // Close tabs BEFORE dropping current: each close's capture-on-switch
    // writes into the outgoing project's objects (then discarded with it),
    // never into the incoming one. project:closed after teardown blanks the
    // canvas and disposes file-tab Monaco models (editor/file-tabs.js) —
    // models are keyed by site-relative path, so they'd otherwise resurface
    // verbatim in the next project's same-named files.
    pageState.closeAll()
    this.current = null
    this.dirtyPages.clear()
    this.dirtyTemplates.clear()
    this.dirtyLibrary.clear()
    this.dirtySnippets.clear()
    this.globalCssDirty = false
    this.bootstrapCssDirty = false
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
  markBootstrapCssDirty() { this.bootstrapCssDirty = true;  eventBus.emit('project:dirty-changed', this.snapshot()) }
  markBootstrapCssClean() { this.bootstrapCssDirty = false; eventBus.emit('project:dirty-changed', this.snapshot()) }
  markManifestDirty()     { this.manifestDirty = true;     eventBus.emit('project:dirty-changed', this.snapshot()) }
  markManifestClean()     { this.manifestDirty = false;    eventBus.emit('project:dirty-changed', this.snapshot()) }

  // Post-save reset. The save commands used to clear the six dirty fields
  // directly, which skipped 'project:dirty-changed' — file-manager dots, tab
  // markers, and the status bar all kept showing dirty until the next edit.
  // Same bypass class as the snippets/library audit gap above: mutate through
  // the methods so subscribers hear about it.
  markAllClean() {
    this.dirtyPages.clear()
    this.dirtyTemplates.clear()
    this.dirtyLibrary.clear()
    this.dirtySnippets.clear()
    this.globalCssDirty = false
    this.bootstrapCssDirty = false
    this.manifestDirty = false
    eventBus.emit('project:dirty-changed', this.snapshot())
  }

  isDirty() {
    return this.dirtyPages.size > 0 ||
           this.dirtyTemplates.size > 0 ||
           this.dirtyLibrary.size > 0 ||
           this.dirtySnippets.size > 0 ||
           this.globalCssDirty ||
           this.bootstrapCssDirty ||
           this.manifestDirty
  }

  snapshot() {
    return {
      pages: [...this.dirtyPages],
      templates: [...this.dirtyTemplates],
      library: [...this.dirtyLibrary],
      snippets: [...this.dirtySnippets],
      globalCss: this.globalCssDirty,
      // Reported for the status bar / file-manager dots. Crash recovery
      // deliberately does NOT restore from this flag — the Bootstrap buffer
      // is excluded from snapshots (see state/recovery.js).
      bootstrapCss: this.bootstrapCssDirty,
      manifest: this.manifestDirty,
      any: this.isDirty()
    }
  }

  getPage(name)      { return this.current?.pages.find(p => p.name === name) }
  getTemplate(name)  { return this.current?.templates?.find(t => t.name === name) }
  getLibraryItem(id) { return this.current?.libraryItems?.find(l => l.id === id) }
}

export const projectState = new ProjectState()
