/**
 * GrapeStrap — Preview-in-Browser server (main process)
 *
 * PATH: src/main/preview-server.js
 * ROLE: Wave 3 preview: export the open project to the XDG preview cache,
 *       serve it over loopback HTTP with SSE auto-reload, probe + spawn the
 *       user's browser. IPC surface preview:start / preview:refresh /
 *       preview:stop lives in ipc-handlers.js.
 * DEPENDS: node:http, node:crypto, node:child_process, node:fs, node:path,
 *          electron (app), platform/xdg.js, platform/mime.js,
 *          platform/safe-path.js, project-manager.js (exportProject),
 *          logger.js
 * CREATED: 2026-07-12
 *
 * Design (PLAN.md, sandbox-artifacts/grapestrap/w3-preview-server):
 *   - Global singleton keyed by manifestPath — the app is single-window,
 *     single-project, so a per-server pool would model a state the app can't
 *     produce. Same-project re-start = re-export + SSE reload + a fresh
 *     browser tab on the SAME port; different project = stop, cold start.
 *   - Bound to 127.0.0.1 port 0 — loopback only, zero telemetry (v5
 *     amendment). No new dependencies: node:http + SSE.
 *   - The reload <script data-grpstr-preview> is spliced into served .html
 *     ON THE FLY; exported files on disk stay byte-identical to a real
 *     project:export, so the cache doubles as an honest export preview.
 *   - Start wipes the cache dir then exports (stale pages die); refresh
 *     overwrites in place (no wipe → a manual mid-export F5 never 404s on
 *     assets) and broadcasts `reload` strictly AFTER the export resolves.
 *   - Teardown: stopPreview() from bindProjectWatcher (project switch) and a
 *     lazily-registered app 'will-quit' hook. The cache dir is never deleted
 *     at stop — XDG cache semantics; the next start wipes it.
 */

import http from 'node:http'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { promises as fsp, constants as fsConstants } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

import { xdg } from './platform/xdg.js'
import { mimeForPath } from './platform/mime.js'
import { resolveWithinDir } from './platform/safe-path.js'
import { exportProject } from './project-manager.js'
import { log } from './logger.js'

// $GRAPESTRAP_PREVIEW_CMD overrides the probe entirely (spec-safety contract:
// the e2e suite points it at /bin/true so no real browser can ever spawn).
// Probe order: v5 family order expanded to real Linux binary names, with
// xdg-open as the freedesktop-default final fallback.
const PROBE_ORDER = [
  'firefox',
  'chromium', 'chromium-browser',
  'google-chrome-stable', 'google-chrome',
  'brave-browser', 'brave',
  'vivaldi', 'vivaldi-stable',
  'xdg-open'
]

// Served with a marker attribute + comment so a copied-out page is obviously
// preview-only; this snippet never touches the files on disk.
const RELOAD_SNIPPET = `<script data-grpstr-preview>
// GrapeStrap live-preview reload — injected at serve time only, never present
// in the exported files on disk.
new EventSource('/__gstrap/sse').addEventListener('message', function (e) {
  if (e.data === 'reload') location.reload()
})
</script>`

// Singleton server state. Null when no preview is running.
let state = null
let quitHookRegistered = false

// ─── IPC entry points ─────────────────────────────────────────────────────────

/**
 * Start (or same-project warm-restart) the preview. Export runs BEFORE listen
 * so an export failure (F3) leaves no half-open server. Returns
 * { ok, url, pageUrl, port, cacheDir, browser } — browser is the resolved
 * command's basename, 'env' for the override, or null when nothing could be
 * found/spawned (F4 — the server stays up and the renderer toasts the URL).
 */
export async function startPreview(project, opts = {}) {
  if (!project?.manifestPath) throw new Error('Preview: no project provided')
  const pageName = resolvePageName(project, opts.activePage)
  if (!pageName) throw new Error('Preview: project has no pages')

  if (state && state.manifestPath !== project.manifestPath) await stopPreview()

  if (!state) {
    const cacheDir = join(xdg.previewDir, previewSlug(project))
    await fsp.rm(cacheDir, { recursive: true, force: true })
    await exportProject(project, cacheDir)
    const server = http.createServer(handleRequest)
    const port = await listenLoopback(server)
    state = {
      server,
      port,
      cacheDir,
      manifestPath: project.manifestPath,
      sseClients: new Set(),
      refreshQueue: Promise.resolve(),
      heartbeat: setInterval(sendHeartbeat, 30_000)
    }
    registerWillQuitHook()
    log.info(`preview: serving ${cacheDir} at http://127.0.0.1:${port}`)
  } else {
    // Warm start: the user pressed Preview again — re-export over the running
    // cache, reload existing tabs, and let the spawn below open a fresh one.
    await refreshPreview(project)
  }

  const url = `http://127.0.0.1:${state.port}`
  const pageUrl = `${url}/${encodeURIComponent(pageName)}.html`
  const browser = await spawnBrowser(pageUrl)
  return { ok: true, url, pageUrl, port: state.port, cacheDir: state.cacheDir, browser }
}

/**
 * Re-export the in-memory project over the running cache, then broadcast
 * `reload` — strictly in that order, so the browser never fetches a
 * half-written cache. Serialized through a promise chain so rapid saves can't
 * interleave two export walks (F11). No server running → { ok: false } no-op
 * (a stale renderer debounce firing after stop must not throw — F14).
 */
export async function refreshPreview(project) {
  if (!state || !project?.manifestPath || project.manifestPath !== state.manifestPath) {
    return { ok: false }
  }
  const run = state.refreshQueue.then(() => exportProject(project, state.cacheDir))
  // Keep the chain alive whether or not this export fails.
  state.refreshQueue = run.then(() => {}, () => {})
  await run  // export failure rejects out to the IPC caller (F6)
  if (!state || state.manifestPath !== project.manifestPath) return { ok: false }
  broadcastReload()
  return { ok: true, clients: state.sseClients.size }
}

/** Stop the server, drop every SSE client, clear state. Idempotent. */
export async function stopPreview() {
  if (!state) return { ok: true }
  const s = state
  state = null
  clearInterval(s.heartbeat)
  for (const client of [...s.sseClients]) {
    try { client.end() } catch { /* socket already gone */ }
  }
  s.sseClients.clear()
  // closeAllConnections (Node ≥18.2 — Electron 43 ships Node 22) kills the
  // keep-alive SSE sockets that would otherwise stall server.close().
  try { s.server.closeAllConnections() } catch { /* already closed */ }
  await new Promise(resolve => s.server.close(resolve))
  log.info('preview: server stopped')
  return { ok: true }
}

// ─── Export cache ─────────────────────────────────────────────────────────────

/**
 * Stable, collision-free cache folder name: slugified project name (same
 * regex convention as project:new) + first 8 hex of sha256(manifestPath).
 * Human-readable in ~/.cache, deterministic across sessions, and two
 * projects named "My Project" never collide.
 */
function previewSlug(project) {
  const name = String(project.manifest?.metadata?.name || 'project')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
  const hash = createHash('sha256').update(project.manifestPath).digest('hex').slice(0, 8)
  return `${name}-${hash}`
}

/** Preview the active page tab; template/library tabs fall back to page one. */
function resolvePageName(project, activePage) {
  if (activePage && project.pages?.some(p => p.name === activePage)) return activePage
  return project.pages?.[0]?.name || null
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

function listenLoopback(server) {
  return new Promise((resolve, reject) => {
    const onError = err => reject(err)  // bind failure (F5) — no half-open state
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      server.on('error', err => log.warn(`preview: server error: ${err.message}`))
      resolve(server.address().port)
    })
  })
}

// Route table + method guard + error taxonomy in one place (~35 lines,
// flagged over the 30-line soft cap in PLAN.md §10 — three 12-line
// indirections read worse).
function handleRequest(req, res) {
  const method = req.method || 'GET'
  // Parse the RAW request path (query stripped) rather than new URL().pathname:
  // the URL constructor normalizes raw ".." segments away, and the traversal
  // guard must see them so raw and percent-encoded probes both get their 403.
  const rawPath = (req.url || '/').split('?')[0]
  if (method === 'GET' && rawPath === '/__gstrap/sse') return handleSse(req, res)
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' })
    return res.end()
  }
  serveStatic(req, res, rawPath).catch(err => {
    log.warn(`preview: responder error for ${req.url}: ${err.message}`)
    try { respondText(res, 500, 'Server error') } catch { /* socket gone */ }
  })
}

async function serveStatic(req, res, rawPath) {
  const s = state
  if (!s) return respondText(res, 503, 'Preview stopped')

  let pathname
  try { pathname = decodeURIComponent(rawPath) }
  catch { return respondText(res, 400, 'Bad request') }  // malformed escapes (F9)
  if (pathname === '/') pathname = '/index.html'

  const target = resolveWithinDir(s.cacheDir, pathname)
  if (!target) {
    log.warn(`preview: path traversal blocked: ${req.url}`)
    return respondText(res, 403, 'Forbidden')  // plugin-handler convention (F7)
  }

  // Directory target (only reachable for assets/ subdirs) → its index.html.
  let file = target
  try {
    const st = await fsp.stat(file)
    if (st.isDirectory()) file = join(file, 'index.html')
  } catch { /* fall through — readFile below reports ENOENT as 404 */ }

  let body
  try { body = await fsp.readFile(file) }
  catch (err) {
    if (err?.code === 'ENOENT') return respondText(res, 404, 'Not found')  // F8
    log.warn(`preview: read failed for ${file}: ${err.message}`)
    return respondText(res, 500, 'Server error')
  }

  const type = mimeForPath(file)
  if (type === 'text/html') {
    // On-the-fly injection — Content-Length computed AFTER the splice; the
    // file on disk stays pristine.
    body = Buffer.from(injectReloadSnippet(body.toString('utf8')), 'utf8')
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Content-Length': body.byteLength
  })
  if (req.method === 'HEAD') return res.end()
  res.end(body)
}

function respondText(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
  res.end(message)
}

/** Splice the reload snippet before the LAST </body> (composeFullPageHtml
 *  always emits the real one last); body-only legacy fragments get it
 *  appended — browsers execute trailing scripts fine. */
function injectReloadSnippet(html) {
  const idx = html.toLowerCase().lastIndexOf('</body>')
  if (idx < 0) return html + '\n' + RELOAD_SNIPPET + '\n'
  return html.slice(0, idx) + RELOAD_SNIPPET + '\n' + html.slice(idx)
}

// ─── SSE ──────────────────────────────────────────────────────────────────────

function handleSse(req, res) {
  const s = state
  if (!s) return respondText(res, 503, 'Preview stopped')
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive'
  })
  res.write('retry: 500\n\n')
  s.sseClients.add(res)
  req.on('close', () => s.sseClients.delete(res))  // tab closed (F10)
}

function broadcastReload() {
  if (!state) return
  for (const client of [...state.sseClients]) {
    try { client.write('data: reload\n\n') }
    catch { state.sseClients.delete(client) }
  }
}

/** Comment-only keep-alive every 30 s so idle SSE sockets stay honest. */
function sendHeartbeat() {
  if (!state) return
  for (const client of [...state.sseClients]) {
    try { client.write(': ping\n\n') }
    catch { state.sseClients.delete(client) }
  }
}

// ─── Browser probe + spawn ────────────────────────────────────────────────────

/**
 * $GRAPESTRAP_PREVIEW_CMD (set + non-empty) IS the command — no probe, no
 * fallback past it, spawned with NO shell and NO argument splitting (wrapper
 * script for anything fancier). Otherwise scan PATH for the probe list.
 */
async function resolveBrowserCommand() {
  const override = process.env.GRAPESTRAP_PREVIEW_CMD
  if (override && override.length > 0) return { cmd: override, label: 'env' }
  const dirs = (process.env.PATH || '').split(':').filter(Boolean)
  for (const name of PROBE_ORDER) {
    for (const dir of dirs) {
      const candidate = join(dir, name)
      try {
        await fsp.access(candidate, fsConstants.X_OK)
        return { cmd: candidate, label: name }
      } catch { /* keep probing */ }
    }
  }
  return null
}

/** Returns the browser label, or null on probe miss / spawn failure (F4 —
 *  callers degrade to "open this URL by hand", never a hard failure). */
async function spawnBrowser(pageUrl) {
  const resolved = await resolveBrowserCommand()
  if (!resolved) {
    log.warn('preview: no browser found on PATH (and no GRAPESTRAP_PREVIEW_CMD)')
    return null
  }
  const ok = await trySpawn(resolved.cmd, pageUrl)
  if (!ok) {
    log.warn(`preview: browser spawn failed: ${resolved.cmd}`)
    return null
  }
  log.info(`preview: opened ${pageUrl} via ${resolved.label}`)
  return resolved.label
}

/** detached + stdio:'ignore' + unref — the browser survives GrapeStrap
 *  quitting and never keeps our event loop alive. URL is the sole argv. */
function trySpawn(cmd, url) {
  return new Promise(resolve => {
    let child
    try { child = spawn(cmd, [url], { detached: true, stdio: 'ignore' }) }
    catch { return resolve(false) }
    child.once('error', () => resolve(false))  // ENOENT etc. — attached before unref
    child.once('spawn', () => { child.unref(); resolve(true) })
  })
}

// ─── App-quit teardown ────────────────────────────────────────────────────────

// Registered lazily on first start so this module stays self-contained and
// main.js needs no edit. closeAllConnections in stopPreview keeps keep-alive
// SSE sockets from stalling shutdown (F13).
function registerWillQuitHook() {
  if (quitHookRegistered) return
  quitHookRegistered = true
  app.on('will-quit', () => { stopPreview() })
}
