/**
 * GrapeStrap — Canvas panel
 *
 * Hosts GrapesJS in design view and Monaco in code view; toggles between them
 * (or splits) based on the active tab's view mode. The canvas-sync module
 * handles the actual content sync between them per the locked policy.
 */

import { initGrapesJS, loadHtmlIntoCanvas, getCanvasHtml } from '../../editor/grapesjs-init.js'
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

function applyViewMode(host, next, prev) {
  const design = host.querySelector('[data-region="canvas-design"]')
  const code   = host.querySelector('[data-region="canvas-code"]')
  if (!design || !code) return

  if (next === 'design') {
    design.hidden = false
    code.hidden = true
  } else if (next === 'code') {
    design.hidden = true
    code.hidden = false
  } else if (next === 'split') {
    design.hidden = false
    code.hidden = false
    // CSS .is-split flag could split the layout 50/50 — v0.0.2 polish
    host.classList.add('is-split')
  } else {
    host.classList.remove('is-split')
  }
  onViewModeChange(prev, next)
}
