/**
 * GrapeStrap — E2E global teardown
 *
 * PATH: tests/e2e/global-teardown.js
 * ROLE: Sweep leftover gstrap-* scratch dirs out of the OS tmpdir after the
 *       suite finishes. The per-launch cleanup in helpers.js (app 'close' →
 *       async rm) is best-effort and loses the race when the worker process
 *       exits before the rm completes — 687 leaked dirs (2.5G) filled nola2's
 *       2.7G /tmp partition on 2026-08-11 and broke disk-writing specs, the
 *       same failure mode .212's tmpfs hit on 2026-07-12. Runs after all
 *       specs (workers: 1, serial), so nothing can still hold these dirs.
 * DEPENDS: node:fs, node:os, node:path
 * CREATED: 2026-08-11
 */
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export default async function globalTeardown() {
  const root = tmpdir()
  let entries = []
  try {
    entries = await fsp.readdir(root)
  } catch {
    return
  }
  await Promise.all(entries
    .filter(name => name.startsWith('gstrap-'))
    .map(name => fsp.rm(join(root, name), { recursive: true, force: true }).catch(() => {}))
  )
}
