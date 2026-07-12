// =============================================================
// PATH: src/main/git-status.js
// ROLE: Per-project git status service — repo probe + status + payload
//       mapping with trailing debounce, single-flight coalescing,
//       generation-token staleness guard, and log-only failure backoff
//       (Wave 3 git-status indicator)
// DEPENDS: simple-git (externalized in vite.config.js), logger.js
// CREATED: 2026-07-12
// =============================================================
//
// Module-level singleton, same lifecycle as file-operations.js: bound per
// project by bindProjectWatcher (ipc-handlers.js), replaced on project
// swap, never explicitly closed (no project-close path exists — projects
// end by replacement or app quit).
//
// `checkIsRepo('root')` is re-probed EVERY cycle on purpose: chokidar
// ignores dotdirs, so a terminal-side `git init`/`commit` fires no watcher
// events — the re-probe (plus window-focus refresh and manual git:refresh)
// is what bounds that staleness (PLAN.md §3.4). The 'root' probe also
// guards perf: a project nested inside a monster ancestor repo renders
// nothing instead of running `-uall` status against it (F6).

import { simpleGit } from 'simple-git'
import { log } from './logger.js'

const DEBOUNCE_MS = 750        // trailing debounce off chokidar events + saves
const GIT_BLOCK_TIMEOUT_MS = 5000  // kills a hung git child (F4: index.lock, NFS)
const PATH_CAP = 2000          // per-bucket path cap (F10: pathological repos)
const MAX_FAILURES = 3         // consecutive failures → disabled until next bind

let git = null            // simpleGit instance for the bound projectDir
let boundDir = null       // for log context only
let pushFn = null         // broadcast callback supplied by ipc-handlers
let generation = 0        // bind token — stale async results are discarded
let debounceTimer = null
let inFlight = null       // promise of the running drain (single-flight)
let pending = false       // a run was requested while one was in flight
let failures = 0
let disabled = false      // backoff tripped — pushes stop until next bind
let warned = false        // log.warn once per bind (F1)

/**
 * Bind (or re-bind) the service to a project root and push one immediate
 * status — the branch cell must paint on open without any watcher event.
 */
export async function bindGitStatus(projectDir, push) {
  generation += 1
  clearTimeout(debounceTimer)
  debounceTimer = null
  pending = false
  failures = 0
  disabled = false
  warned = false
  boundDir = projectDir
  pushFn = push
  git = simpleGit({ baseDir: projectDir, timeout: { block: GIT_BLOCK_TIMEOUT_MS } })
  await runStatus()
}

/**
 * Debounced re-probe + re-status. Wired to the project watcher callback and
 * the project:save handler (V8: redundant with chokidar by design) and to
 * browser-window-focus (V3: catches terminal git ops on alt-tab-back).
 */
export function notifyChange() {
  if (!git || disabled) return
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { runStatus() }, DEBOUNCE_MS)
}

/**
 * Immediate probe+status for the git:refresh IPC. Resolves with the wire
 * payload, or null when no project is bound / the backoff tripped (F11:
 * never throws across the bridge).
 */
export async function refreshNow() {
  if (!git || disabled) return null
  clearTimeout(debounceTimer)
  debounceTimer = null
  return runStatus()
}

// Single-flight: one drain loop at a time; requests landing mid-run set
// `pending` and share the drain's promise, which re-runs once more before
// resolving — max one queued re-run no matter how many callers (F9).
function runStatus() {
  if (disabled || !git) return Promise.resolve(null)
  if (inFlight) {
    pending = true
    return inFlight
  }
  inFlight = drain().finally(() => { inFlight = null })
  return inFlight
}

async function drain() {
  let payload = null
  do {
    pending = false
    payload = await runOnce(generation)
  } while (pending && git && !disabled)
  return payload
}

async function runOnce(gen) {
  let payload = { repo: false }
  try {
    const isRepo = await git.checkIsRepo('root')
    if (gen !== generation) return null
    if (isRepo) {
      const status = await git.status(['--untracked-files=all'])
      if (gen !== generation) return null
      payload = mapStatus(status)
    }
    failures = 0
  } catch (err) {
    // F1/F2/F4: git binary absent, corrupt .git, block-timeout kill — the
    // UI degrades to non-repo (renders nothing); the app stays functional.
    failures += 1
    if (!warned) {
      warned = true
      log.warn(`git-status: status failed for ${boundDir}: ${err?.message || err}`)
    }
    if (failures >= MAX_FAILURES && !disabled) {
      disabled = true
      log.warn('git-status: disabled after 3 consecutive failures (until next project bind)')
    }
    payload = { repo: false }
  }
  if (gen !== generation) return null
  pushFn?.(payload)
  return payload
}

// Map a simple-git StatusResult to the wire payload (PLAN.md §2.2). Done
// main-side so the renderer stays dumb. Repo root == projectDir (the 'root'
// probe guarantees it), so porcelain paths are already project-relative.
function mapStatus(status) {
  // V1 two-state taxonomy: untracked = new files staged or not (new wins);
  // changed = everything else including staged edits — no in-app action
  // exists to act on the staged/unstaged difference in v0.1.0.
  const untrackedSet = new Set([...(status.not_added || []), ...(status.created || [])])
  const changedSet = new Set()
  for (const p of status.modified || []) changedSet.add(p)
  for (const p of status.deleted || []) changedSet.add(p)
  // F12: renamed[] entries are {from,to} objects, not strings.
  for (const r of status.renamed || []) changedSet.add(r?.to ?? r)
  for (const p of status.conflicted || []) changedSet.add(p)
  for (const p of untrackedSet) changedSet.delete(p)

  const untracked = [...untrackedSet]
  const changed = [...changedSet]
  const truncated = untracked.length > PATH_CAP || changed.length > PATH_CAP

  return {
    repo: true,
    branch: status.current || 'HEAD',   // unborn branch parses to its name (F5);
    detached: !!status.detached,        // detached → 'HEAD' (V5)
    tracking: status.tracking || null,  // null ⇔ no upstream ⇔ arrows never render
    ahead: status.ahead || 0,
    behind: status.behind || 0,
    changed: changed.slice(0, PATH_CAP),
    untracked: untracked.slice(0, PATH_CAP),
    truncated
  }
}
