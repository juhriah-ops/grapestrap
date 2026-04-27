/**
 * GrapeStrap — Electron main process entry
 *
 * Bootstraps the editor with:
 *   1. XDG paths + Wayland flags applied BEFORE app.whenReady (must happen pre-init)
 *   2. Logger
 *   3. Preferences
 *   4. Single-instance lock
 *   5. Plugin loader (discovers bundled + user + project plugins)
 *   6. IPC handlers
 *   7. Native menus
 *   8. Main window with locked security posture
 *
 * Security posture is non-negotiable:
 *   - sandbox: true
 *   - contextIsolation: true
 *   - nodeIntegration: false
 *   - webSecurity: true
 *   - preload via contextBridge
 *   - CSP enforced in renderer index.html
 *
 * Default Electron shortcuts that would corrupt user state are intercepted:
 *   - Ctrl+R / F5 (would reload renderer, wiping unsaved work)
 *   - Ctrl+Shift+R is enabled only with --dev flag for development reload
 */

import { app, BrowserWindow, shell, protocol } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ensureXdgDirs, xdg } from './platform/xdg.js'
import { applyDisplayProtocolFlags } from './platform/wayland.js'
import { initLogger, log } from './logger.js'
import { initPrefs } from './prefs.js'
import { registerIpcHandlers } from './ipc-handlers.js'
import { buildMenu } from './menus.js'
import { discoverPlugins } from './plugin-loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const isDevReload = process.argv.includes('--dev')

// ─── Phase 1: Pre-app-ready setup ─────────────────────────────────────────────

ensureXdgDirs()
applyDisplayProtocolFlags(app)

// Single-instance lock — second invocation focuses the existing window
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

// App identity (overrides default "Electron" in some places)
app.setName('GrapeStrap')
app.setAppUserModelId('org.grapestrap.GrapeStrap')

// Hardware acceleration policy — Wayland sometimes prefers it disabled, but only
// disable it for users who hit the issue. Default on.
// app.disableHardwareAcceleration()  // intentionally commented

// ─── Phase 2: After-app-ready setup ───────────────────────────────────────────

let mainWindow = null
let pluginRegistry = null

app.whenReady().then(async () => {
  initLogger()
  initPrefs()

  log.info('GrapeStrap starting', {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    isDev
  })

  pluginRegistry = await discoverPlugins({
    bundledDir: join(app.getAppPath(), 'plugins'),
    userDir: xdg.pluginsDir,
    appVersion: app.getVersion()
  })
  log.info(`Plugin discovery complete — ${pluginRegistry.plugins.length} plugin(s) found`)

  registerIpcHandlers({ pluginRegistry })

  buildMenu({
    onAction: (action, ...args) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('menu:action', action, ...args)
      }
    }
  })

  createMainWindow()

  app.on('activate', () => {
    // macOS dock click; we'll honor it once we ship there
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Block creation of unexpected windows. Renderer requests for new windows go through
// shell.openExternal via IPC; nothing else should ever spawn a BrowserWindow.
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    const target = new URL(url)
    const isLocalDev = isDev && target.hostname === 'localhost'
    if (target.protocol !== 'file:' && !isLocalDev) event.preventDefault()
  })
})

// ─── Window creation ──────────────────────────────────────────────────────────

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#1e1e1e',
    title: 'GrapeStrap',
    icon: join(app.getAppPath(), 'assets', 'icons', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: isDev || isDevReload
    }
  })

  // Block default Ctrl+R / F5 reload — would wipe unsaved canvas state.
  // Allow Ctrl+Shift+R only with --dev flag for development convenience.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const blockedReload =
      (input.control && input.key.toLowerCase() === 'r' && !input.shift) ||
      input.key === 'F5'
    if (blockedReload) event.preventDefault()
    if (input.control && input.shift && input.key.toLowerCase() === 'r' && !isDevReload) {
      event.preventDefault()
    }
  })

  // Show only after first paint to avoid flash-of-unstyled-content
  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Load renderer
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(app.getAppPath(), 'dist', 'renderer', 'index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

export function getMainWindow() {
  return mainWindow
}

export function getPluginRegistry() {
  return pluginRegistry
}
