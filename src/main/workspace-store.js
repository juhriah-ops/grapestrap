/**
 * GrapeStrap — Workspace layout store (main process)
 *
 * PATH: src/main/workspace-store.js
 * ROLE: list/read/write/delete/rename for saved workspace layouts — one JSON
 *       per layout at $XDG_STATE_HOME/GrapeStrap/workspaces/<slug>.json.
 *       Name/slug validation lives HERE (main never trusts renderer input);
 *       the renderer duplicates the regex only for inline dialog UX.
 * DEPENDS: electron (app.getVersion), platform/xdg.js, logger.js
 * CREATED: 2026-07-12
 *
 * File format (formatVersion 1):
 *   { formatVersion, name, savedAt, appVersion, visibility: {prefKey:bool},
 *     gl: <GL 2.6 LayoutConfig from saveLayout()→fromResolved()> }
 *
 * Failure posture (PLAN.md §5): every per-file I/O is try/caught. A corrupt /
 * unreadable / mis-slugged file is skipped by list (logged, filename surfaced
 * in `skipped[]` so the renderer can toast once per boot) and read fails soft
 * with { ok:false, error } so apply can fail open. Results are plain
 * serializable objects with short error codes ('bad-name', 'name-preset',
 * 'name-taken', 'not-found', 'corrupt', 'io') the renderer maps to i18n keys.
 */

import { app } from 'electron'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { xdg } from './platform/xdg.js'
import { log } from './logger.js'

// Charset kills path traversal before slugging (mirrors the Wave-2 new-page
// name fix); 41 chars max. ASCII-only for v0.1.0 — loosening later is a
// regex change here + in renderer/layout/workspaces.js.
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,40}$/

// Preset names are code-built (renderer/layout/workspaces.js), never files —
// saved names may not shadow them, compared at slug level so "designer"
// collides with "Designer".
const PRESET_SLUGS = new Set(['designer', 'coder', 'compact'])

const FORMAT_VERSION = 1

export function slugForName(name) {
  return String(name).toLowerCase().replace(/ /g, '-')
}

/** null when valid, else an error code. */
export function validateWorkspaceName(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) return 'bad-name'
  if (PRESET_SLUGS.has(slugForName(name))) return 'name-preset'
  return null
}

function fileFor(slug) {
  return join(xdg.workspacesDir, `${slug}.json`)
}

/** Shape gate shared by list and read. Geometry-level validation (registered
 *  componentTypes, root walk) is the renderer's job at apply time. */
function isWorkspaceShaped(obj) {
  return !!obj
    && typeof obj === 'object' && !Array.isArray(obj)
    && obj.formatVersion === FORMAT_VERSION
    && typeof obj.name === 'string' && NAME_RE.test(obj.name)
    && !!obj.gl && typeof obj.gl === 'object' && !!obj.gl.root
}

async function ensureDir() {
  // ensureXdgDirs made it at boot; re-mkdir before writes in case the dir
  // was deleted at runtime (F9).
  await fsp.mkdir(xdg.workspacesDir, { recursive: true })
}

/** { ok:true, names: string[] (sorted), skipped: string[] (filenames) } —
 *  a missing dir lists as empty, never throws. */
export async function listWorkspaces() {
  let entries = []
  try {
    entries = await fsp.readdir(xdg.workspacesDir)
  } catch (err) {
    if (err?.code !== 'ENOENT') log.warn('workspaces: list readdir failed:', err?.message || err)
    return { ok: true, names: [], skipped: [] }
  }
  const names = []
  const skipped = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    try {
      const raw = await fsp.readFile(join(xdg.workspacesDir, entry), 'utf8')
      const obj = JSON.parse(raw)
      // A file whose basename doesn't match its own name's slug can't be
      // resolved back by name — treat as corrupt rather than list a dead row.
      if (!isWorkspaceShaped(obj) || `${slugForName(obj.name)}.json` !== entry) {
        skipped.push(entry)
        continue
      }
      names.push(obj.name)
    } catch (err) {
      log.warn(`workspaces: skipping unreadable/corrupt ${entry}:`, err?.message || err)
      skipped.push(entry)
    }
  }
  names.sort((a, b) => a.localeCompare(b))
  return { ok: true, names, skipped }
}

/** { ok:true, workspace } | { ok:false, error } — read failure fails soft so
 *  the renderer's apply can fail open (F1). */
export async function readWorkspace(name) {
  const invalid = validateWorkspaceName(name)
  if (invalid) return { ok: false, error: invalid }
  let raw
  try {
    raw = await fsp.readFile(fileFor(slugForName(name)), 'utf8')
  } catch (err) {
    return { ok: false, error: err?.code === 'ENOENT' ? 'not-found' : 'io' }
  }
  try {
    const obj = JSON.parse(raw)
    if (!isWorkspaceShaped(obj)) return { ok: false, error: 'corrupt' }
    return { ok: true, workspace: obj }
  } catch {
    return { ok: false, error: 'corrupt' }
  }
}

/** payload = { name, visibility, gl }. Duplicate name → refusal, never a
 *  silent overwrite (PLAN.md §3.6). */
export async function writeWorkspace(payload) {
  const name = payload?.name
  const invalid = validateWorkspaceName(name)
  if (invalid) return { ok: false, error: invalid }
  if (!payload?.gl || typeof payload.gl !== 'object' || !payload.gl.root) {
    return { ok: false, error: 'corrupt' }
  }
  const slug = slugForName(name)
  const target = fileFor(slug)
  try {
    await ensureDir()
    try {
      await fsp.access(target)
      return { ok: false, error: 'name-taken' }
    } catch { /* ENOENT — free slot, proceed */ }
    const record = {
      formatVersion: FORMAT_VERSION,
      name,
      savedAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      visibility: (payload.visibility && typeof payload.visibility === 'object') ? payload.visibility : {},
      gl: payload.gl
    }
    await fsp.writeFile(target, JSON.stringify(record, null, 2), 'utf8')
    log.info(`workspaces: saved "${name}" → ${slug}.json`)
    return { ok: true, name, slug }
  } catch (err) {
    log.warn(`workspaces: write "${name}" failed:`, err?.message || err)
    return { ok: false, error: 'io' }
  }
}

export async function deleteWorkspace(name) {
  const invalid = validateWorkspaceName(name)
  if (invalid) return { ok: false, error: invalid }
  try {
    await fsp.unlink(fileFor(slugForName(name)))
    log.info(`workspaces: deleted "${name}"`)
    return { ok: true }
  } catch (err) {
    // Vanished-on-disk (deleted externally, F5): report so the renderer can
    // toast + refresh the menu list back to truth.
    return { ok: false, error: err?.code === 'ENOENT' ? 'not-found' : 'io' }
  }
}

/** read old → write under the new slug (name + savedAt updated) → unlink old.
 *  Ordered so a crash mid-rename leaves at worst BOTH files, never neither. */
export async function renameWorkspace(oldName, newName) {
  const invalidNew = validateWorkspaceName(newName)
  if (invalidNew) return { ok: false, error: invalidNew }
  const read = await readWorkspace(oldName)
  if (!read.ok) return read
  const newSlug = slugForName(newName)
  const target = fileFor(newSlug)
  try {
    if (newSlug !== slugForName(oldName)) {
      try {
        await fsp.access(target)
        return { ok: false, error: 'name-taken' }
      } catch { /* free slot */ }
    }
    await ensureDir()
    const record = { ...read.workspace, name: newName, savedAt: new Date().toISOString() }
    await fsp.writeFile(target, JSON.stringify(record, null, 2), 'utf8')
    if (newSlug !== slugForName(oldName)) {
      await fsp.unlink(fileFor(slugForName(oldName)))
    }
    log.info(`workspaces: renamed "${oldName}" → "${newName}"`)
    return { ok: true, name: newName, slug: newSlug }
  } catch (err) {
    log.warn(`workspaces: rename "${oldName}" → "${newName}" failed:`, err?.message || err)
    return { ok: false, error: 'io' }
  }
}
