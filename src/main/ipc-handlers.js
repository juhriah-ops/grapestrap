/**
 * GrapeStrap — IPC handlers
 *
 * Routes preload-bridge requests to main-process services. Every renderer-side
 * grapestrap.* call lands here.
 *
 * Convention: handlers return plain serializable objects. Errors propagate as
 * thrown values; the renderer's preload converts them into rejected promises.
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { log } from './logger.js'
import { getPref, setPref } from './prefs.js'
import { xdg } from './platform/xdg.js'
import {
  setProjectRoot, getProjectRoot,
  readFile, writeFile, deleteFile, copyAsset, listDir, exists, dispose
} from './file-operations.js'
import {
  createProject, loadProject, saveProject,
  exportProject, writeRecovery, readRecovery,
  importDirectory
} from './project-manager.js'

let pluginRegistryRef = null

// Asset kind → file picker filter. The kind doubles as the subfolder name
// under assets/ (e.g. 'images' → assets/images/foo.png). Plugins can extend
// asset kinds in v0.0.3 by registering custom filters.
const ASSET_KIND_FILTERS = {
  images: { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'] },
  fonts:  { name: 'Fonts',  extensions: ['woff', 'woff2', 'ttf', 'otf', 'eot'] },
  videos: { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogg'] }
}

export function registerIpcHandlers({ pluginRegistry }) {
  pluginRegistryRef = pluginRegistry

  // ─── App info ──────────────────────────────────────────────────────────────
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    name: app.getName(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    paths: { ...xdg }
  }))

  // ─── Plugin discovery results ──────────────────────────────────────────────
  ipcMain.handle('plugins:list', () => {
    return pluginRegistryRef ? pluginRegistryRef.summary() : []
  })
  ipcMain.handle('plugins:read-entry', async (_e, pluginName) => {
    if (!pluginRegistryRef) return null
    return pluginRegistryRef.readEntry(pluginName)
  })

  // ─── Preferences ───────────────────────────────────────────────────────────
  ipcMain.handle('prefs:get', (_e, key) => getPref(key))
  ipcMain.handle('prefs:set', (_e, key, value) => { setPref(key, value); return true })

  // ─── Projects ──────────────────────────────────────────────────────────────
  ipcMain.handle('project:new', async (_e, { name, location }) => {
    // `location` is the full manifest path. When omitted, we ask the user
    // for a PARENT folder (not a save-as path), then create a new
    // <slug>/ subfolder inside it and put the .gstrap there. This matches
    // the v0.0.2-alpha.2 layout: one folder per project, manifest at root,
    // site/ alongside.
    let target = location
    if (!target) {
      const parent = await pickNewProjectParent()
      if (!parent) return null
      const slug = (name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
      const projectFolder = join(parent, slug)
      try {
        const entries = await fsp.readdir(projectFolder).catch(() => null)
        if (entries && entries.length > 0) {
          throw new Error(`Folder "${slug}" already exists in that location and isn't empty.`)
        }
      } catch (err) {
        if (!/already exists/.test(err.message)) throw err
        else throw err
      }
      await fsp.mkdir(projectFolder, { recursive: true })
      target = join(projectFolder, `${slug}.gstrap`)
    }
    await createProject({ targetPath: target, name })
    await bindProjectWatcher(target)
    log.info(`Created project: ${target}`)
    return await loadProject(target)
  })

  ipcMain.handle('project:open', async (_e, providedPath) => {
    const target = providedPath || (await pickOpenProjectPath())
    if (!target) return null
    const project = await loadProject(target)
    await bindProjectWatcher(target)
    log.info(`Opened project: ${target}`)
    return project
  })

  ipcMain.handle('project:import-directory', async (_e, opts) => {
    const sourceDir = opts?.sourceDir || (await pickImportSourceDir())
    if (!sourceDir) return null
    const suggestedName = opts?.name || sourceDir.split(/[\\/]/).filter(Boolean).pop() || 'Imported'
    let targetPath = opts?.targetPath
    if (!targetPath) {
      const parent = await pickNewProjectParent()
      if (!parent) return null
      const slug = suggestedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'imported'
      const projectFolder = join(parent, slug)
      const entries = await fsp.readdir(projectFolder).catch(() => null)
      if (entries && entries.length > 0) {
        throw new Error(`Folder "${slug}" already exists in that location and isn't empty.`)
      }
      await fsp.mkdir(projectFolder, { recursive: true })
      targetPath = join(projectFolder, `${slug}.gstrap`)
    }
    await importDirectory({ sourceDir, targetPath, name: suggestedName })
    await bindProjectWatcher(targetPath)
    log.info(`Imported directory ${sourceDir} → ${targetPath}`)
    return await loadProject(targetPath)
  })

  ipcMain.handle('project:save', async (_e, project) => {
    return saveProject(project)
  })

  ipcMain.handle('project:save-as', async (_e, project) => {
    // Save-as in the v0.0.2-alpha.2 layout: pick a parent folder, create a
    // new <slug>/ inside it, write the manifest + site/ tree there. The
    // existing project's projectDir is the source for any unwritten
    // assets the user might want preserved (deferred — for v0.0.2 the
    // save flushes pages/templates/library/globalCSS only).
    const parent = await pickNewProjectParent()
    if (!parent) return null
    const name = project.manifest?.metadata?.name || 'Untitled'
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
    const projectFolder = join(parent, slug)
    const entries = await fsp.readdir(projectFolder).catch(() => null)
    if (entries && entries.length > 0) {
      throw new Error(`Folder "${slug}" already exists in that location and isn't empty.`)
    }
    await fsp.mkdir(projectFolder, { recursive: true })
    const target = join(projectFolder, `${slug}.gstrap`)
    const reseated = { ...project, manifestPath: target, projectDir: projectFolder }
    return saveProject(reseated)
  })

  ipcMain.handle('project:export', async (_e, project, outputDirOverride) => {
    const outputDir = outputDirOverride || (await pickExportDir())
    if (!outputDir) return null
    return exportProject(project, outputDir)
  })

  ipcMain.handle('project:write-recovery', async (_e, manifestPath, snapshot) => {
    return writeRecovery(manifestPath, snapshot)
  })
  ipcMain.handle('project:read-recovery', async (_e, manifestPath) => {
    return readRecovery(manifestPath)
  })

  ipcMain.handle('project:recent', async () => {
    try {
      const raw = await fsp.readFile(xdg.recentProjects, 'utf8')
      return JSON.parse(raw)
    } catch {
      return []
    }
  })
  ipcMain.handle('project:add-recent', async (_e, manifestPath, name) => {
    let list = []
    try { list = JSON.parse(await fsp.readFile(xdg.recentProjects, 'utf8')) } catch {}
    list = [{ path: manifestPath, name, openedAt: new Date().toISOString() },
            ...list.filter(r => r.path !== manifestPath)]
    list = list.slice(0, 10)
    await fsp.writeFile(xdg.recentProjects, JSON.stringify(list, null, 2), 'utf8')
    return list
  })

  // ─── File ops within project ───────────────────────────────────────────────
  ipcMain.handle('file:read',       (_e, p)        => readFile(p))
  ipcMain.handle('file:write',      (_e, p, data)  => writeFile(p, data))
  ipcMain.handle('file:delete',     (_e, p)        => deleteFile(p))
  ipcMain.handle('file:copy-asset', (_e, src, sub) => copyAsset(src, sub))
  ipcMain.handle('file:list',       (_e, p)        => listDir(p))
  ipcMain.handle('file:exists',     (_e, p)        => exists(p))

  // ─── Image-import helper: open file picker, copy to site/assets/images/ ──
  ipcMain.handle('file:import-image', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return copyAsset(result.filePaths[0], 'site/assets/images')
  })

  // ─── Asset Manager — multi-kind file import + listing ──────────────────────
  // The kind argument determines BOTH the dialog filter and the target subdir.
  // Returns the list of relative paths added (so the panel can paint optimistic).
  ipcMain.handle('file:import-asset', async (_e, kind) => {
    const filter = ASSET_KIND_FILTERS[kind] || ASSET_KIND_FILTERS.images
    const result = await dialog.showOpenDialog({
      title: `Import ${kind}`,
      properties: ['openFile', 'multiSelections'],
      filters: [filter]
    })
    if (result.canceled || result.filePaths.length === 0) return []
    const added = []
    for (const src of result.filePaths) {
      const r = await copyAsset(src, `site/assets/${kind}`)
      added.push(r.path)
    }
    return added
  })

  // Write a binary buffer to site/assets/<kind>/<filename>. Used by the
  // drag-drop path in the Asset Manager — the renderer reads the dropped
  // File via arrayBuffer() and shoots the bytes through here.
  ipcMain.handle('file:write-asset-buffer', async (_e, kind, filename, bytes) => {
    if (!ASSET_KIND_FILTERS[kind]) throw new Error(`Unknown asset kind: ${kind}`)
    const safeName = filename.replace(/[^\w.\-]+/g, '_')
    const subdir = `site/assets/${kind}`
    const target = `${subdir}/${safeName}`
    // bytes arrives as Uint8Array from the contextBridge structured clone.
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
    return writeFile(target, buf)
  })

  ipcMain.handle('file:list-assets', async () => {
    const out = { images: [], fonts: [], videos: [] }
    for (const kind of Object.keys(out)) {
      try {
        const entries = await listDir(`site/assets/${kind}`)
        out[kind] = entries.filter(e => e.type === 'file').map(e => e.name)
      } catch { /* dir doesn't exist yet */ }
    }
    return out
  })

  // ─── External shell actions ────────────────────────────────────────────────
  ipcMain.handle('shell:open-external', (_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })
  ipcMain.handle('shell:show-in-folder', (_e, p) => {
    if (p) shell.showItemInFolder(p)
  })

  log.info('IPC handlers registered')
}

// ─── Dialog helpers ──────────────────────────────────────────────────────────

// On Linux/Wayland a parentless dialog can render under the main window or
// off-screen entirely. Pass the focused BrowserWindow as parent so the dialog
// is properly modal-attached and always raised on top.
function parentWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null
}

async function pickNewProjectPath(suggestedName = 'Untitled') {
  const parent = parentWindow()
  const opts = {
    title: 'New GrapeStrap project',
    defaultPath: `${suggestedName.replace(/\s+/g, '-').toLowerCase()}.gstrap`,
    filters: [{ name: 'GrapeStrap project', extensions: ['gstrap'] }]
  }
  const result = parent
    ? await dialog.showSaveDialog(parent, opts)
    : await dialog.showSaveDialog(opts)
  return result.canceled ? null : result.filePath
}

async function pickOpenProjectPath() {
  const parent = parentWindow()
  const opts = {
    title: 'Open GrapeStrap project',
    properties: ['openFile'],
    filters: [{ name: 'GrapeStrap project', extensions: ['gstrap'] }]
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts)
  return (result.canceled || result.filePaths.length === 0) ? null : result.filePaths[0]
}

async function pickNewProjectParent() {
  const parent = parentWindow()
  const opts = {
    title: 'Choose where to create the project folder',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Create here'
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts)
  return (result.canceled || result.filePaths.length === 0) ? null : result.filePaths[0]
}

async function pickImportSourceDir() {
  const parent = parentWindow()
  const opts = {
    title: 'Import folder as GrapeStrap project',
    properties: ['openDirectory']
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts)
  return (result.canceled || result.filePaths.length === 0) ? null : result.filePaths[0]
}

async function pickExportDir() {
  const parent = parentWindow()
  const opts = {
    title: 'Export project to folder',
    properties: ['openDirectory', 'createDirectory']
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts)
  return (result.canceled || result.filePaths.length === 0) ? null : result.filePaths[0]
}

async function bindProjectWatcher(manifestPath) {
  const projectDir = manifestPath.replace(/[^/]+$/, '')
  await setProjectRoot(projectDir, evt => {
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send(`file:${evt.kind}`, evt.path)
    })
  })
}
