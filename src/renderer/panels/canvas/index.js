/**
 * GrapeStrap — Canvas panel
 *
 * Hosts GrapesJS in design view and Monaco in code view; toggles between them
 * (or splits) based on the active tab's view mode. The canvas-sync module
 * handles the actual content sync between them per the locked policy.
 */

import { initGrapesJS, loadHtmlIntoCanvas, getCanvasHtml, getEditor } from '../../editor/grapesjs-init.js'
import { createMonacoPair, bindMonacoToRegistry } from '../../editor/monaco-init.js'
import { bindSync, onViewModeChange } from '../../editor/canvas-sync.js'
import { pageState } from '../../state/page-state.js'
import { projectState } from '../../state/project-state.js'
import { eventBus } from '../../state/event-bus.js'

let monacoPair = null

// The canvas tracks which page it's currently displaying so that on tab swap
// we can capture the outgoing page's html back into projectState before
// loading the incoming one. `loadingTabName` is set during a programmatic
// setComponents() call so the resulting component:add storm doesn't get
// misread as a user edit and dirty-flag the page.
let currentTabName = null
let loadingTabName = null

export function renderCanvas(host) {
  host.classList.add('gstrap-canvas-host')
  host.innerHTML = `
    <div class="gstrap-canvas-design" data-region="canvas-design"></div>
    <div class="gstrap-canvas-code"   data-region="canvas-code" hidden>
      <div class="gstrap-monaco-host" data-region="monaco-html"></div>
      <div class="gstrap-monaco-host" data-region="monaco-css" hidden></div>
    </div>
  `
  const designSlot = host.querySelector('[data-region="canvas-design"]')
  const htmlSlot   = host.querySelector('[data-region="monaco-html"]')
  const cssSlot    = host.querySelector('[data-region="monaco-css"]')

  initGrapesJS(designSlot)
  monacoPair = createMonacoPair(htmlSlot, cssSlot)
  bindMonacoToRegistry()
  bindSync({ htmlMonaco: monacoPair.htmlEditor, cssMonaco: monacoPair.cssEditor })

  // GL splitter drags don't change the gstrap-main host, so the GL host RO
  // doesn't fire — but the canvas container DOES resize. Watch it directly
  // and refresh GrapesJS so its iframe offsets stay consistent. Same rAF +
  // integer-dim gate as the GL host RO; the two ROs observe disjoint elements
  // and don't race.
  installCanvasResizeWatcher(host)

  eventBus.on('viewmode:changed', ({ tab, mode }) => {
    applyViewMode(host, mode, tab.viewMode)
  })

  eventBus.on('tab:focused', tab => swapToTab(tab))
  eventBus.on('tab:closed',  tab => {
    if (tab?.pageName === currentTabName) {
      currentTabName = null
      loadingTabName = 'about:blank'
      loadHtmlIntoCanvas('')
      loadingTabName = null
    }
  })
  eventBus.on('project:closed', () => {
    currentTabName = null
    loadingTabName = 'about:blank'
    loadHtmlIntoCanvas('')
    loadingTabName = null
  })

  // Real user edits dirty-flag the active page. Programmatic loads don't.
  eventBus.on('canvas:content-changed', () => {
    if (loadingTabName) return
    if (!currentTabName || !projectState.current) return
    projectState.markPageDirty(currentTabName)
  })
}

function swapToTab(tab) {
  if (!tab || tab.pageName === currentTabName) return
  if (!projectState.current) return

  // Capture outgoing page back into projectState (preserves unsaved edits
  // across tab switches; markPageDirty was already called on the edits).
  if (currentTabName) {
    const out = projectState.getPage(currentTabName)
    if (out) out.html = getCanvasHtml()
  }

  const next = projectState.getPage(tab.pageName)
  if (!next) return

  loadingTabName = tab.pageName
  loadHtmlIntoCanvas(next.html ?? '')
  currentTabName = tab.pageName
  // setComponents fires synchronously; release the load guard on the next tick
  // to cover any straggler events fired in microtasks.
  queueMicrotask(() => { loadingTabName = null })
}

function installCanvasResizeWatcher(host) {
  if (typeof ResizeObserver !== 'function') return
  let pending = false
  let lastW = 0
  let lastH = 0
  const ro = new ResizeObserver(() => {
    if (pending) return
    pending = true
    requestAnimationFrame(() => {
      pending = false
      const w = host.clientWidth | 0
      const h = host.clientHeight | 0
      if (w === lastW && h === lastH) return
      lastW = w
      lastH = h
      try { getEditor()?.refresh?.() } catch (_) { /* GrapesJS not ready */ }
    })
  })
  ro.observe(host)
}

function applyViewMode(host, next, prev) {
  const design = host.querySelector('[data-region="canvas-design"]')
  const code   = host.querySelector('[data-region="canvas-code"]')
  if (!design || !code) return

  // Always reset the split flag first — the previous version added .is-split
  // when switching INTO split mode but never removed it on the way out, so a
  // user who'd ever hit split mode permanently kept the class. With
  // is-split as a future CSS hook (v0.0.2 50/50 layout), the orphan would
  // have shipped a layout bug the moment that CSS landed.
  host.classList.toggle('is-split', next === 'split')

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
    if (next === 'code' || next === 'split') {
      const monaco = window.__gstrap?.pluginRegistry?.bound?.monaco
      monaco?.editor?.getEditors?.().forEach(e => { try { e.layout?.() } catch (_) {} })
    }
    try { getEditor()?.refresh?.() } catch (_) { /* GrapesJS not ready */ }
  })

  onViewModeChange(prev, next)
}
