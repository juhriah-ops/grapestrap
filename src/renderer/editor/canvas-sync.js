/**
 * GrapeStrap — Canvas / Code sync (LOCKED POLICY)
 *
 * Code-authoritative-when-active, per the Dreamweaver model. v3 of the build plan
 * proposed bidirectional 300ms-debounced sync — that path has eaten months of
 * every editor that tried it. We commit to:
 *
 *   - Design → Code:  live-debounced (300ms). Continuous flow.
 *   - Code → Design:  ON SWITCH ONLY. Edits in Code do NOT propagate live.
 *                     When the user switches to Design view (or focuses the
 *                     Design pane in Split mode), the component tree is rebuilt
 *                     from the current HTML.
 *
 * Tradeoff acknowledged: Code→Design switch loses canvas selection. Documented in
 * the welcome dialog and FAQ. v0.0.2 may add a "remember last selection" heuristic
 * by selector, but it's deliberately not in v0.0.1.
 *
 * In Split view, the side most recently focused is authoritative. The other side
 * updates on focus loss.
 */

import { eventBus } from '../state/event-bus.js'
import { getEditor } from './grapesjs-init.js'
import { formatHtml } from './format-html.js'
import { projectState } from '../state/project-state.js'
import { pageState } from '../state/page-state.js'
import { composeFullPageHtml, extractPageFromFullHtml, isFullHtmlDocument } from '../../shared/page-html.js'
import { log } from '../log.js'

let codeEditor = null
let cssEditor = null
let activeSide = 'design'    // 'design' | 'code'
let canvasUpdateTimer = null
let suppressCanvasToCode = false
let suppressCodeToCanvas = false

const DEBOUNCE_MS = 300

export function bindSync({ htmlMonaco, cssMonaco }) {
  codeEditor = htmlMonaco
  cssEditor = cssMonaco

  // Design → Code: debounce GrapesJS updates and push to Monaco
  const editor = getEditor()
  if (editor) {
    editor.on('update', queueCanvasToCode)
    editor.on('component:add', queueCanvasToCode)
    editor.on('component:remove', queueCanvasToCode)
    editor.on('component:update', queueCanvasToCode)
  }

  // Track which pane has focus
  htmlMonaco?.onDidFocusEditorWidget(() => { activeSide = 'code'  })
  cssMonaco?.onDidFocusEditorWidget(()  => { activeSide = 'code'  })
  // Canvas focus is detected via GrapesJS frame focus events
  if (editor) {
    editor.on('canvas:frame:load', () => {
      const frame = editor.Canvas.getFrameEl()
      frame?.contentWindow?.addEventListener('focus', () => { activeSide = 'design' })
    })
  }
}

function queueCanvasToCode() {
  // Only suppress when we're explicitly in the middle of a code-to-canvas
  // rebuild — otherwise, every canvas change should propagate to Monaco
  // per the locked sync policy ("Design → Code: live-debounced. Continuous
  // flow."). Earlier versions also gated on activeSide === 'code' but that
  // was wrong: activeSide latches to 'code' the moment Monaco gains focus
  // and only resets when the canvas iframe contentWindow regains focus,
  // which doesn't happen on view-mode toggle. The result was that any
  // user who ever clicked into the Code view permanently broke
  // canvas-to-code sync until they restarted — reproduced 2026-05-03 by
  // user on nola1 ("code view is no longer working" on a new project).
  // Nothing actually depends on activeSide blocking sync: typing in
  // Monaco doesn't fire GrapesJS component events, so the gate never
  // saved a real edit; rebuildCanvasFromCode's own suppressCanvasToCode
  // already covers the only way Code-side typing could appear in canvas
  // events.
  if (suppressCanvasToCode) return
  clearTimeout(canvasUpdateTimer)
  canvasUpdateTimer = setTimeout(syncCanvasToCode, DEBOUNCE_MS)
}

function syncCanvasToCode() {
  const editor = getEditor()
  if (!editor || !codeEditor) return
  // For page tabs we compose the FULL HTML document (head + body + framework
  // links) so the Code view is a faithful mirror of what's saved on disk —
  // user sees the BS / FA / icons references directly. Library-item tabs
  // stay body-only since they're fragments by design (composed into pages
  // via wrapper div, never standalone). Pretty-print on the way out so the
  // Code view stays readable.
  const tab = pageState.active()
  const body = formatHtml(editor.getHtml())
  let html = body
  if (tab?.kind !== 'library' && projectState.current) {
    const page = projectState.current.pages?.find(p => p.name === tab?.pageName)
    if (page) html = composeFullPageHtml(body, page, projectState.current.manifest || {})
  }
  const css = editor.getCss()
  suppressCodeToCanvas = true
  if (codeEditor.getValue() !== html) codeEditor.setValue(html)
  if (cssEditor && cssEditor.getValue() !== css) cssEditor.setValue(css)
  suppressCodeToCanvas = false
  eventBus.emit('sync:canvas-to-code', { html, css })
}

/**
 * Called when the user switches view mode TO design (from code or split→design),
 * or when the design pane regains focus in split view. Rebuilds the GrapesJS
 * component tree from the current Monaco HTML/CSS.
 *
 * NOTE: this loses GrapesJS selection state. Acceptable for v0.0.1.
 */
export function rebuildCanvasFromCode() {
  if (suppressCodeToCanvas) return
  const editor = getEditor()
  if (!editor || !codeEditor) return

  const raw = codeEditor.getValue()
  const css = cssEditor ? cssEditor.getValue() : ''

  // For pages, the Code view holds the full HTML doc (alpha.7+). Extract the
  // body for setComponents and the head fields back into the manifest so
  // Page Properties + the next compose stay in sync with what the user
  // typed. Library tabs stay body-only.
  let bodyForCanvas = raw
  const tab = pageState.active()
  if (tab?.kind !== 'library' && isFullHtmlDocument(raw)) {
    const { body, head } = extractPageFromFullHtml(raw)
    bodyForCanvas = body
    if (projectState.current) {
      const page = projectState.current.pages?.find(p => p.name === tab?.pageName)
      if (page) {
        page.head = { ...(page.head || {}), ...head }
        projectState.markPageDirty?.(page.name)
        eventBus.emit('page:head-changed', { page })
      }
    }
  }

  suppressCanvasToCode = true
  try {
    editor.setComponents(bodyForCanvas)
    editor.setStyle(css)
    eventBus.emit('sync:code-to-canvas', { html: bodyForCanvas, css })
    log.debug('rebuilt canvas from code')
  } finally {
    // Re-enable after one tick so GrapesJS update events from setComponents
    // don't immediately trigger a back-sync.
    setTimeout(() => { suppressCanvasToCode = false }, 0)
  }
}

/**
 * Called by view-modes.js when switching the active view mode for a tab.
 * The actual show/hide of canvas vs Monaco DOM is the caller's job; this just
 * triggers the rebuild on the right transition.
 */
export function onViewModeChange(prev, next) {
  if (next === 'design' && prev === 'code') {
    rebuildCanvasFromCode()
  }
  // Split mode: focus tracking handles the rest
}

export function setActiveSide(side) {
  activeSide = side
}

export function getActiveSide() {
  return activeSide
}
