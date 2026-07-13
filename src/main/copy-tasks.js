// =============================================================
// PATH: src/main/copy-tasks.js
// ROLE: Shared idempotent file-copy loop — extracted from the body of
//       project-manager.js copyFrameworkAssets (Wave 4) now that a second
//       concrete consumer exists (starters/index.js copyVendorAssets).
//       Skip-if-exists semantics preserved verbatim: never clobber an asset
//       the user may have hand-edited; collect fatal misses for the caller
//       to aggregate into one actionable error.
// DEPENDS: node:fs, node:path
// CREATED: 2026-07-12 (Wave 4)
// =============================================================

import { promises as fsp } from 'node:fs'
import { dirname } from 'node:path'

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
