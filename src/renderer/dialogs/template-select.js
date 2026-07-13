// =============================================================
// PATH: src/renderer/dialogs/template-select.js
// ROLE: Shared label + <select> markup helper for the template/starter
//       pickers — the "template-select component" v5's Wave 4 row promises.
//       Extracted from the inline pattern new-page.js shipped in Wave 2
//       (its header note: "Wave 4's new-PROJECT dialog will share this
//       select pattern"). Both dialogs render it inside a
//       gstrap-prompt-card; state hooks stay data-* attributes per house
//       rules.
// DEPENDS: nothing (pure string builder; callers own i18n + reading .value)
// CREATED: 2026-07-12 (Wave 4)
// =============================================================

/**
 * Build the label + select block used by the New Page and New Project
 * dialogs.
 *
 * @param {object} opts
 * @param {string} opts.labelText  — already-translated label line
 * @param {string} opts.noneText   — already-translated first option ("None…"
 *                                   / "Blank…"); its value is `noneValue`
 * @param {string} [opts.noneValue] — value of the first option (default '')
 * @param {Array<{value:string,label:string}>} opts.options
 * @param {string} opts.dataAttr   — state hook for the caller to query,
 *                                   e.g. 'data-np-template' / 'data-np-starter'
 * @returns {string} HTML string (all dynamic text escaped here)
 */
export function templateSelectHtml({ labelText, noneText, noneValue = '', options = [], dataAttr }) {
  return `
    <label class="gstrap-prompt-label">${escHtml(labelText)}</label>
    <select class="gstrap-prompt-input" ${dataAttr}>
      <option value="${escAttr(noneValue)}">${escHtml(noneText)}</option>
      ${options.map(o =>
        `<option value="${escAttr(o.value)}">${escHtml(o.label)}</option>`).join('')}
    </select>`
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
function escAttr(s) { return escHtml(s) }
