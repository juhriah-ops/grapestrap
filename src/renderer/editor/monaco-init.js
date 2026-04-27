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
  automaticLayout: true,
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true, indentation: true }
}

export function createMonacoPair(htmlContainer, cssContainer, { html = '', css = '' } = {}) {
  const htmlModel = monaco.editor.createModel(html, 'html')
  const cssModel  = monaco.editor.createModel(css,  'css')

  const htmlEditor = monaco.editor.create(htmlContainer, { ...COMMON_OPTIONS, model: htmlModel })
  const cssEditor  = monaco.editor.create(cssContainer,  { ...COMMON_OPTIONS, model: cssModel })

  return { htmlEditor, cssEditor, htmlModel, cssModel }
}

export function bindMonacoToRegistry() {
  pluginRegistry.setBound('monaco', monaco)
  log.info('Monaco initialized')
}

export { monaco }
