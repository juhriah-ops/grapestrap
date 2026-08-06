/**
 * GrapeStrap — CSS url() asset completion
 *
 * Registers a Monaco completion provider for the `css` language that offers
 * the project's images whenever the caret sits inside a `url(...)` value —
 * `background: url(` pops a dropdown of everything in assets/images/ and
 * inserts the CORRECT relative path for whichever stylesheet is being edited:
 *
 *   - Custom CSS panel (the project's global stylesheet, e.g.
 *     assets/css/style.css) → stylesheet-relative `../images/<name>`
 *     (the file-relative convention from shared/css-urls.js).
 *   - CSS file tabs (site files opened from the File Manager) → relative
 *     to that file's own location under site/.
 *   - The page pair's CSS editor (GrapesJS component styles, injected
 *     inline at the document root) → document-relative `assets/images/<name>`.
 *
 * Reads the Asset Manager's synchronous window cache (`__gstrap_assets`,
 * published on every refresh + chokidar watcher event) — same source as the
 * Style Manager's background image picker, so a freshly-dropped image
 * appears without restart. Registered once per language, effective in every
 * current and future css model.
 */

import { monaco } from './monaco-init.js'
import { getCssEditor } from '../panels/custom-css/index.js'
import { projectState } from '../state/project-state.js'
import { stylesheetDirOf } from '../../shared/css-urls.js'

// Matches an unclosed url( before the caret; group 2 = the path typed so far.
const URL_CONTEXT = /url\(\s*(['"]?)([^)'"]*)$/

let registered = false

export function registerCssAssetCompletion() {
  if (registered) return
  registered = true

  monaco.languages.registerCompletionItemProvider('css', {
    triggerCharacters: ['(', '"', "'", '/'],
    provideCompletionItems(model, position) {
      const lineStart = model.getValueInRange({
        startLineNumber: position.lineNumber, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column
      })
      const ctx = URL_CONTEXT.exec(lineStart)
      if (!ctx) return { suggestions: [] }

      const images = window.__gstrap_assets?.images || []
      if (images.length === 0) return { suggestions: [] }

      const typed = ctx[2]
      const range = new monaco.Range(
        position.lineNumber, position.column - typed.length,
        position.lineNumber, position.column
      )
      const base = baseDirForModel(model)
      const suggestions = images.map(name => {
        const path = relativeToBase(base, `assets/images/${name}`)
        return {
          label: name,
          kind: monaco.languages.CompletionItemKind.File,
          detail: path,
          insertText: path,
          // Filter against the filename AND the path shape, so both
          // `url(her…` and `url(../images/her…` keep the item visible.
          filterText: `${name} ${path}`,
          range
        }
      })
      return { suggestions }
    }
  })
}

// Which stylesheet does this model represent? Decides the url() base.
function baseDirForModel(model) {
  const customCssModel = getCssEditor()?.getModel()
  if (customCssModel && model === customCssModel) {
    return stylesheetDirOf(projectState.current?.manifest?.globalCSS || 'assets/css/style.css')
  }
  // File tabs create models at monaco.Uri.file('/<relPath under site/>').
  if (model.uri?.scheme === 'file') {
    return stylesheetDirOf(model.uri.path.replace(/^\//, ''))
  }
  // Page pair css editor (inline component styles) — document-relative.
  return ''
}

// Relative path from a stylesheet directory to a target site-relative path.
// relativeToBase('assets/css/', 'assets/images/x.png') → '../images/x.png'
// relativeToBase('', 'assets/images/x.png')            → 'assets/images/x.png'
function relativeToBase(baseDir, target) {
  const base = String(baseDir || '').split('/').filter(Boolean)
  const tgt = String(target).split('/').filter(Boolean)
  while (base.length && tgt.length && base[0] === tgt[0]) {
    base.shift(); tgt.shift()
  }
  return '../'.repeat(base.length) + tgt.join('/')
}
