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

import { app, BrowserWindow, shell, protocol, net } from 'electron'
import { join, dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

// Register the gstrap-plugin:// scheme as privileged BEFORE app.whenReady. This
// has to happen synchronously at startup; the actual handler attaches after
// plugin discovery. The scheme exists so plugins can be loaded as ES modules
// from a hierarchical URL — relative imports (./helpers.js, ./messages.json)
// resolve correctly, unlike under the previous Blob-URL loader where the base
// URL had no parent directory. `standard` makes URLs parse cleanly,
// `secure` lets the renderer treat it as a trustworthy origin (so dynamic
// import works inside the locked-down renderer), `supportFetchAPI` covers
// plugins that call fetch() against their own resources.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'gstrap-plugin',
    privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true }
  }
])

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

  registerPluginProtocolHandler(pluginRegistry)
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
      preload: join(__dirname, '..', 'preload', 'preload.mjs'),
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

// ─── Plugin protocol handler ──────────────────────────────────────────────────
//
// Serves plugin files from disk under gstrap-plugin://<uid>/<file>. Plugins
// can therefore use relative imports (`./helpers.js`, `./messages.json`),
// which the renderer's ES module loader resolves against the protocol URL.
// Path-traversal is blocked: every resolved file path must stay within the
// owning plugin's directory.

const PLUGIN_MIME = {
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.json': 'application/json',
  '.css':  'text/css',
  '.html': 'text/html',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2'
}

function mimeForPath(p) {
  const dot = p.lastIndexOf('.')
  if (dot < 0) return 'application/octet-stream'
  return PLUGIN_MIME[p.slice(dot).toLowerCase()] || 'application/octet-stream'
}

function registerPluginProtocolHandler(registry) {
  protocol.handle('gstrap-plugin', async request => {
    let url
    try { url = new URL(request.url) }
    catch { return new Response('Bad URL', { status: 400 }) }

    const plugin = registry.byUid(url.hostname)
    if (!plugin) return new Response('Plugin not found', { status: 404 })

    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    if (!rel) return new Response('No path', { status: 400 })

    const target = resolvePath(plugin.dir, rel)
    const root = resolvePath(plugin.dir)
    if (target !== root && !target.startsWith(root + '/')) {
      log.warn(`gstrap-plugin: path traversal blocked: ${request.url}`)
      return new Response('Forbidden', { status: 403 })
    }

    // net.fetch on a file:// URL is the recommended way to stream a file in a
    // protocol.handle handler — it returns a proper Response with the right
    // body type, and we layer the right Content-Type on top.
    try {
      const response = await net.fetch(pathToFileURL(target).toString())
      if (!response.ok) return new Response('Not found', { status: 404 })
      const buf = await response.arrayBuffer()
      return new Response(buf, {
        headers: { 'Content-Type': mimeForPath(target) }
      })
    } catch (err) {
      log.warn(`gstrap-plugin: read failed for ${target}: ${err.message}`)
      return new Response('Not found', { status: 404 })
    }
  })
  log.info('gstrap-plugin:// protocol handler registered')
}

export function getMainWindow() {
  return mainWindow
}

export function getPluginRegistry() {
  return pluginRegistry
}
