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

  // ─── Bundled Library sections ──────────────────────────────────────────────
  // copyAssets takes [{ from, to }] — `from` app-root-relative (must be inside
  // starters/), `to` site-relative (must be inside assets/). Main enforces both;
  // resolves to { attempted, rejected[], failures[] }.
  sections: {
    copyAssets: (assets) => ipcRenderer.invoke('sections:copy-assets', assets)
  },

  // ─── Behaviors runtime ─────────────────────────────────────────────────────
  // ensure() puts the app-bundled behaviors runtime pair (gstrap-behaviors.js /
  // .css) into the open project, refreshing a copy whose version tag is older
  // than the bundled one. Takes no arguments — there is nothing project-
  // specific to pass. Resolves to { copied[], skipped[] }; rejects when no
  // project is open or a copy fails.
  behaviors: {
    ensure: () => ipcRenderer.invoke('behaviors:ensure')
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
  },

  // ─── AI agent panel (v0.2 Phase A) ─────────────────────────────────────────
  // Non-secret prefs (provider/model/effort) live in prefs.ai — see
  // src/main/prefs.js. setKey/clearKey pass the plaintext key across the
  // bridge exactly once, on its way to being encrypted in main
  // (ai/key-store.js); nothing key-shaped is cached, returned, or logged on
  // this side. onDelta/onToolCall/onTurn are push subscriptions for one
  // in-flight turn's stream — each returns an unsubscribe fn, same as
  // git.onStatus above.
  // UPDATED: 2026-08-30 (Phase C tool bridge) — send() takes an optional
  // second `context` argument, forwarded to main as part of the same payload.
  ai: {
    status:      (providerId)              => ipcRenderer.invoke('ai:status', { providerId }),
    setKey:      (providerId, key)         => ipcRenderer.invoke('ai:set-key', { providerId, key }),
    clearKey:    (providerId)              => ipcRenderer.invoke('ai:clear-key', { providerId }),
    validateKey: (providerId, key)         => ipcRenderer.invoke('ai:validate-key', { providerId, key }),
    listModels:  (overrides)               => ipcRenderer.invoke('ai:list-models', { provider: overrides?.provider, ollamaHost: overrides?.ollamaHost }),
    // context is optional (Phase C tool bridge) — the executor passes along
    // whatever the model's turn needs to resolve a tool call (e.g. the
    // current selection/anchor); every existing caller that sends just text
    // keeps working unchanged.
    send:        (text, context)           => ipcRenderer.invoke('ai:send', { text, context }),
    cancel:      ()                        => ipcRenderer.invoke('ai:cancel'),
    reset:       ()                        => ipcRenderer.invoke('ai:reset'),
    toolResult:  (callId, result, isError) => ipcRenderer.invoke('ai:tool-result', { callId, result, isError }),
    onDelta:     (cb) => subscribe('ai:delta', cb),
    onToolCall:  (cb) => subscribe('ai:tool-call', cb),
    onTurn:      (cb) => subscribe('ai:turn', cb)
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
