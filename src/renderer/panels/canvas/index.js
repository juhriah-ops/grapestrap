/**
 * GrapeStrap — Canvas panel
 *
 * PATH: src/renderer/panels/canvas/index.js
 * ROLE: Hosts GrapesJS in design view and Monaco in code view; toggles between
 *       them (or splits) based on the active tab's view mode. The canvas-sync
 *       module handles the actual content sync between them per the locked
 *       policy.
 * DEPENDS: editor/grapesjs-init.js, editor/monaco-init.js, editor/canvas-sync.js,
 *          editor/file-tabs.js, state/project-state.js, state/page-state.js,
 *          state/event-bus.js
 * CREATED: 2026-05-02 (breadcrumb header added with the Wave 3 rewrite)
 *
 * Wave 3 idempotency contract: GL's loadLayout (workspace apply, Reset Layout)
 * tears down every ComponentItem and re-invokes this factory. GrapesJS and the
 * Monaco pair are built exactly ONCE, ever, inside a module-held persistent
 * subtree that re-runs simply re-parent into the fresh GL host. The canvas
 * iframe reloads on re-parent — the existing maximize/restore path already
 * handles that: GL 'stateChanged' → rAF-coalesced 'canvas:gl-state-changed' →
 * grapesjs-init re-injects base href + framework links + globalCSS. Event
 * subscriptions are wire-once (the wireLibraryLock house pattern) and read
 * module state, never a render-scoped host.
 *
 * UPDATED: 2026-08-11 — Workstream A chunk A5: swapToTab now rebuilds the
 * OUTGOING tab's canvas from Monaco before capturing it, when that tab was
 * left in Code or Split view (mirrors flushActiveTabIntoProject's
 * save-time rule in menu-router.js). See swapToTab's own comment for why the
 * outgoing tab is looked up via pageState.tabs/currentTabName rather than
 * pageState.active().
 */

import { initGrapesJS, loadHtmlIntoCanvas, getCanvasHtml, getEditor } from '../../editor/grapesjs-init.js'
import { createMonacoPair, bindMonacoToRegistry, relayoutAllMonaco } from '../../editor/monaco-init.js'
import {
  bindSync, onViewModeChange, rebuildCanvasFromCode, resumeCanvasToCodeSync,
  isRebuildingFromCode, requestCodeHistoryReset
} from '../../editor/canvas-sync.js'
import { stampUserEdit, resetTabOrigin, resetAllOrigins } from '../../editor/edit-origin.js'
import { mountFileTabHost, activateFileTab, isFileTab } from '../../editor/file-tabs.js'
import { projectState } from '../../state/project-state.js'
import { pageState } from '../../state/page-state.js'
import { eventBus } from '../../state/event-bus.js'
import { propagateLibraryItem } from '../library-items/propagate.js'
import { propagateTemplate, templateRegionsMeta } from '../templates/propagate.js'

let monacoPair = null

/** Menu-router Find/Replace needs the html editor to run Monaco actions on. */
export function getMonacoPair() {
  return monacoPair
}

// Living editor DOM (design slot + code slots), built on the first factory
// run and re-parented on every subsequent one. Never rebuilt: rebuilding
// would create a second GrapesJS editor + orphaned Monaco pair (the pre-fix
// Reset Layout bug — see PLAN.md §1 in the Wave 3 artifacts).
let persistentRoot = null
let eventsWired = false

// Current split state. The is-split class lives on the GL host (pinned by
// code-view.spec.js), which loadLayout rebuilds — so re-attach re-asserts it
// from here instead of losing an active split view on workspace apply.
let splitActive = false

// The canvas tracks which tab (page or library item) it's currently
// displaying so that on tab swap we can capture the outgoing content back
// into projectState before loading the incoming one. `loadingTabName` is
// set during a programmatic setComponents() call so the resulting
// component:add storm doesn't get misread as a user edit and dirty-flag.
let currentTabName = null
let currentTabKind = null
let loadingTabName = null

export function renderCanvas(host) {
  host.classList.add('gstrap-canvas-host')

  if (persistentRoot) {
    // GL re-invoked us (loadLayout / Reset Layout): re-parent the living
    // editor subtree. The iframe resync arrives free via the stateChanged →
    // canvas:gl-state-changed chain; Monaco/GrapesJS re-measure on the next
    // frame once the new geometry has settled.
    host.appendChild(persistentRoot)
    host.classList.toggle('is-split', splitActive)
    scheduleReattachRelayout()
    return
  }

  persistentRoot = document.createElement('div')
  persistentRoot.className = 'gstrap-persistent-root'
  persistentRoot.innerHTML = `
    <div class="gstrap-canvas-design" data-region="canvas-design"></div>
    <div class="gstrap-canvas-code"   data-region="canvas-code" hidden>
      <div class="gstrap-monaco-host" data-region="monaco-html"></div>
      <div class="gstrap-monaco-host" data-region="monaco-css" hidden></div>
      <div class="gstrap-monaco-host" data-region="monaco-file" hidden></div>
    </div>
  `
  host.appendChild(persistentRoot)
  const designSlot = persistentRoot.querySelector('[data-region="canvas-design"]')
  const htmlSlot   = persistentRoot.querySelector('[data-region="monaco-html"]')
  const cssSlot    = persistentRoot.querySelector('[data-region="monaco-css"]')
  const fileSlot   = persistentRoot.querySelector('[data-region="monaco-file"]')

  initGrapesJS(designSlot)
  monacoPair = createMonacoPair(htmlSlot, cssSlot)
  bindMonacoToRegistry()
  bindSync({ htmlMonaco: monacoPair.htmlEditor, cssMonaco: monacoPair.cssEditor })
  // File-tab lane (Wave 4): the slot is handed over once; the editor inside
  // it is created lazily on the first kind:'file' tab so monaco.getEditors()
  // keeps its two-editor shape for everything canvas-backed.
  mountFileTabHost(fileSlot)

  // GL splitter drags don't change the gstrap-main host, so the GL host RO
  // doesn't fire — but the canvas container DOES resize. Watch it directly
  // and refresh GrapesJS so its iframe offsets stay consistent. Same rAF +
  // integer-dim gate as the GL host RO; the two ROs observe disjoint elements
  // and don't race. Observing the persistent root (not the GL host) keeps the
  // watcher alive across workspace applies.
  installCanvasResizeWatcher(persistentRoot)

  wireCanvasEvents()
}

// Post-re-parent measure pass. Deliberately NOT requestFullRelayout() from
// golden-layout-config (importing it here would create a module cycle with
// the factory registration); GL sizes its own items during loadLayout, and
// the workspace apply flow calls requestFullRelayout() at its end anyway —
// this covers the plain Reset Layout path.
function scheduleReattachRelayout() {
  requestAnimationFrame(() => {
    relayoutAllMonaco()
    try { getEditor()?.refresh?.() } catch (_) { /* GrapesJS not ready */ }
  })
}

// Wire-once (house pattern: wireLibraryLock). Every handler reads module
// state (`persistentRoot`, tab vars) — never a render-scoped host, so factory
// re-runs can't strand them on a detached element.
function wireCanvasEvents() {
  if (eventsWired) return
  eventsWired = true

  eventBus.on('viewmode:changed', ({ tab, mode, prev }) => {
    // File tabs are code-only: coerce any attempt to leave code view right
    // back, and never route the attempt through applyViewMode — its
    // onViewModeChange(code→design) would rebuildCanvasFromCode() from the
    // html Monaco's stale page content while a file tab is showing.
    if (isFileTab(tab)) {
      if (mode !== 'code') pageState.setViewMode(tab.pageName, 'code')
      return
    }
    // `prev` is the mode the tab was in before this change. Reading
    // `tab.viewMode` here would always equal `mode` because pageState mutates
    // the tab before emitting — that's how the code→design rebuild was
    // silently never running.
    applyViewMode(mode, prev ?? tab.viewMode)
  })

  eventBus.on('tab:focused', tab => swapToTab(tab))
  eventBus.on('tab:closed',  tab => {
    // Undo routing is per tab; a reopened tab must start with a clean slate
    // rather than inherit the closed one's origin and floor.
    if (tab?.pageName) resetTabOrigin(tab.pageName)
    if (tab?.pageName === currentTabName) {
      currentTabName = null
      loadingTabName = 'about:blank'
      loadHtmlIntoCanvas('')
      loadingTabName = null
      // Last-tab-closed case: no follow-up tab:focused arrives to fix the
      // chrome, so put the html slot / design pane back ourselves.
      if (currentTabKind === 'file') setFileTabChrome(false)
      currentTabKind = null
    }
  })
  eventBus.on('project:closed', () => {
    resetAllOrigins()
    currentTabName = null
    loadingTabName = 'about:blank'
    loadHtmlIntoCanvas('')
    loadingTabName = null
    if (currentTabKind === 'file') setFileTabChrome(false)
    currentTabKind = null
  })

  // Real user edits dirty-flag the active tab. Programmatic loads don't.
  eventBus.on('canvas:content-changed', () => {
    if (loadingTabName) return
    if (!currentTabName || !projectState.current) return
    // File tabs never own canvas content — a stray GrapesJS event while the
    // (hidden) canvas still holds the previous page must not dirty anything.
    if (currentTabKind === 'file') return
    if (currentTabKind === 'library') {
      projectState.markLibraryDirty(currentTabName)
    } else if (currentTabKind === 'template') {
      projectState.markTemplateDirty(currentTabName)
    } else {
      projectState.markPageDirty(currentTabName)
    }
    // Same fences the dirty flag trusts, plus the code→canvas rebuild: a
    // rebuild's setComponents storm reaches this handler too, and stamping it
    // as a design edit would aim the next split-view Ctrl+Z at the canvas when
    // the user's actual last action was typing in the code pane.
    if (isRebuildingFromCode()) return
    stampUserEdit(currentTabName, 'design')
  })
}

function swapToTab(tab) {
  if (!tab || tab.pageName === currentTabName) return
  if (!projectState.current) return

  // Capture outgoing content back into projectState (preserves unsaved edits
  // across tab switches; markPageDirty / markLibraryDirty already fired
  // during the edits themselves). File tabs are excluded on BOTH sides of a
  // swap: their buffer IS their Monaco model (nothing to capture), and while
  // one is focused the hidden canvas still holds the previous page — whose
  // edits were already captured when that page lost focus.
  if (currentTabName && currentTabKind !== 'file') {
    // If the outgoing tab was left in Code or Split view, its canvas
    // component tree is stale relative to what the user actually typed —
    // Monaco edits don't propagate to GrapesJS until a view-mode switch back
    // to Design (canvas-sync.js's LOCKED sync policy). Rebuild it now so the
    // getCanvasHtml() capture below reflects Monaco, not a stale tree.
    // Looked up via pageState.tabs by the name THIS module already tracked
    // (currentTabName) — NOT via pageState.active()/the incoming `tab` arg:
    // pageState has already flipped activeIndex to the INCOMING tab by the
    // time 'tab:focused' fires (see panels/templates/lock.js's component:add
    // comment for the same seam), so either of those would resolve the
    // wrong tab here.
    const outgoingTab = pageState.tabs.find(t => t.pageName === currentTabName)
    if (outgoingTab?.viewMode === 'code' || outgoingTab?.viewMode === 'split') {
      rebuildCanvasFromCode(outgoingTab)
      // rebuildCanvasFromCode leaves canvas-sync's own canvas→code sync
      // suppressed for one tick by design (so its setComponents doesn't
      // immediately re-trigger a redundant back-sync). Release it now,
      // synchronously — loadHtmlIntoCanvas() below (the INCOMING tab's own
      // load) runs before that tick elapses, and left suppressed it would
      // silently swallow the incoming tab's first Design→Code sync.
      resumeCanvasToCodeSync()
    }
    const captured = getCanvasHtml()
    if (currentTabKind === 'library') {
      const item = projectState.current.libraryItems?.find(it => it.id === currentTabName)
      if (item) {
        const prev = item.html
        item.html = captured
        // Library tab focus-out is the propagation moment — fan the new
        // inner html out to every page that has an instance of this id.
        // Skip if nothing actually changed to avoid spurious page dirties.
        if (prev !== captured) propagateLibraryItem(item.id, captured)
      }
    } else if (currentTabKind === 'template') {
      const tpl = projectState.getTemplate(currentTabName)
      if (tpl) {
        const prev = tpl.html
        tpl.html = captured
        // Template focus-out is the propagation moment: recompose every page
        // built from this template around the new chrome (pages keep their
        // own region content; orphan warnings are emitted by propagate.js).
        if (prev !== captured) {
          tpl.regions = templateRegionsMeta(captured)
          propagateTemplate(tpl.name, captured)
        }
      }
    } else {
      const out = projectState.getPage(currentTabName)
      if (out) out.html = captured
    }
  }

  // Incoming file tab: no canvas involvement at all — attach its model in
  // the file slot and swap the chrome to code-only. The canvas keeps the
  // previous page's (already captured) content, hidden.
  if (isFileTab(tab)) {
    activateFileTab(tab)
    setFileTabChrome(true)
    currentTabName = tab.pageName
    currentTabKind = 'file'
    return
  }
  // Leaving a file tab for a canvas-backed one: restore the html slot and
  // the incoming tab's view-mode chrome directly — NOT via applyViewMode,
  // whose code→design hook would rebuildCanvasFromCode() from the stale
  // html Monaco and pollute the incoming page (head extraction included).
  if (currentTabKind === 'file') {
    setFileTabChrome(false, tab.viewMode)
  }

  let nextHtml = ''
  if (tab.kind === 'library') {
    const item = projectState.current.libraryItems?.find(it => it.id === tab.pageName)
    if (!item) return
    nextHtml = item.html ?? ''
  } else if (tab.kind === 'template') {
    const tpl = projectState.getTemplate(tab.pageName)
    if (!tpl) return
    nextHtml = tpl.html ?? ''
  } else {
    const next = projectState.getPage(tab.pageName)
    if (!next) return
    nextHtml = next.html ?? ''
  }

  loadingTabName = tab.pageName
  // The SAME contract on the code side: one Monaco pair serves every tab, so
  // the incoming tab must not inherit the outgoing tab's undo entries. Until
  // 2026-08-17 this happened for free — every design→code sync called setValue,
  // which clears Monaco's history — but the sync now preserves history on
  // purpose, so the swap has to ask for the clear explicitly. Also drops the
  // incoming tab's stale undo-routing origin.
  requestCodeHistoryReset()
  resetTabOrigin(tab.pageName)
  // Fence the swap out of undo history: without this, GrapesJS records the
  // setComponents reset, and undo on the incoming tab restores the OUTGOING
  // page's component tree — which then saves under the wrong page file.
  // History is per-tab-session: cleared on every swap.
  const um = getEditor()?.UndoManager
  um?.stop()
  loadHtmlIntoCanvas(nextHtml)
  um?.start()
  um?.clear()
  currentTabName = tab.pageName
  currentTabKind = tab.kind || 'page'
  // setComponents fires synchronously; release the load guard on the next tick
  // to cover any straggler events fired in microtasks.
  queueMicrotask(() => { loadingTabName = null })
}

// Toggle the code region between its two occupants: the html Monaco (page /
// template / library tabs) and the file Monaco (kind:'file' tabs). Entering a
// file tab forces code-only chrome; leaving restores the incoming tab's own
// view mode. Split state is re-derived so is-split can't leak across kinds.
function setFileTabChrome(active, restoreMode = 'design') {
  if (!persistentRoot) return
  const design   = persistentRoot.querySelector('[data-region="canvas-design"]')
  const code     = persistentRoot.querySelector('[data-region="canvas-code"]')
  const htmlHost = persistentRoot.querySelector('[data-region="monaco-html"]')
  const fileHost = persistentRoot.querySelector('[data-region="monaco-file"]')
  if (!design || !code || !htmlHost || !fileHost) return

  htmlHost.hidden = active
  fileHost.hidden = !active

  const mode = active ? 'code' : restoreMode
  splitActive = (mode === 'split')
  persistentRoot.parentElement?.classList.toggle('is-split', splitActive)
  design.hidden = (mode === 'code')
  code.hidden   = (mode === 'design')

  // Same paint-stable measure pass applyViewMode does — an editor first shown
  // while sized 0 needs an explicit layout once visible.
  requestAnimationFrame(() => {
    relayoutAllMonaco()
    try { getEditor()?.refresh?.() } catch (_) { /* GrapesJS not ready */ }
  })
}

function installCanvasResizeWatcher(watchTarget) {
  if (typeof ResizeObserver !== 'function') return
  let pending = false
  let lastW = 0
  let lastH = 0
  const ro = new ResizeObserver(() => {
    if (pending) return
    pending = true
    requestAnimationFrame(() => {
      pending = false
      const w = watchTarget.clientWidth | 0
      const h = watchTarget.clientHeight | 0
      if (w === lastW && h === lastH) return
      lastW = w
      lastH = h
      try { getEditor()?.refresh?.() } catch (_) { /* GrapesJS not ready */ }
    })
  })
  ro.observe(watchTarget)
}

function applyViewMode(next, prev) {
  if (!persistentRoot) return
  const design = persistentRoot.querySelector('[data-region="canvas-design"]')
  const code   = persistentRoot.querySelector('[data-region="canvas-code"]')
  if (!design || !code) return

  // Always reset the split flag first — the previous version added .is-split
  // when switching INTO split mode but never removed it on the way out, so a
  // user who'd ever hit split mode permanently kept the class. The class
  // stays on the GL host (code-view.spec.js pins that); module state backs
  // it so re-attach after a workspace apply can re-assert it.
  splitActive = (next === 'split')
  persistentRoot.parentElement?.classList.toggle('is-split', splitActive)

  // Set both hidden flags every transition so we don't depend on the
  // previous state. If user reports "code view stuck behind canvas," that
  // would be design.hidden never getting cleared — defensive .hidden=true
  // here keeps the active pane the only one in flow.
  design.hidden = (next === 'code')
  code.hidden   = (next === 'design')

  // Force a Monaco layout() once the show/hide transition is paint-stable
  // so an editor that was hidden when first created (size 0) lays out
  // correctly the first time it becomes visible. Same rAF tick we ask
  // GrapesJS to refresh — the canvas-design pane shrinks from 100% to 50%
  // width on the way INTO split mode, and grows back on the way OUT, but
  // the host stays the same size so installCanvasResizeWatcher doesn't fire.
  // Without this explicit refresh, the GrapesJS iframe rulers and selection
  // overlays draw at the old width and the canvas paints over the code pane.
  requestAnimationFrame(() => {
    if (next === 'code' || next === 'split') relayoutAllMonaco()
    try { getEditor()?.refresh?.() } catch (_) { /* GrapesJS not ready */ }
  })

  onViewModeChange(prev, next)
}
