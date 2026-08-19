/**
 * GrapeStrap — Style Manager: which selector a free value is written to
 *
 * PATH: src/renderer/panels/style-manager/selector-target.js
 * ROLE: The shared "Applies to" control. Every Style Manager row that stores a
 *       free value as a real declaration in project `style.css` has to scope
 *       that declaration to a selector, and an element usually wears several
 *       plausible ones (`gs-sec gs-orbit gs-orbit-nav`). This module shows the
 *       list, remembers which one the user chose, and hands the choice back to
 *       the row so the write target is visible instead of guessed.
 * DEPENDS: ./css-rule-utils.js, ../../i18n.js
 * CREATED: 2026-08-18
 *
 * Before this existed the rows silently took the FIRST eligible class, which
 * on a bundled section is the section-wide `gs-sec` — so setting one slide's
 * background repainted every section on the page and nothing on screen said
 * why. The default is still that first candidate (nothing changes for an
 * element with one class); what changed is that the row names it and lets the
 * user aim somewhere else.
 *
 * The choice is per element AND per property — a heading's text colour and its
 * background legitimately belong on different classes — and it lives in memory
 * only: it is an editing preference, not project data, so it is deliberately
 * not written to the manifest, the page, or the stylesheet. A reopened project
 * starts from the default again, which is the same rule the panel would apply
 * to a fresh element.
 */

import { listSelectorCandidates, isBsUtility } from './css-rule-utils.js'
import { t } from '../../i18n.js'

// component cid + property → chosen selector. Keyed by cid rather than by the
// component object so a re-rendered panel (which re-reads the model but keeps
// the same cid) finds the choice again, and so nothing here keeps a destroyed
// component alive; the map is scratch state that dies with the window.
const TARGET_CHOICES = new Map()

function choiceKey(component, prop) {
  const cid = component?.cid || component?.getId?.() || ''
  return `${cid}::${prop}`
}

/**
 * The selector a row should read and write for this component + property.
 *
 * A remembered choice only counts while it is still one of the element's
 * candidates: classes come and go from the Properties panel, and a stale
 * choice would write a rule that no longer matches anything.
 *
 * @param {object} component - Selected GrapesJS component
 * @param {string} prop - CSS property the row owns, e.g. 'background-color'
 * @param {Function} [isExcluded] - Which classes are framework vocabulary
 *        rather than identity (defaults to the BS utility test)
 * @returns {string|null} Whole selector, or null when the element has none
 */
export function resolveTargetSelector(component, prop, isExcluded = isBsUtility) {
  const candidates = listSelectorCandidates(component, isExcluded)
  if (candidates.length === 0) return null
  const chosen = TARGET_CHOICES.get(choiceKey(component, prop))
  return candidates.includes(chosen) ? chosen : candidates[0]
}

/**
 * Remember the user's pick for this component + property.
 *
 * @param {object} component - Selected GrapesJS component
 * @param {string} prop - CSS property the row owns
 * @param {string} selector - One of listSelectorCandidates' entries
 * @returns {void}
 */
export function rememberTargetSelector(component, prop, selector) {
  if (!component || !selector) return
  TARGET_CHOICES.set(choiceKey(component, prop), selector)
}

/**
 * Markup for the "Applies to" line: the selector the row writes to, as a
 * picker over the element's other candidates.
 *
 * Rendered even when there is only one candidate — the point of the line is
 * that the target is never a mystery, and a one-option select reads as the
 * label it also is.
 *
 * @param {object} options
 * @param {object} options.component - Selected GrapesJS component
 * @param {string} options.prop - CSS property the row owns
 * @param {string} options.selected - Current target (from resolveTargetSelector)
 * @param {Function} [options.isExcluded] - Class exclusion predicate
 * @param {string} [options.disabled] - '' or the literal 'disabled' attribute
 * @returns {string} HTML, or '' when the element has no candidate at all
 *          (the caller's needs-a-selector hint covers that case)
 */
export function selectorTargetMarkup({ component, prop, selected, isExcluded = isBsUtility, disabled = '' } = {}) {
  const candidates = listSelectorCandidates(component, isExcluded)
  if (candidates.length === 0) return ''
  return `
    <div class="gstrap-sm-target">
      <span class="gstrap-sm-target-caption">${escHtml(t('sm.target.caption'))}</span>
      <select class="gstrap-sm-target-select" data-selector-target="${escAttr(prop)}"
              title="${escAttr(t('sm.target.title'))}"
              aria-label="${escAttr(t('sm.target.aria'))}" ${disabled}>
        ${candidates.map(candidate => `
          <option value="${escAttr(candidate)}" ${candidate === selected ? 'selected' : ''}>${escHtml(candidate)}</option>
        `).join('')}
      </select>
    </div>
  `
}

/**
 * Wire the picker rendered by selectorTargetMarkup. A no-op when the row drew
 * the hint variant instead (no select in the DOM).
 *
 * Changing the target re-renders the sub-panel: the row then reads its value
 * from the newly chosen rule, so the chip shows what THAT selector declares
 * rather than carrying the previous target's value across.
 *
 * @param {HTMLElement} host - Sub-panel body holding the row
 * @param {object} options
 * @param {object} options.component - Selected GrapesJS component
 * @param {string} options.prop - CSS property the row owns
 * @param {Function} [options.requestRender] - Sub-panel re-render callback
 * @returns {void}
 */
export function wireSelectorTarget(host, { component, prop, requestRender } = {}) {
  const picker = host?.querySelector(`[data-selector-target="${prop}"]`)
  if (!picker) return
  picker.addEventListener('change', event => {
    rememberTargetSelector(component, prop, event.target.value)
    requestRender?.()
  })
}

function escAttr(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') }
function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
