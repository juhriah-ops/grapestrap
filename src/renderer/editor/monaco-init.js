/**
 * GrapeStrap — Monaco initialization
 *
 * Two Monaco instances per page tab: one for HTML, one for CSS. Each tab keeps
 * its own pair so switching tabs preserves cursor position, scroll, and undo
 * history.
 *
 * Web Worker config: Electron's file:// protocol breaks Monaco's default worker
 * URL resolution. We provide MonacoEnvironment.getWorker that returns a Web
 * Worker constructed from a Blob URL pointing to the bundled worker scripts.
 *
 * Class-first autocomplete (Bootstrap class names) is registered as a custom
 * completion provider for HTML — but only in v0.0.2; v0.0.1 ships vanilla.
 */

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import editorWorkerUrl from 'monaco-editor/esm/vs/editor/editor.worker.js?worker&url'
import htmlWorkerUrl   from 'monaco-editor/esm/vs/language/html/html.worker.js?worker&url'
import cssWorkerUrl    from 'monaco-editor/esm/vs/language/css/css.worker.js?worker&url'

// Importing editor.api.js alone does NOT register language contributions —
// without these, createModel(html, 'html') silently falls back to the
// 'plaintext' language (verified via getModel().getLanguageId() === 'plaintext'
// in the v0.0.1 walking skeleton). The Monarch tokenizers come from the
// basic-languages contributions; the language services (autocomplete,
// validation, formatting) come from the language/* contributions which also
// hand off to the html/css worker scripts imported above.
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution.js'
import 'monaco-editor/esm/vs/language/html/monaco.contribution.js'
import 'monaco-editor/esm/vs/language/css/monaco.contribution.js'

import { pluginRegistry } from '../plugin-host/registry.js'
import { log } from '../log.js'

// Worker registration must happen BEFORE any monaco.editor.create() call.
self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    switch (label) {
      case 'html':
      case 'handlebars':
      case 'razor':
        return new Worker(htmlWorkerUrl, { type: 'module' })
      case 'css':
      case 'scss':
      case 'less':
        return new Worker(cssWorkerUrl, { type: 'module' })
      default:
        return new Worker(editorWorkerUrl, { type: 'module' })
    }
  }
}

const COMMON_OPTIONS = {
  theme: 'vs-dark',
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 13,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: 'off',
  minimap: { enabled: false },
  lineNumbers: 'on',
  renderLineHighlight: 'line',
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  // automaticLayout intentionally OFF. Each automaticLayout: true editor
  // installs its own internal ResizeObserver, and with three Monaco instances
  // (HTML, CSS, custom-CSS) plus the GL host RO they raced and contributed to
  // the canvas-drift-on-resize bug. Single source of truth: the GL host RO
  // calls relayoutAllMonaco() (see registerForRelayout / golden-layout-config).
  automaticLayout: false,
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true, indentation: true }
}

// Set of live Monaco editors. Anything created via createMonacoPair or
// registerForRelayout is laid out by relayoutAllMonaco() (called from the
// GL host RO) AND by a per-container RO so GL-internal splitter drags get
// covered too (those don't change the host, so the GL host RO doesn't fire).
//
// The per-container RO is roughly what Monaco's `automaticLayout: true` does
// internally — but explicit, debounced via rAF, and with the editor reference
// in a single registry instead of N hidden ROs we don't control.
const liveEditors = new Set()

export function registerForRelayout(editor) {
  if (!editor) return
  liveEditors.add(editor)

  const node = typeof editor.getDomNode === 'function' ? editor.getDomNode() : null
  let ro = null
  if (node && typeof ResizeObserver === 'function') {
    let pending = false
    let lastW = 0
    let lastH = 0
    ro = new ResizeObserver(() => {
      if (pending) return
      pending = true
      requestAnimationFrame(() => {
        pending = false
        const w = node.clientWidth | 0
        const h = node.clientHeight | 0
        if (w === lastW && h === lastH) return
        lastW = w
        lastH = h
        try { editor.layout?.() } catch (_) { /* transitioning */ }
      })
    })
    ro.observe(node)
  }

  editor.onDidDispose?.(() => {
    liveEditors.delete(editor)
    ro?.disconnect()
  })
}

export function relayoutAllMonaco() {
  for (const ed of liveEditors) {
    try { ed.layout?.() } catch (_) { /* editor may be transitioning */ }
  }
}

export function createMonacoPair(htmlContainer, cssContainer, { html = '', css = '' } = {}) {
  const htmlModel = monaco.editor.createModel(html, 'html')
  const cssModel  = monaco.editor.createModel(css,  'css')

  const htmlEditor = monaco.editor.create(htmlContainer, { ...COMMON_OPTIONS, model: htmlModel })
  const cssEditor  = monaco.editor.create(cssContainer,  { ...COMMON_OPTIONS, model: cssModel })

  registerForRelayout(htmlEditor)
  registerForRelayout(cssEditor)

  return { htmlEditor, cssEditor, htmlModel, cssModel }
}

export function bindMonacoToRegistry() {
  pluginRegistry.setBound('monaco', monaco)
  log.info('Monaco initialized')
}

export { monaco }
