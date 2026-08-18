/**
 * GrapeStrap — Marker-guarded CSS chunk append (project globalCSS)
 *
 * PATH: src/renderer/editor/css-chunks.js
 * ROLE: The one place that appends a bundled section's stylesheet payload to
 *       the project's custom CSS. Each chunk is fenced by a marker comment
 *       line so a second insert of the same section is a no-op instead of a
 *       duplicate rule block.
 * DEPENDS: nothing at module scope — pure string functions.
 * CREATED: 2026-08-17
 *
 * Deliberately import-free so `node --test` can load it directly with no
 * bundler in front of it (same reasoning as editor/placement.js and
 * shared/page-html.js).
 *
 * Contract, in full:
 *   - A chunk is `{ marker, text }`. `marker` is a short namespaced key
 *     ('orbit-base', 'graphite-hero'); `text` is the CSS rules themselves.
 *   - Presence is decided by ONE thing: does the stylesheet already contain a
 *     line that is exactly the marker key wrapped in a CSS comment —
 *     `gs-sec:<marker>` between the comment delimiters, nothing else on the
 *     line? Nothing else is read, and the chunk BODY is never compared,
 *     re-written, or diffed. That is the whole point: the user is free to
 *     edit — or gut — the rules under a marker in the Custom CSS panel and
 *     re-inserting the section will not undo their work. The marker is a
 *     receipt, not a checksum.
 *   - The appended shape is a blank line, the marker line, the chunk text,
 *     and a trailing newline, always at the END of the stylesheet — so chunk
 *     order follows insert order and the user's own rules keep whatever
 *     cascade position they already had.
 *   - Deleting the marker line (or the whole block) in the Custom CSS panel is
 *     the supported "I don't want this" gesture: the next insert re-appends.
 */

// The fence comment. Built here rather than spelled out at each call site so
// the append format and the presence check can never drift apart.
function markerLine(marker) {
  return `/* gs-sec:${marker} */`
}

/**
 * Is a chunk marker already present in this stylesheet?
 *
 * Matches on a whole line (leading/trailing whitespace ignored) rather than a
 * substring, so a marker mentioned inside somebody's own comment prose, or a
 * longer marker that merely starts with this one, does not read as present.
 *
 * @param {string} css - Stylesheet text to search (nullish tolerated)
 * @param {string} marker - Chunk marker, e.g. 'orbit-hero'
 * @returns {boolean} true when the exact marker line exists
 */
export function hasChunk(css, marker) {
  if (!isUsableMarker(marker)) return false
  const wanted = markerLine(marker)
  return String(css ?? '').split('\n').some(line => line.trim() === wanted)
}

/**
 * Append every chunk that isn't already present, in order.
 *
 * @param {string} existingCss - Current project globalCSS (nullish tolerated)
 * @param {Array<{marker: string, text: string}>} chunks - Chunks to ensure
 * @returns {{css: string, changed: boolean}} The (possibly unchanged)
 *          stylesheet and whether anything was actually appended. `changed`
 *          is the caller's cue to mark the project dirty and emit — when it
 *          is false the returned css is character-for-character the input.
 */
export function appendCssChunks(existingCss, chunks) {
  const startingCss = String(existingCss ?? '')
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return { css: startingCss, changed: false }
  }

  let css = startingCss
  let changed = false

  for (const chunk of chunks) {
    const marker = chunk?.marker
    // A malformed marker is skipped rather than thrown or written: markers
    // land inside a CSS comment, so a newline or a stray comment terminator
    // would break out of the fence and corrupt the user's stylesheet. Section
    // data is authored in-repo, so this is a lint-grade guard, not a user path.
    if (!isUsableMarker(marker)) continue
    // Re-checked against the GROWING css, not the original, so a chunks array
    // that repeats a marker still appends it exactly once.
    if (hasChunk(css, marker)) continue
    css += `\n${markerLine(marker)}\n${String(chunk?.text ?? '')}\n`
    changed = true
  }

  return { css, changed }
}

/**
 * A marker must be a non-empty string that survives being embedded in a CSS
 * comment on a line of its own.
 * @param {*} marker - Candidate marker
 * @returns {boolean}
 */
function isUsableMarker(marker) {
  if (typeof marker !== 'string') return false
  const trimmed = marker.trim()
  if (trimmed === '' || trimmed !== marker) return false
  return !/[\r\n]/.test(marker) && !marker.includes('*/')
}
