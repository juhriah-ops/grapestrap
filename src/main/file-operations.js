/**
 * GrapeStrap — File operations
 *
 * Renderer-facing fs surface, scoped to "the currently open project folder" wherever
 * possible. The renderer has no direct fs access — everything routes through here.
 *
 * Watcher (chokidar) reports external changes per project. Toast / reload UI is
 * handled by the renderer; this layer only emits events.
 */

import { promises as fsp } from 'node:fs'
import { resolve, relative, dirname, isAbsolute, join } from 'node:path'
import chokidar from 'chokidar'

let projectRoot = null
let watcher = null
let onChange = null

/**
 * realpath() of the deepest ancestor of `target` that actually exists.
 *
 * A write target usually does not exist yet, so realpath(target) would ENOENT.
 * The jail question is really about the directory chain that DOES exist —
 * that chain is what the kernel will walk (and follow symlinks through) when
 * the write finally happens.
 *
 * @param {string} target - absolute, already-normalized path
 * @returns {Promise<string>} real path of the deepest existing ancestor
 * @throws {Error} when nothing in the chain resolves, or on a non-ENOENT fs error
 */
async function realpathDeepestExisting(target) {
  let current = target
  for (;;) {
    try {
      return await fsp.realpath(current)
    } catch (err) {
      // Anything other than "not there yet" (EACCES, ELOOP, ENOTDIR) is a real
      // failure and must not be swallowed into a permissive answer.
      if (err?.code !== 'ENOENT') throw err
      const parent = dirname(current)
      // dirname('/') === '/': we walked to the filesystem root and found
      // nothing, so there is no chain to validate.
      if (parent === current) throw new Error(`cannot resolve path: ${target}`)
      current = parent
    }
  }
}

/**
 * Resolve a project-relative path and jail it to the project's REAL location.
 *
 * Two checks, because a lexical one alone is not a jail:
 *
 *  1. Lexical — rejects the plain "../.." spelling without touching the disk.
 *  2. Real — a symlink INSIDE the project is lexically innocent, but the
 *     kernel follows it: readFile/writeFile on "linkdir/x" land wherever
 *     linkdir points, which may be anywhere on the filesystem. Comparing real
 *     locations instead of spellings is what actually closes that.
 *
 * The caller gets the lexical path back, not the real one. It resolves to the
 * location just validated, and every caller reports results as projectRoot-
 * relative — returning real paths would give this module two different path
 * vocabularies for the same file (watcher events stay lexical).
 *
 * @param {string} p - project-relative path, or an absolute path inside the project
 * @returns {Promise<string>} absolute, normalized path safe to hand to fs
 * @throws {Error} when no project is open, or the path escapes the project root
 */
async function safePath(p) {
  if (!projectRoot) throw new Error('no project open')
  if (typeof p !== 'string' || p.length === 0) throw new Error('path is required')

  // Always resolve, even for absolute input. Handing an absolute path straight
  // through preserves its "symlink/.." segments, and the kernel expands the
  // symlink FIRST — so the ".." then climbs out of the project from wherever
  // the link pointed, past a check that only ever saw the spelling.
  const abs = resolve(projectRoot, p)

  const lexicalRel = relative(projectRoot, abs)
  if (lexicalRel.startsWith('..') || isAbsolute(lexicalRel)) {
    throw new Error(`path escapes project root: ${p}`)
  }

  const realRoot = await fsp.realpath(projectRoot)
  const realAncestor = await realpathDeepestExisting(abs)
  const realRel = relative(realRoot, realAncestor)
  // '' means the ancestor IS the root (e.g. listDir('.')) — allowed.
  if (realRel !== '' && (realRel.startsWith('..') || isAbsolute(realRel))) {
    throw new Error(`path escapes project root: ${p}`)
  }

  return abs
}

export async function readFile(path) {
  const abs = await safePath(path)
  return fsp.readFile(abs, 'utf8')
}

export async function writeFile(path, data) {
  const abs = await safePath(path)
  await fsp.mkdir(dirname(abs), { recursive: true })
  // Buffer / Uint8Array → write raw bytes; string → utf8. The asset-buffer
  // IPC path passes binary; everything else is HTML/CSS/JSON text.
  if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
    await fsp.writeFile(abs, data)
  } else {
    await fsp.writeFile(abs, data, 'utf8')
  }
  return { path: relative(projectRoot, abs) }
}

export async function deleteFile(path) {
  const abs = await safePath(path)
  await fsp.rm(abs, { recursive: true, force: true })
  return { path: relative(projectRoot, abs) }
}

/**
 * Copy a file from anywhere on disk INTO the project's asset folder.
 *
 * Deliberately asymmetric, and the asymmetry is the point: the DESTINATION is
 * jailed by safePath, the SOURCE is not. Importing an asset means reading a
 * file outside the project — that is the whole feature — and the source path
 * only ever arrives from a native file picker the user drove themselves.
 *
 * This is not a hole the AI tools can reach through: the agent's file surface
 * is read_file / write_file, and neither calls copyAsset. Keep it that way —
 * exposing this to a tool would hand the model an unjailed read of the user's
 * entire filesystem.
 *
 * @param {string} srcAbsolutePath - absolute source path, from a user file picker
 * @param {string} targetSubdir - project-relative asset subdirectory
 * @returns {Promise<{path: string}>} project-relative path of the copy
 */
export async function copyAsset(srcAbsolutePath, targetSubdir) {
  if (!isAbsolute(srcAbsolutePath)) {
    throw new Error('copyAsset requires an absolute source path')
  }
  const filename = srcAbsolutePath.split('/').pop()
  const dest = await safePath(join(targetSubdir, filename))
  await fsp.mkdir(dirname(dest), { recursive: true })
  await fsp.copyFile(srcAbsolutePath, dest)
  return { path: relative(projectRoot, dest) }
}

export async function listDir(path = '.') {
  const abs = await safePath(path)
  const entries = await fsp.readdir(abs, { withFileTypes: true })
  return entries.map(e => ({
    name: e.name,
    type: e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other'
  }))
}

export async function exists(path) {
  try {
    const abs = await safePath(path)
    await fsp.access(abs)
    return true
  } catch {
    return false
  }
}

/**
 * Bind the project root and start watching it. Replaces any prior root/watcher.
 */
export async function setProjectRoot(rootPath, changeHandler) {
  if (watcher) {
    await watcher.close()
    watcher = null
  }
  projectRoot = rootPath
  onChange = changeHandler

  if (!projectRoot) return

  watcher = chokidar.watch(projectRoot, {
    ignored: [
      /(^|[/\\])\../,                  // dotfiles / dirs
      /node_modules/,
      /\.gstrap\.recovery(\.tmp)?$/    // recovery snapshot + its atomic-write temp
    ],
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  })

  watcher
    .on('change', abs => onChange?.({ kind: 'changed', path: relative(projectRoot, abs) }))
    .on('add',    abs => onChange?.({ kind: 'added',   path: relative(projectRoot, abs) }))
    .on('unlink', abs => onChange?.({ kind: 'deleted', path: relative(projectRoot, abs) }))
}

export function getProjectRoot() {
  return projectRoot
}

export async function dispose() {
  if (watcher) {
    await watcher.close()
    watcher = null
  }
  projectRoot = null
  onChange = null
}
