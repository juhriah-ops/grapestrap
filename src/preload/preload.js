/**
 * GrapeStrap — Preload bridge
 *
 * The ONLY surface the renderer can use to reach Node / Electron / fs / network.
 * Everything else (Node globals, require, electron module) is unavailable in the
 * renderer thanks to the locked security posture (sandbox + contextIsolation +
 * nodeIntegration:false).
 *
 * Naming convention: window.grapestrap.<area>.<verb>(...)
 */

const { contextBridge, ipcRenderer } = require('electron')

const grapestrap = {
  // ─── App ───────────────────────────────────────────────────────────────────
  app: {
    info: () => ipcRenderer.invoke('app:info')
  },

  // ─── Plugins ───────────────────────────────────────────────────────────────
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    readEntry: (name) => ipcRenderer.invoke('plugins:read-entry', name)
  },

  // ─── Preferences ───────────────────────────────────────────────────────────
  prefs: {
    get: (key) => ipcRenderer.invoke('prefs:get', key),
    set: (key, value) => ipcRenderer.invoke('prefs:set', key, value)
  },

  // ─── Project ops ───────────────────────────────────────────────────────────
  project: {
    new:           (config)         => ipcRenderer.invoke('project:new', config),
    open:          (path)           => ipcRenderer.invoke('project:open', path),
    importDir:     (opts)           => ipcRenderer.invoke('project:import-directory', opts),
    save:          (project)        => ipcRenderer.invoke('project:save', project),
    saveAs:        (project)        => ipcRenderer.invoke('project:save-as', project),
    export:        (project, dir)   => ipcRenderer.invoke('project:export', project, dir),
    writeRecovery: (path, snapshot) => ipcRenderer.invoke('project:write-recovery', path, snapshot),
    readRecovery:  (path)           => ipcRenderer.invoke('project:read-recovery', path),
    recent:        ()               => ipcRenderer.invoke('project:recent'),
    addRecent:     (path, name)     => ipcRenderer.invoke('project:add-recent', path, name)
  },

  // ─── File ops within the open project ──────────────────────────────────────
  file: {
    read:        (path)        => ipcRenderer.invoke('file:read', path),
    write:       (path, data)  => ipcRenderer.invoke('file:write', path, data),
    delete:      (path)        => ipcRenderer.invoke('file:delete', path),
    copyAsset:   (src, sub)    => ipcRenderer.invoke('file:copy-asset', src, sub),
    list:        (path)        => ipcRenderer.invoke('file:list', path),
    exists:      (path)        => ipcRenderer.invoke('file:exists', path),
    importImage: ()            => ipcRenderer.invoke('file:import-image'),
    importAsset: (kind)        => ipcRenderer.invoke('file:import-asset', kind),
    listAssets:  ()            => ipcRenderer.invoke('file:list-assets'),
    writeAssetBuffer: (kind, filename, bytes) =>
      ipcRenderer.invoke('file:write-asset-buffer', kind, filename, bytes)
  },

  // ─── Watcher events from main → renderer ───────────────────────────────────
  watcher: {
    onChanged: (cb) => subscribe('file:changed', cb),
    onAdded:   (cb) => subscribe('file:added',   cb),
    onDeleted: (cb) => subscribe('file:deleted', cb)
  },

  // ─── Native menu actions ───────────────────────────────────────────────────
  menu: {
    onAction: (cb) => subscribe('menu:action', cb)
  },

  // ─── Shell ─────────────────────────────────────────────────────────────────
  shell: {
    openExternal: (url)  => ipcRenderer.invoke('shell:open-external', url),
    showInFolder: (path) => ipcRenderer.invoke('shell:show-in-folder', path)
  }
}

// Generic subscription helper that returns an unsubscribe function.
function subscribe(channel, cb) {
  const handler = (_event, ...args) => {
    try { cb(...args) }
    catch (err) { console.error(`grapestrap.${channel} handler threw:`, err) }
  }
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

contextBridge.exposeInMainWorld('grapestrap', grapestrap)
