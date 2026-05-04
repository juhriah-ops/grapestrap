/**
 * GrapeStrap — class-mutation helpers for the Style Manager
 *
 * GrapesJS stores classes as a Backbone Collection of Selector models on the
 * component. The component-facing API is `getClasses()` (string[]) and
 * `setClass(string[])` (replaces the whole list). All Style Manager sub-panels
 * route through this module so:
 *
 *   - "select one of N from this group" works deterministically (we strip every
 *     class matching the group's pattern, then add the chosen one).
 *   - "clear this group" is a single call.
 *   - The undo history captures one entry per user action — we batch the
 *     remove + add into one editor.UndoManager.add via
 *     `getEditor().UndoManager.add()` is implicit because setClass() is one
 *     model write.
 */

/**
 * Read the current class from the group whose names match `pattern`.
 * Returns the *first* matching class on the component, or '' if none.
 * (BS utilities are mutually exclusive within their group, so first-match is
 * fine.)
 */
export function readGroup(component, pattern) {
  if (!component) return ''
  const all = component.getClasses() || []
  for (const c of all) if (pattern.test(c)) return c
  return ''
}

/**
 * Read all classes matching `pattern` (used for groups that legitimately allow
 * multiple, e.g. text-decoration-underline AND text-decoration-line-through is
 * NOT a real case in BS, but margin-side selections like `mt-3 mb-5` ARE
 * — the spacing panel reads per-side patterns).
 */
export function readGroupAll(component, pattern) {
  if (!component) return []
  return (component.getClasses() || []).filter(c => pattern.test(c))
}

/**
 * Replace the matched group's classes with a single new value (or remove
 * altogether if `nextClass` is empty / null).
 *
 * Returns the resulting class array so callers can use it for follow-up logic.
 */
export function applyGroup(component, pattern, nextClass) {
  if (!component) return []
  const cur = component.getClasses() || []
  const filtered = cur.filter(c => !pattern.test(c))
  const next = nextClass ? [...new Set([...filtered, nextClass])] : filtered
  component.setClass(next)
  return next
}

/**
 * Toggle a single class on/off. For independent boolean groups
 * (e.g. text-decoration-underline).
 */
export function toggleClass(component, cls) {
  if (!component || !cls) return
  const cur = component.getClasses() || []
  const has = cur.includes(cls)
  const next = has ? cur.filter(c => c !== cls) : [...cur, cls]
  component.setClass(next)
  return next
}

/**
 * Returns true if the component has any class matching `pattern`.
 * Used for "is the flex panel enabled" gating (display includes d-flex).
 */
export function hasGroup(component, pattern) {
  return !!readGroup(component, pattern)
}
