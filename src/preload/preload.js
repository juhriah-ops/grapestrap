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
    starters:      ()               => ipcRenderer.invoke('project:starters'),
    starterPage:   (starterId, pageName) => ipcRenderer.invoke('project:starter-page', starterId, pageName),
    open:          (path)           => ipcRenderer.invoke('project:open', path),
    importDir:     (opts)           => ipcRenderer.invoke('project:import-directory', opts),
    save:          (project)        => ipcRenderer.invoke('project:save', project),
    saveAs:        (project)        => ipcRenderer.invoke('project:save-as', project),
    export:        (project, dir)   => ipcRenderer.invoke('project:export', project, dir),
    writeRecovery: (path, snapshot) => ipcRenderer.invoke('project:write-recovery', path, snapshot),
    readRecovery:  (path)           => ipcRenderer.invoke('project:read-recovery', path),
    clearRecovery: (path)           => ipcRenderer.invoke('project:clear-recovery', path),
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

  // ─── Workspace layouts (Wave 3) ────────────────────────────────────────────
  workspaces: {
    list:   ()                 => ipcRenderer.invoke('workspaces:list'),
    read:   (name)             => ipcRenderer.invoke('workspaces:read', name),
    save:   (payload)          => ipcRenderer.invoke('workspaces:save', payload),
    delete: (name)             => ipcRenderer.invoke('workspaces:delete', name),
    rename: (oldName, newName) => ipcRenderer.invoke('workspaces:rename', oldName, newName)
  },

  // ─── Preview in browser (Wave 3) ───────────────────────────────────────────
  preview: {
    start:   (project, opts) => ipcRenderer.invoke('preview:start', project, opts),
    refresh: (project)       => ipcRenderer.invoke('preview:refresh', project),
    stop:    ()              => ipcRenderer.invoke('preview:stop')
  },

  // ─── Git status (Wave 3) ───────────────────────────────────────────────────
  git: {
    refresh:  ()   => ipcRenderer.invoke('git:refresh'),
    onStatus: (cb) => subscribe('git:status', cb)
  },

  // ─── Native menu actions ───────────────────────────────────────────────────
  menu: {
    onAction: (cb) => subscribe('menu:action', cb),
    // One-way push: renderer sends the saved-workspace name list so main can
    // rebuild the View → Workspace Layouts submenu (names are display strings
    // only on the main side — clicking one round-trips through validation).
    setWorkspaces: (names) => ipcRenderer.send('menu:set-workspaces', names)
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
