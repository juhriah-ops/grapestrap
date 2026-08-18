// =============================================================
// PATH: src/shared/bs-version.js
// ROLE: Bootstrap-major version comparison for the soft compat gate —
//       pure functions shared by main (manifest stamping,
//       project-manager.js) and renderer (insert-section.js gate,
//       panels/library-items/index.js gate). No DOM, no fs, no Electron
//       API — safe to import from either process or a plain node:test file.
// DEPENDS: nothing
// CREATED: 2026-08-18
//
// Warning-only by design (user-decided, A-WP2): sections and library items
// use only stable Bootstrap core classes (grid/utilities/navbar/dropdown/
// offcanvas), so a MINOR version drift between a section's authored
// Bootstrap and the project's own copy is safe to ignore. Only a MAJOR
// mismatch is worth interrupting the user for, and even then it never
// blocks — see isMajorMismatch below and editor/insert-section.js's gate.
// =============================================================

/**
 * Parse the leading major-version number out of a Bootstrap version string.
 *
 * @param {string|null|undefined} version - e.g. '5.3.3', 'legacy', 'unknown'
 * @returns {number|null} The major version as a number, or null when `version`
 *          is not a real dotted version string (absent, 'legacy', 'unknown',
 *          or any other non-numeric-leading value).
 */
export function parseMajor(version) {
  if (typeof version !== 'string') return null
  const match = /^(\d+)\./.exec(version.trim())
  if (!match) return null
  return Number(match[1])
}

/**
 * Decide whether a bundled section / library item's Bootstrap major differs
 * from the project's own — the sole trigger for the insert-time confirm
 * dialog.
 *
 * Rules (both must hold for anything to warn):
 *   1. The item must carry a real numeric major. An unstamped item (no
 *      `bootstrapVersion` field at all, or a non-numeric one) NEVER warns —
 *      there is nothing to compare it against, so silence is correct, not a
 *      missed check.
 *   2. Given a numeric item major, a mismatch is either:
 *      - the project ALSO has a numeric major and it differs from the
 *        item's, or
 *      - the project's major is unknown ('legacy', 'unknown', absent, or
 *        any other non-numeric value) — an unknown project compat state is
 *        treated as "could be a mismatch", so it warns too.
 *
 * @param {string|null|undefined} itemVersion - The section/library item's
 *        stamped `bootstrapVersion`
 * @param {string|null|undefined} projectVersion - The open project's
 *        `manifest.bootstrapVersion`
 * @returns {boolean} true when the insert-time confirm dialog should show
 */
export function isMajorMismatch(itemVersion, projectVersion) {
  const itemMajor = parseMajor(itemVersion)
  if (itemMajor === null) return false

  const projectMajor = parseMajor(projectVersion)
  if (projectMajor === null) return true

  return projectMajor !== itemMajor
}
