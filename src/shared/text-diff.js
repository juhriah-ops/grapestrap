/**
 * GrapeStrap — Minimal single-range text edit (shared, dependency-free)
 *
 * PATH: src/shared/text-diff.js
 * ROLE: Reduces "replace the whole buffer with this new string" to the
 *       smallest single contiguous replacement that produces the same result,
 *       by trimming the common prefix and common suffix. The design→code sync
 *       (editor/canvas-sync.js) applies its rewrites through this so Monaco
 *       gets a surgical edit instead of a full-document `setValue`.
 *
 *       Why it matters: `model.setValue()` calls `_commandManager.clear()` —
 *       it DESTROYS the model's undo stack, and resets cursor + scroll. In
 *       Split view the design→code sync fires on every canvas edit, so every
 *       canvas edit was wiping the code pane's undo history and throwing the
 *       caret back to line 1 (diagnosed 2026-08-17, scenarios S2/S6).
 *       A prefix/suffix-trimmed edit leaves everything outside the changed
 *       region untouched, so Monaco keeps history, caret, scroll and folding.
 *
 *       Kept pure and DOM-free so `npm run test:unit` can exercise it without
 *       Electron or Monaco — see tests/unit/text-diff.test.js.
 * DEPENDS: nothing (plain JS — importable from main/, renderer/, and tests)
 * CREATED: 2026-08-17
 *
 * Deliberately NOT a real diff algorithm. A canvas edit rewrites one region of
 * a serialized document; prefix/suffix trimming captures that in O(n) with no
 * heuristics to tune. When a change is genuinely scattered (a reformat, a
 * framework-link rewrite) the trim degrades gracefully to "replace the span
 * between the first and last differing character" — still correct, just wider.
 */

/**
 * Compute the smallest single-range replacement turning `oldText` into
 * `newText`.
 *
 * @param {string} oldText - Current buffer contents.
 * @param {string} newText - Desired buffer contents.
 * @returns {{startOffset: number, endOffset: number, text: string}|null}
 *   Offsets are character indices into `oldText`; `[startOffset, endOffset)`
 *   is the span to replace with `text`. Returns null when the two strings are
 *   already identical (caller should skip the write entirely — an empty edit
 *   still pushes an undo stop in Monaco).
 */
export function computeMinimalTextEdit(oldText, newText) {
  // Coerce nullish to '' rather than throwing: callers read from editors that
  // can legitimately be empty or not yet constructed, and a sync that throws
  // would break the debounce chain for the rest of the session.
  const before = typeof oldText === 'string' ? oldText : ''
  const after = typeof newText === 'string' ? newText : ''

  if (before === after) return null

  const maxTrim = Math.min(before.length, after.length)

  let prefixLength = 0
  while (prefixLength < maxTrim && before[prefixLength] === after[prefixLength]) {
    prefixLength++
  }

  // Suffix scan stops at the prefix on BOTH strings — without that bound, a
  // change like 'aaa' → 'aaaa' would count the same characters as both prefix
  // and suffix and produce an inverted (endOffset < startOffset) range.
  let suffixLength = 0
  const maxSuffix = maxTrim - prefixLength
  while (
    suffixLength < maxSuffix &&
    before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  ) {
    suffixLength++
  }

  return {
    startOffset: prefixLength,
    endOffset: before.length - suffixLength,
    text: after.slice(prefixLength, after.length - suffixLength)
  }
}
