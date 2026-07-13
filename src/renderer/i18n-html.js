// =============================================================
// PATH: src/renderer/i18n-html.js
// ROLE: Safe rich-hint rendering for translated strings that carry inline
//       <code> tokens (Style Manager hints, dialog hints). Catalog values
//       mark code spans with `backticks`; codeMarkup() FIRST escapes the
//       whole (already-interpolated) t() output, THEN converts the escaped
//       backtick spans to <code> elements — so no translated text ever
//       reaches innerHTML unescaped. This is the one sanctioned exception
//       to the textContent-only policy in src/renderer/i18n.js, and it
//       exists precisely so callers never hand-build HTML around t().
// DEPENDS: (none)
// CREATED: 2026-07-12 (Wave 4 i18n sweep)
// =============================================================

/**
 * codeMarkup(text) → HTML string, safe for innerHTML.
 *   codeMarkup('Add a `d-flex` class.') === 'Add a <code>d-flex</code> class.'
 * Escapes &, <, >, " everywhere; only the backtick pairs become markup.
 * Unpaired backticks render literally (escaped, no markup).
 */
export function codeMarkup(text) {
  const escaped = String(text ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  return escaped.replace(/`([^`]+)`/g, '<code>$1</code>')
}
