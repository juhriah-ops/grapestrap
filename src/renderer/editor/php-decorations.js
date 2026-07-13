/**
 * GrapeStrap — PHP include/require decorations
 *
 * PATH: src/renderer/editor/php-decorations.js
 * ROLE: Inline Monaco decorations on the quoted target string of PHP
 *       include / include_once / require / require_once statements — a
 *       visual affordance only (Wave 4). No path resolution, no navigation,
 *       no hover: the decoration says "this line pulls in another file",
 *       nothing more.
 * DEPENDS: editor/monaco-init.js (monaco re-export)
 * CREATED: 2026-07-12
 *
 * Lifecycle contract (this codebase just had a listener-leak purge — keep it
 * tight): attachPhpDecorations(editor) binds to whatever model the editor
 * currently shows. Non-php models get nothing. On every model or language
 * switch the previous model's content listener is disposed and its decoration
 * ids are cleared; editor dispose tears the whole thing down. All decoration
 * writes go through model.deltaDecorations (the editor-level variant is
 * deprecated in monaco 0.50; the v5 plan row names deltaDecorations and the
 * model-level API is the non-deprecated form of it).
 */

import { monaco } from './monaco-init.js'

// Quoted target of an include-like statement. Handles optional parens and
// escaped quotes inside the literal: include 'a.php'; require_once("b.php").
// Match group 1 = the quote char, used to find the literal's true end.
const INCLUDE_TARGET_RE = /\b(?:include|require)(?:_once)?\b[\s(]*(['"])(?:\\.|(?!\1).)*\1/g

const DEBOUNCE_MS = 120

const DECORATION_OPTIONS = {
  // Purpose-named class (styled in styles/monaco-overrides.css) — house rule:
  // no inline styles, classes describe purpose, never appearance.
  inlineClassName: 'gstrap-php-include-target',
  stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
}

/** Compute decoration descriptors for every include/require target string. */
export function computePhpIncludeDecorations(model) {
  const out = []
  const lines = model.getLinesContent()
  for (let i = 0; i < lines.length; i++) {
    INCLUDE_TARGET_RE.lastIndex = 0
    let m
    while ((m = INCLUDE_TARGET_RE.exec(lines[i])) !== null) {
      // Decorate the quoted literal only (quotes included), not the keyword.
      // Monaco columns are 1-based and endColumn is exclusive.
      const quoteStart = m.index + m[0].indexOf(m[1])
      out.push({
        range: new monaco.Range(i + 1, quoteStart + 1, i + 1, m.index + m[0].length + 1),
        options: DECORATION_OPTIONS
      })
    }
  }
  return out
}

/**
 * Watch `editor` and keep include/require decorations current on any PHP
 * model it shows. Returns a dispose function (also self-disposes with the
 * editor). Call once per editor instance.
 */
export function attachPhpDecorations(editor) {
  let contentSub = null      // IDisposable for the bound model's change events
  let boundModel = null      // model currently carrying our decorations
  let decorationIds = []     // ids issued by the bound model
  let debounceTimer = null

  function clearFromBoundModel() {
    clearTimeout(debounceTimer)
    debounceTimer = null
    contentSub?.dispose()
    contentSub = null
    if (boundModel && !boundModel.isDisposed() && decorationIds.length) {
      boundModel.deltaDecorations(decorationIds, [])
    }
    decorationIds = []
    boundModel = null
  }

  function refresh() {
    if (!boundModel || boundModel.isDisposed()) return
    decorationIds = boundModel.deltaDecorations(
      decorationIds, computePhpIncludeDecorations(boundModel)
    )
  }

  function bind() {
    clearFromBoundModel()
    const model = editor.getModel()
    if (!model || model.getLanguageId() !== 'php') return
    boundModel = model
    contentSub = model.onDidChangeContent(() => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(refresh, DEBOUNCE_MS)
    })
    refresh()
  }

  const modelSub = editor.onDidChangeModel(bind)
  const langSub = editor.onDidChangeModelLanguage(bind)
  bind()

  function dispose() {
    clearFromBoundModel()
    modelSub.dispose()
    langSub.dispose()
  }
  editor.onDidDispose(dispose)
  return dispose
}
