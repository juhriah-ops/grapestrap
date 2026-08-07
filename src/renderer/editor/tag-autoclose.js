/**
 * GrapeStrap — HTML tag auto-close
 *
 * Typing `<div>` in a code editor inserts `</div>` after the caret (caret
 * stays between the tags), Dreamweaver/VS Code style. Monaco has no built-in
 * for this — the html language service only completes tags through the
 * suggest widget — so this is a small onDidType hook: fires only when the
 * typed chunk ends with `>`, only in html/php models (the page pair's html
 * editor and .html/.php file tabs; js/css models are untouched), and only
 * when the text before the caret is a real opening tag — not a closing tag,
 * not self-closed `/>`, not a void element, and not already followed by its
 * own close.
 *
 * Zero imports on purpose: everything comes off the editor instance, and
 * executeEdits takes plain range objects — keeps this attachable from
 * monaco-init without any cycle.
 */

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
])

// Text-before-caret must end in a complete opening tag. Attribute values may
// contain '>' when quoted, so the attr body matches quoted runs as units.
const OPEN_TAG_AT_END = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*)>$/

export function attachTagAutoClose(editor) {
  editor.onDidType(text => {
    if (!text.endsWith('>')) return
    const model = editor.getModel()
    if (!model) return
    const lang = model.getLanguageId()
    if (lang !== 'html' && lang !== 'php') return

    const pos = editor.getPosition()
    if (!pos) return
    const line = model.getLineContent(pos.lineNumber)
    const before = line.slice(0, pos.column - 1)
    const m = OPEN_TAG_AT_END.exec(before)
    if (!m) return
    const tag = m[1]
    if (VOID_TAGS.has(tag.toLowerCase())) return
    if (m[2].trimEnd().endsWith('/')) return   // self-closed <div/>
    // Don't double up when a close is already sitting right after the caret.
    if (line.slice(pos.column - 1).startsWith(`</${tag}>`)) return

    const range = {
      startLineNumber: pos.lineNumber, startColumn: pos.column,
      endLineNumber: pos.lineNumber, endColumn: pos.column
    }
    editor.executeEdits('gstrap-tag-autoclose', [{ range, text: `</${tag}>` }])
    editor.setPosition(pos)   // back between the tags
  })
}
