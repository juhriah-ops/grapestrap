// =============================================================
// PATH: src/main/copy-tasks.js
// ROLE: Shared idempotent copy helpers — copyFilesIdempotent (explicit
//       [src,dst] tuples) was extracted from the body of project-manager.js
//       copyFrameworkAssets (Wave 4) once a second consumer appeared; today
//       that second consumer is ipc-handlers.js sections:copy-assets (bundled
//       Library sections' images). copyDirIdempotent (whole-tree walk) was
//       added for starter asset bundles (starters/<name>/**, incl. binaries).
//       Skip-if-exists semantics are identical in both: never clobber an
//       asset the user may have hand-edited; collect failures for the caller
//       to aggregate into one actionable error.
// DEPENDS: node:fs, node:path
// CREATED: 2026-07-12 (Wave 4)
// UPDATED: 2026-08-02 — copyDirIdempotent added (Graphite starter bundle)
// UPDATED: 2026-08-19 — copyVendorAssets (starters/index.js) retired with the
//          first-wave starters; ROLE now names the live second consumer
// =============================================================

import { promises as fsp } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Copy [src, dst, fatal?] tuples, skipping any dst that already exists.
 * Ensures each dst's parent directory. Returns the list of fatal failures
 * as "src → dst: code" strings — empty array means success. Non-fatal
 * misses (optional source maps, .min variants) are silently skipped, same
 * as copyFrameworkAssets has always done.
 */
export async function copyFilesIdempotent(tasks) {
  const fatal = []
  for (const [src, dst, isFatal] of tasks) {
    // Idempotent: skip if dst already exists (see copyFrameworkAssets'
    // original rationale — re-runs from loadProject must not clobber
    // user-edited files). Manual existence check for clearer errors.
    try { await fsp.access(dst); continue } catch { /* dst missing, copy */ }
    try {
      await fsp.mkdir(dirname(dst), { recursive: true })
      await fsp.copyFile(src, dst)
    } catch (err) {
      if (isFatal) fatal.push(`${src} → ${dst}: ${err?.code || err?.message || err}`)
    }
  }
  return fatal
}

/**
 * Recursively copy a directory tree, skipping any destination file that
 * already exists. Used for starter asset bundles (starters/<name>/**), which
 * unlike the vendor tuples above are an open-ended tree of text AND binary
 * files (woff2, jpg) whose contents this layer never needs to know about.
 *
 * Deliberately walks with readdir + copyFile instead of fsp.cp: in a packaged
 * build the source lives inside app.asar, and Electron's patched fs implements
 * the individual readdir/copyFile calls against the archive — fsp.cp is not
 * asar-aware and fails there. Same reason copyFrameworkAssets copies
 * file-by-file out of node_modules.
 *
 * @param {string} srcDir - Absolute source directory (may be inside app.asar)
 * @param {string} dstDir - Absolute destination directory (created as needed)
 * @returns {Promise<string[]>} Failure strings ("src → dst: code"); empty
 *                              array means every file copied or was skipped
 *                              because it already existed.
 */
export async function copyDirIdempotent(srcDir, dstDir) {
  const failures = []

  // An unreadable source directory is reported rather than thrown so one bad
  // subdirectory doesn't abort the rest of the bundle; callers that treat a
  // missing top-level bundle as fatal check for it before calling in.
  let entries
  try {
    entries = await fsp.readdir(srcDir, { withFileTypes: true })
  } catch (err) {
    return [`${srcDir} → ${dstDir}: ${err?.code || err?.message || err}`]
  }

  try {
    await fsp.mkdir(dstDir, { recursive: true })
  } catch (err) {
    return [`${srcDir} → ${dstDir}: ${err?.code || err?.message || err}`]
  }

  for (const entry of entries) {
    const src = join(srcDir, entry.name)
    const dst = join(dstDir, entry.name)

    if (entry.isDirectory()) {
      failures.push(...await copyDirIdempotent(src, dst))
      continue
    }

    // Idempotent: an existing dst wins, always (the user may have edited the
    // bundled theme.css since the project was created).
    try { await fsp.access(dst); continue } catch { /* dst missing, copy */ }

    // Everything non-directory goes through copyFile — symlinked assets get
    // dereferenced into a real file, which is what a deployable site/ wants.
    // Anything genuinely uncopyable (socket, fifo, broken link) surfaces as a
    // failure string instead of being silently dropped from the bundle.
    try {
      await fsp.copyFile(src, dst)
    } catch (err) {
      failures.push(`${src} → ${dst}: ${err?.code || err?.message || err}`)
    }
  }

  return failures
}
