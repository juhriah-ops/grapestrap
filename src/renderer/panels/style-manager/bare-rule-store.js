/**
 * GrapeStrap — Style Manager: project-CSS access for arbitrary style values
 *
 * PATH: src/renderer/panels/style-manager/bare-rule-store.js
 * ROLE: The one place Style Manager sub-panels read and write a component's
 *       bare-state rule in project `style.css`. Bootstrap utility classes
 *       cover the predetermined values; anything free-form (a hand-picked
 *       colour, an opacity between the 0/25/50/75/100 steps) becomes a real
 *       declaration on `<selector> { … }` in the project stylesheet — never
 *       an inline style, so the value stays portable and hand-editable.
 * DEPENDS: ./css-rule-utils.js, ../../state/project-state.js,
 *          ../../state/event-bus.js
 * CREATED: 2026-08-17
 *
 * Write path mirrors the Background sub-panel's: merge only our prop group
 * into the existing rule, then mark the stylesheet dirty and announce it.
 * `project:css-changed` is what re-injects globalCSS into the canvas iframe
 * (grapesjs-init.js), so emitting it IS the live preview.
 */

import { readBareRule, mergeBareRuleProps } from './css-rule-utils.js'
import { projectState } from '../../state/project-state.js'
import { eventBus } from '../../state/event-bus.js'

/**
 * Read the whole bare-state rule for `selector` out of the open project.
 *
 * @param {string|null} selector - Whole selector, e.g. '.cta-link'.
 * @returns {object} Declarations as { prop: value }; {} when there is no
 *                   open project, no selector, or no such rule.
 */
export function readProjectRule(selector) {
  // No project open is the normal state before a file is loaded — callers
  // render their "needs a selector/project" hint rather than treating it as
  // an error.
  if (!selector || !projectState.current) return {}
  return readBareRule(projectState.current.globalCSS || '', selector)
}

/**
 * Merge a prop group into `selector`'s bare-state rule and publish the change.
 * Props with an empty value are removed — that is how the Clear affordances
 * erase one property without disturbing the rest of the rule.
 *
 * @param {string|null} selector - Whole selector, e.g. '.cta-link'.
 * @param {object} props - Prop group to merge, e.g. { opacity: '0.5' }.
 * @returns {boolean} true when the stylesheet was updated, false when there
 *                    was nothing to write to (no project / no selector) or the
 *                    merge changed nothing.
 */
export function writeProjectRuleProps(selector, props) {
  if (!selector || !projectState.current) return false
  const css = projectState.current.globalCSS || ''
  const next = mergeBareRuleProps(css, selector, props)
  // A no-op merge must stay silent. The mutual-exclusion clears fire on every
  // swatch/pill click whether or not a free value was ever set; without this
  // guard each of those clicks would flag the stylesheet dirty and prompt an
  // unsaved-changes warning for an edit that never happened.
  if (next === css) return false
  projectState.current.globalCSS = next
  projectState.markCssDirty()
  eventBus.emit('project:css-changed')
  return true
}
