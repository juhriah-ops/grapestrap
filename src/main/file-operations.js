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
 * Resolve a project-relative path safely, refusing escapes via "..".
 * Also accepts absolute paths if they sit inside projectRoot.
 */
function safePath(p) {
  if (!projectRoot) throw new Error('no project open')
  const abs = isAbsolute(p) ? p : resolve(projectRoot, p)
  const rel = relative(projectRoot, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path escapes project root: ${p}`)
  }
  return abs
}

export async function readFile(path) {
  const abs = safePath(path)
  return fsp.readFile(abs, 'utf8')
}

export async function writeFile(path, data) {
  const abs = safePath(path)
  await fsp.mkdir(dirname(abs), { recursive: true })
  await fsp.writeFile(abs, data, 'utf8')
  return { path: relative(projectRoot, abs) }
}

export async function deleteFile(path) {
  const abs = safePath(path)
  await fsp.rm(abs, { recursive: true, force: true })
  return { path: relative(projectRoot, abs) }
}

export async function copyAsset(srcAbsolutePath, targetSubdir) {
  if (!isAbsolute(srcAbsolutePath)) {
    throw new Error('copyAsset requires an absolute source path')
  }
  const filename = srcAbsolutePath.split('/').pop()
  const dest = safePath(join(targetSubdir, filename))
  await fsp.mkdir(dirname(dest), { recursive: true })
  await fsp.copyFile(srcAbsolutePath, dest)
  return { path: relative(projectRoot, dest) }
}

export async function listDir(path = '.') {
  const abs = safePath(path)
  const entries = await fsp.readdir(abs, { withFileTypes: true })
  return entries.map(e => ({
    name: e.name,
    type: e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other'
  }))
}

export async function exists(path) {
  try {
    const abs = safePath(path)
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
      /\.gstrap\.recovery$/
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
