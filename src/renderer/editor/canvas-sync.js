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
  if (suppressCanvasToCode) return
  if (activeSide === 'code') return  // user editing code; don't stomp it
  clearTimeout(canvasUpdateTimer)
  canvasUpdateTimer = setTimeout(syncCanvasToCode, DEBOUNCE_MS)
}

function syncCanvasToCode() {
  const editor = getEditor()
  if (!editor || !codeEditor) return
  // Pretty-print before pushing to Monaco — readability is the whole point of
  // the Code view, and HTML round-trips through GrapesJS losslessly when
  // whitespace-significant tags (handled by formatHtml) are preserved.
  const html = formatHtml(editor.getHtml())
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

  const html = codeEditor.getValue()
  const css = cssEditor ? cssEditor.getValue() : ''

  suppressCanvasToCode = true
  try {
    editor.setComponents(html)
    editor.setStyle(css)
    eventBus.emit('sync:code-to-canvas', { html, css })
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
