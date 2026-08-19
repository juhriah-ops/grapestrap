/**
 * GrapeStrap — Style Manager: free-colour chip shared by the colour rows
 *
 * PATH: src/renderer/panels/style-manager/custom-color.js
 * ROLE: The "Custom" row that sits under the Bootstrap swatch rows in the
 *       Background, Text and Border sub-panels. Bootstrap only ships theme
 *       tokens; this row opens the full colour picker (hex / rgb / var() /
 *       eyedropper) and stores the chosen value as a real declaration on the
 *       component's rule in project `style.css`.
 * DEPENDS: ../color-picker/index.js, ./bare-rule-store.js, ./class-utils.js,
 *          ./selector-target.js, ../../i18n.js
 * CREATED: 2026-08-17
 * UPDATED: 2026-08-18 — the row now names the selector it writes to and lets
 *          the user retarget it (selector-target.js). The old behaviour picked
 *          the element's first non-utility class silently, which on a bundled
 *          section is the shared `gs-sec` — one slide's colour repainted the
 *          whole page and nothing said which class was being edited.
 *
 * Predetermined and custom are mutually exclusive by construction: choosing a
 * free colour drops whatever `bg-*` / `text-*` / `border-*` class was set, and
 * the sub-panels call `clearCustomColor()` from their swatch handlers so the
 * reverse holds too. Without that the BS utility and the project rule would
 * both apply and specificity — not the user's last click — would decide the
 * winner.
 *
 * The chip's colour travels as a `--swatch` custom property set from JS (the
 * same mechanism the colour picker uses for its own swatches), so no colour
 * value is ever written into a style attribute in markup.
 */

import { openColorPicker } from '../color-picker/index.js'
import { writeProjectRuleProps } from './bare-rule-store.js'
import { applyGroup, readGroup } from './class-utils.js'
import { selectorTargetMarkup, wireSelectorTarget } from './selector-target.js'
import { t } from '../../i18n.js'

/**
 * Markup for the Custom colour row: the chip, its Clear, and the "Applies to"
 * picker naming the selector the value is written to. Renders the "needs a
 * selector" hint instead when the component has no class or id we can scope a
 * rule to — the same fallback the Background image row uses.
 *
 * @param {object} options
 * @param {object} options.component - Selected GrapesJS component (for the
 *        picker's candidate list).
 * @param {string|null} options.selector - Whole selector, or null if none.
 * @param {string} options.prop - CSS property this row owns, e.g. 'color'.
 * @param {string} options.value - Current custom colour ('' when unset).
 * @returns {string} HTML for one `.gstrap-sm-row`.
 */
export function customColorRowMarkup({ component, selector, prop, value = '' } = {}) {
  const label = escHtml(t('sm.label.custom'))
  if (!selector) {
    return `
      <div class="gstrap-sm-row">
        <label class="gstrap-sm-label">${label}</label>
        <div class="gstrap-sm-hint">${escHtml(t('sm.custom-needs-selector'))}</div>
      </div>
    `
  }
  return `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${label}</label>
      <div class="gstrap-sm-custom-color">
        <button type="button" class="gstrap-sm-custom-chip ${value ? 'is-active' : ''}"
                data-custom-color-chip data-custom-color-value="${escAttr(value)}"
                title="${escAttr(value || t('sm.custom-pick'))}"
                aria-label="${escAttr(t('sm.pick-aria', { label: t('sm.label.custom') }))}">
          <span class="gstrap-sm-custom-chip-swatch" data-custom-color-swatch></span>
          <span class="gstrap-sm-custom-chip-label">${escHtml(value || t('sm.custom-pick'))}</span>
        </button>
        <button class="gstrap-sm-pill gstrap-sm-clear" data-custom-color-clear>${escHtml(t('action.clear'))}</button>
      </div>
      ${selectorTargetMarkup({ component, prop, selected: selector })}
    </div>
  `
}

/**
 * Wire the chip rendered by customColorRowMarkup. A no-op when the hint
 * variant was rendered (no chip in the DOM).
 *
 * @param {HTMLElement} host - Sub-panel body holding the row.
 * @param {object} options
 * @param {object} options.component - Selected GrapesJS component.
 * @param {string|null} options.selector - Whole selector for the rule.
 * @param {string} options.prop - CSS property to own, e.g. 'background-color'.
 * @param {RegExp} options.classPattern - BS colour group this row overrides.
 * @param {Function} [options.requestRender] - Sub-panel re-render callback.
 */
export function wireCustomColorRow(host, { component, selector, prop, classPattern, requestRender } = {}) {
  // Wired before the early return: an element with candidates always has a
  // picker, and the chip is only absent when there are none.
  wireSelectorTarget(host, { component, prop, requestRender })

  const chip = host?.querySelector('[data-custom-color-chip]')
  if (!chip) return
  paintChip(chip, chip.dataset.customColorValue || '')

  chip.addEventListener('click', () => {
    openColorPicker({
      anchor: chip,
      value: chip.dataset.customColorValue || '',
      // Fires on every keystroke in the picker's text field as well as on
      // swatch/eyedropper commits, so the canvas previews live. Writing the
      // rule emits 'project:css-changed', which re-renders this sub-panel and
      // detaches `chip` — the picker itself lives in the modal layer and
      // survives, and every value below is re-read from live state, so the
      // detached node only costs us the chip repaint (harmless).
      onChange: next => {
        const value = String(next ?? '').trim()
        chip.dataset.customColorValue = value
        paintChip(chip, value)
        // Drop the Bootstrap class only when one is actually set: setClass()
        // fires a change event, and re-firing it per keystroke would churn a
        // re-render of every open sub-panel for no state change.
        if (value && readGroup(component, classPattern)) {
          applyGroup(component, classPattern, null)
        }
        writeProjectRuleProps(selector, { [prop]: value })
      },
      onClose: () => requestRender?.()
    })
  })

  host.querySelector('[data-custom-color-clear]')?.addEventListener('click', () => {
    writeProjectRuleProps(selector, { [prop]: '' })
    requestRender?.()
  })
}

/**
 * Drop the custom colour for one property — called by the sub-panels when the
 * user picks a predetermined Bootstrap swatch instead.
 *
 * @param {string|null} selector - Whole selector for the rule.
 * @param {string} prop - CSS property to remove, e.g. 'color'.
 */
export function clearCustomColor(selector, prop) {
  writeProjectRuleProps(selector, { [prop]: '' })
}

// Paint the chip from a value: swatch fill, caption, and the active outline.
// `transparent` keeps an unset chip readable against the panel background.
function paintChip(chip, value) {
  const swatch = chip.querySelector('[data-custom-color-swatch]')
  swatch?.style.setProperty('--swatch', value || 'transparent')
  const caption = chip.querySelector('.gstrap-sm-custom-chip-label')
  if (caption) caption.textContent = value || t('sm.custom-pick')
  chip.classList.toggle('is-active', !!value)
  chip.title = value || t('sm.custom-pick')
}

function escAttr(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') }
function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
