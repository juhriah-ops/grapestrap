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
// PHP (Wave 4) is Monarch-tokenizer-only — monaco ships no vs/language/php
// worker, so unlike html/css there is no service import to pair with this and
// the MonacoEnvironment default branch (editorWorker) already covers it.
// Registers extensions .php/.php4/.php5/.phtml/.ctp, which is what lets
// createModel(value, undefined, uri) infer 'php' for file tabs (file-tabs.js).
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution.js'
// JavaScript (Graphite-starter wave) is the same tokenizer-only shape as PHP
// above: registers the .js extension for createModel's language inference,
// no vs/language/typescript worker pulled in, so the default editorWorker
// branch below still covers it. Deliberately NOT the TS language service —
// file tabs need syntax highlighting for the starter's assets/js/main.js,
// not full IntelliSense.
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js'

// editor.api.js also ships ZERO editor-feature contributions. Find/Replace
// (Edit menu + Ctrl+F/Ctrl+H via menu-router's cmdFind) needs the find
// controller registered or editor.getAction('actions.find') returns null
// and the whole feature is a silent no-op.
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'

// Same story for code completion: the suggest controller is a contribution,
// and without it the html/css language services above compute completions
// nobody can see. The snippet controller comes along because the suggest
// widget inserts accepted items through a suggest session.
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js'
import 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js'

// Right-click Cut / Copy / Paste in every code editor (Code, Split, Custom
// CSS panel, file tabs). contextmenu renders Monaco's own menu; clipboard
// registers the three actions it lists (paste reads through
// navigator.clipboard — Electron grants clipboard access by default, no
// permission handler needed).
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu.js'
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js'

// Power-editing tier (2026-08-07 sweep — paths match editor.all.js):
// - wordOperations: Ctrl+Left/Right word jumps, Ctrl+Backspace — absent,
//   these core-feeling keys simply did nothing.
// - hover: css property / html tag docs tooltips from the language workers.
// - colorPicker: inline color swatches + picker on every CSS color value
//   (colorContributions renders decorators; the hover participant opens the
//   picker — needs `hover` above).
// - bracketMatching: matching-pair highlight + Ctrl+Shift+\ jump.
// - multicursor: Ctrl+D add-next-occurrence, Alt+Click extra carets.
// - linesOperations: Alt+Up/Down move line, Shift+Alt+Up/Down copy line,
//   Ctrl+Shift+K delete line.
// - folding: collapse html sections / css rules (language-service ranges,
//   indentation fallback).
// - comment: Ctrl+/ language-aware comment toggle.
// - linkedEditing: rename an html tag and its pair follows (needs the
//   linkedEditing option in COMMON_OPTIONS — default is OFF — plus the
//   provider registered below; the html service ships none).
// Deliberately NOT imported: wordHighlighter — verified inert with the
// bundled html/css services (their documentHighlight providers never
// resolve results, and a registered provider suppresses the textual
// fallback). Re-evaluate on a monaco bump.
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js'
import 'monaco-editor/esm/vs/editor/contrib/colorPicker/browser/colorContributions.js'
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js'
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js'
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js'
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js'
import 'monaco-editor/esm/vs/editor/contrib/linkedEditing/browser/linkedEditing.js'

import { pluginRegistry } from '../plugin-host/registry.js'
import { attachTagAutoClose } from './tag-autoclose.js'
import { registerHtmlLinkedEditing } from './html-linked-editing.js'
import { t } from '../i18n.js'
import { log } from '../log.js'

// Data source for the linkedEditing contribution above — the html service
// registers no LinkedEditingRangeProvider of its own.
registerHtmlLinkedEditing(monaco)

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
  guides: { bracketPairs: true, indentation: true },
  // Monaco's default disables quick suggestions inside strings — but CSS
  // url("…") is a string context, and the asset-path completion provider
  // (css-asset-completion.js) lives exactly there. Keep suggestions flowing
  // while the user types a path.
  quickSuggestions: { other: true, comments: false, strings: true },
  // Paired-tag rename (linkedEditing contribution) ships default-OFF.
  linkedEditing: true
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

  // Observe the CONTAINER, not editor.getDomNode(): Monaco sizes its own
  // node from the last layout() call, so it never grows when the pane does —
  // an RO on it goes silent exactly when a GL splitter drag or split-view
  // resize widens the pane (seen on nola1 as a dead strip right of the code,
  // text clipping at the stale edge). The container tracks the pane.
  const node = typeof editor.getContainerDomNode === 'function'
    ? editor.getContainerDomNode()
    : (typeof editor.getDomNode === 'function' ? editor.getDomNode() : null)
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

// Whichever Monaco editor the caret is in right now — page pair, Custom CSS
// panel, or a file tab. menu-router's cmdFind prefers this over the active
// tab's editor so Ctrl+F lands where the user is actually typing.
// GrapeStrap's own context-menu tail for every code editor: Find/Replace
// (the find contribution registers the actions but doesn't surface them in
// the menu — picked, they open the find widget docked to the editor's
// top-right) and Deselect All (collapses every extra cursor and selection
// back to a single caret; Monaco ships no menu item for it). Labels resolve
// at attach time (all editors are created after initI18n() in boot). Own
// menu groups so they sit between the navigation entries and Cut/Copy/Paste.
export function attachEditorContextItems(editor) {
  editor.addAction({
    id: 'gstrap.ctx-find',
    label: t('menu.edit.find'),
    contextMenuGroupId: '2_gstrapfind',
    contextMenuOrder: 1,
    run: ed => ed.getAction('actions.find')?.run()
  })
  editor.addAction({
    id: 'gstrap.ctx-replace',
    label: t('menu.edit.replace'),
    contextMenuGroupId: '2_gstrapfind',
    contextMenuOrder: 2,
    run: ed => ed.getAction('editor.action.startFindReplaceAction')?.run()
  })
  editor.addAction({
    id: 'gstrap.ctx-deselect',
    label: t('ctx.deselect-all'),
    contextMenuGroupId: '3_gstrapselect',
    contextMenuOrder: 1,
    run: ed => {
      // Drop secondary cursors first, then collapse the surviving
      // selection to its caret. Both are no-ops when nothing is selected.
      ed.trigger('gstrap', 'removeSecondaryCursors', {})
      ed.trigger('gstrap', 'cancelSelection', {})
    }
  })
}

export function getFocusedMonacoEditor() {
  // Text focus = caret in the code. Widget focus catches the editor's own
  // overlays (an already-open find widget's input) so Ctrl+F there re-runs
  // find in the same editor instead of falling back to the page editor.
  for (const ed of liveEditors) {
    try { if (ed.hasTextFocus?.()) return ed } catch (_) { /* transitioning */ }
  }
  for (const ed of liveEditors) {
    try { if (ed.hasWidgetFocus?.()) return ed } catch (_) { /* transitioning */ }
  }
  return null
}

export function createMonacoPair(htmlContainer, cssContainer, { html = '', css = '' } = {}) {
  const htmlModel = monaco.editor.createModel(html, 'html')
  const cssModel  = monaco.editor.createModel(css,  'css')

  const htmlEditor = monaco.editor.create(htmlContainer, { ...COMMON_OPTIONS, model: htmlModel })
  const cssEditor  = monaco.editor.create(cssContainer,  { ...COMMON_OPTIONS, model: cssModel })

  registerForRelayout(htmlEditor)
  registerForRelayout(cssEditor)
  attachTagAutoClose(htmlEditor)
  attachEditorContextItems(htmlEditor)
  attachEditorContextItems(cssEditor)

  return { htmlEditor, cssEditor, htmlModel, cssModel }
}

// Single standalone editor with the house options, no model attached yet.
// Used by the file-tab lane (editor/file-tabs.js) so its editor config can
// never drift from the html/css pair's. Deliberately NOT created eagerly
// anywhere — specs index monaco.editor.getEditors() by position/language and
// must keep seeing exactly two editors until a file tab actually opens.
export function createMonacoSingle(container) {
  const editor = monaco.editor.create(container, { ...COMMON_OPTIONS, model: null })
  registerForRelayout(editor)
  // File tabs swap models of many languages through this one editor; the
  // hook checks the model's language per keystroke (html/php only).
  attachTagAutoClose(editor)
  attachEditorContextItems(editor)
  return editor
}

export function bindMonacoToRegistry() {
  pluginRegistry.setBound('monaco', monaco)
  log.info('Monaco initialized')
}

export { monaco }
