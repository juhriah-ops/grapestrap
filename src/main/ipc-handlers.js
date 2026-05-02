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
  exportProject, writeRecovery, readRecovery
} from './project-manager.js'

let pluginRegistryRef = null

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
    const target = location || (await pickNewProjectPath(name))
    if (!target) return null
    const result = await createProject({ targetPath: target, name })
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

  ipcMain.handle('project:save', async (_e, project) => {
    return saveProject(project)
  })

  ipcMain.handle('project:save-as', async (_e, project) => {
    const target = await pickNewProjectPath(project.manifest?.metadata?.name || 'Untitled')
    if (!target) return null
    const reseated = { ...project, manifestPath: target, projectDir: target.replace(/\.gstrap$/, '') }
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

  // ─── Image-import helper: open file picker, copy to assets/images/ ─────────
  ipcMain.handle('file:import-image', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return copyAsset(result.filePaths[0], 'assets/images')
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
