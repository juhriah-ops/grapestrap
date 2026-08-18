/**
 * GrapeStrap — Jump to a CSS rule in the Custom CSS / Bootstrap panels
 *
 * PATH: src/renderer/panels/style-manager/css-jump.js
 * ROLE: The one place that turns "this selector" into "that caret". Cascade
 *       rows and class chips know which sheet a rule came from and call
 *       jumpToCssRule() directly; callers that only have a class name (the
 *       DOM-tab "Go to class rule" item) call revealCssRule(), which searches
 *       the buffers first and jumps only on a hit.
 * DEPENDS: state/event-bus.js, state/project-state.js,
 *          layout/panel-visibility.js, panels/custom-css/index.js,
 *          panels/bootstrap-css/index.js, ./css-rule-utils.js, i18n.js, log.js
 * CREATED: 2026-08-18
 *
 * Import-order note: panel-visibility → golden-layout-config → the panel
 * factories → back here forms an import cycle. It is inert because nothing in
 * this module (or in panel-visibility) touches an imported binding at module
 * evaluation time — every use sits inside a function called long after boot.
 * Keep it that way: no top-level work here, so a lazy `import()` from another
 * workstream can load this module at any moment without an init-order trap.
 *
 * Why a real Monaco selection and not a decoration: this is explicit
 * navigation the user asked for. The "decorate, don't select" rule elsewhere
 * covers the passive follow-the-canvas highlight, which must not steal a
 * caret the user placed themselves.
 */

import { eventBus } from '../../state/event-bus.js'
import { projectState } from '../../state/project-state.js'
import { focusPanelTab } from '../../layout/panel-visibility.js'
import { getCssEditor } from '../custom-css/index.js'
import { getBootstrapCssEditor } from '../bootstrap-css/index.js'
import { findSelectorRange } from './css-rule-utils.js'
import { t } from '../../i18n.js'
import { log } from '../../log.js'

/**
 * The two jumpable stylesheet panels. `panelKey` is the GL componentType (also
 * the suffix of both the body hide class and the view-toggle event — the
 * naming is a convention view-toggles.js already relies on, kept explicit here
 * so a rename shows up as a mismatch instead of a silent no-op).
 *
 * Both editor getters are wrapped rather than referenced directly: this table
 * is built at module-evaluation time, and nothing imported through the cycle
 * described above should be TOUCHED that early.
 */
const JUMP_TARGETS = {
  'custom-css': {
    panelKey: 'custom-css',
    hideBodyClass: 'is-hide-custom-css',
    toggleEvent: 'view:toggle-custom-css',
    getEditor: () => getCssEditor(),
    readBuffer: () => projectState.current?.globalCSS
  },
  'bootstrap-css': {
    panelKey: 'bootstrap-css',
    hideBodyClass: 'is-hide-bootstrap-css',
    toggleEvent: 'view:toggle-bootstrap-css',
    getEditor: () => getBootstrapCssEditor(),
    // Absent (not '') on a project that vendors its own framework — there is
    // no app-managed Bootstrap sheet to jump into.
    readBuffer: () => projectState.current?.bootstrapCSS
  }
}

/**
 * Reveal a selector's rule in one of the stylesheet panels: un-hide the panel
 * if the user has it toggled off, bring its tab forward, then select the
 * selector text in Monaco and scroll it into view.
 *
 * @param {'custom-css'|'bootstrap-css'} target - Which sheet to jump into
 * @param {string} selector - Selector text as written, e.g. '.cta-link'
 * @returns {Promise<boolean>} true when a selection landed on the selector;
 *          false (plus a toast) when the target is unknown, the panel has
 *          never rendered, or the sheet does not contain the selector.
 */
export async function jumpToCssRule(target, selector) {
  const def = JUMP_TARGETS[target]
  if (!def || !selector) return false

  // Hidden panel: the view toggle is the only thing that knows how to restore
  // a collapsed right stack as well as the tab. Precedent: main.js's
  // 'linked-files:open-globalcss' listener.
  if (document.body.classList.contains(def.hideBodyClass)) {
    eventBus.emit(def.toggleEvent)
  }
  focusPanelTab(def.panelKey)

  const editor = def.getEditor()
  if (!editor) {
    // Panel never rendered — a saved workspace can omit it entirely.
    toastMiss()
    return false
  }

  let range = null
  try {
    // The editor buffer, not the state buffer: they agree by the panel's
    // debounce contract, but the offsets have to be against the exact text
    // the model holds or the selection lands off by the difference.
    range = findSelectorRange(editor.getValue(), selector)
  } catch (err) {
    log.warn('css-jump: could not read the target editor buffer', err)
  }
  if (!range) {
    toastMiss()
    return false
  }
  return await selectRangeAfterLayout(editor, range)
}

/**
 * Find a selector's rule across both stylesheet panels and jump to it.
 *
 * The search form of the API, for callers holding only a class name. Custom
 * CSS is searched first (the project's own rules are what a user means by
 * "the rule for this class"); `prefer` flips the order. Nothing is opened on
 * a miss — a menu item that quietly surfaces the wrong panel is worse than
 * one that reports it found nothing.
 *
 * Never throws: consumers wire it behind a lazy import and treat any failure
 * as "not found".
 *
 * @param {object} request
 * @param {string} request.selector - Selector text, e.g. '.card-title'
 * @param {'custom-css'|'bootstrap'} [request.prefer] - Sheet to search first
 *        ('bootstrap-css' and 'custom' are accepted spellings of the same two)
 * @returns {Promise<{found: boolean, where: 'custom-css'|'bootstrap'|null}>}
 */
export async function revealCssRule({ selector, prefer } = {}) {
  const miss = { found: false, where: null }
  try {
    if (!selector) return miss
    const order = String(prefer || '').startsWith('bootstrap')
      ? ['bootstrap-css', 'custom-css']
      : ['custom-css', 'bootstrap-css']

    for (const target of order) {
      const buffer = JUMP_TARGETS[target].readBuffer()
      if (typeof buffer !== 'string') continue
      if (!findSelectorRange(buffer, selector)) continue
      // The buffer says the rule is there, so this is the target: a failure
      // from here on is a panel problem, not a wrong-sheet problem, and
      // jumpToCssRule has already reported it.
      const jumped = await jumpToCssRule(target, selector)
      return jumped
        ? { found: true, where: target === 'custom-css' ? 'custom-css' : 'bootstrap' }
        : miss
    }
    return miss
  } catch (err) {
    log.warn('css-jump: reveal failed', err)
    return miss
  }
}

/**
 * Select `range` in a Monaco editor one frame after the tab activation that
 * preceded it. The delay is load-bearing: a tab that just became visible has
 * not been measured yet, and setSelection/reveal against a zero-height editor
 * scrolls to nothing. The Custom CSS factory rAF-layouts on re-parent for the
 * same reason.
 *
 * @param {object} editor - Monaco standalone code editor
 * @param {{start: number, end: number}} range - Offsets into the model text
 * @returns {Promise<boolean>} true when the selection was applied
 */
function selectRangeAfterLayout(editor, range) {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      try {
        const model = editor.getModel()
        if (!model) { resolve(false); return }
        const from = model.getPositionAt(range.start)
        const to = model.getPositionAt(range.end)
        const selection = {
          startLineNumber: from.lineNumber, startColumn: from.column,
          endLineNumber: to.lineNumber, endColumn: to.column
        }
        editor.setSelection(selection)
        // ...IfOutsideViewport: a rule already on screen keeps its position,
        // so a second jump inside the same neighbourhood doesn't jolt.
        editor.revealRangeInCenterIfOutsideViewport(selection)
        editor.focus()
        resolve(true)
      } catch (err) {
        // The editor can be mid-dispose (project close, workspace apply)
        // between the click and this frame.
        log.warn('css-jump: could not select the rule range', err)
        resolve(false)
      }
    })
  })
}

// Shared miss notice. One key across both workstreams (the DOM tab's
// "Go to class rule" reports misses with this exact string) so the user reads
// one sentence for one situation, however they got there.
function toastMiss() {
  eventBus.emit('toast', { type: 'warning', message: t('ctx.rule-not-found') })
}
