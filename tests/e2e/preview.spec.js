/**
 * GrapeStrap — E2E: preview in browser
 *
 * PATH: tests/e2e/preview.spec.js
 * ROLE: Wave 3 preview-in-browser specs — on-the-fly SSE injection + pristine
 *       disk cache, SSE reload on save, traversal/404/405 guards, browser
 *       spawn contract, teardown on project switch, no-browser degrade path
 * DEPENDS: @playwright/test, node:http, ./helpers.js
 * CREATED: 2026-07-12
 *
 * EVERY launch in this file sets GRAPESTRAP_PREVIEW_CMD — a forgotten
 * override on a probe-capable machine opens a real firefox under xvfb and
 * hangs the worker. /bin/true exists on any Linux CI image and exits 0.
 * All HTTP assertions run node-side in the test process — no browser page
 * ever goes near the preview server.
 */
import { test, expect } from '@playwright/test'
import http from 'node:http'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject } from './helpers.js'

const STUB_BROWSER = '/bin/true'

// Plain node-side request (URL form — the client normalizes the path).
function request(url, { method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', c => { body += c })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

// Traversal probes need the RAW path on the wire — http.request with an
// options.path sends it unnormalized (a URL string would clean ".." away).
function rawRequest(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', c => { body += c })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

// SSE reader: subscribe FIRST (the reload broadcast is not replayed), then
// mutate, then await the reload line. Plain text over HTTP — no EventSource.
function openSseReader(sseUrl) {
  const reader = { buf: '', req: null, onData: null }
  const connected = new Promise((resolve, reject) => {
    reader.req = http.get(sseUrl, { headers: { Accept: 'text/event-stream' } }, res => {
      if (res.statusCode !== 200) return reject(new Error(`SSE status ${res.statusCode}`))
      res.setEncoding('utf8')
      res.on('data', chunk => { reader.buf += chunk; reader.onData?.() })
      resolve()
    })
    reader.req.on('error', () => { /* destroy() on cleanup — never unhandled */ })
  })
  return {
    connected,
    waitForReload(timeoutMs = 10_000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reader.onData = null
          reject(new Error('SSE reload timeout'))
        }, timeoutMs)
        reader.onData = () => {
          if (/^data: reload$/m.test(reader.buf)) {
            clearTimeout(timer)
            reader.onData = null
            resolve()
          }
        }
        reader.onData()
      })
    },
    close() { reader.req?.destroy() }
  }
}

// Drive the command exactly like the toolbar / Ctrl+F12 do, then read the
// renderer handle once it fills in.
async function startPreview(appWindow) {
  await appWindow.evaluate(() =>
    window.__gstrap.eventBus.emit('command', 'view:preview-browser'))
  await appWindow.waitForFunction(
    () => window.__gstrap?.preview?.status()?.url != null, null, { timeout: 15_000 })
  return appWindow.evaluate(() => window.__gstrap.preview.status())
}

// ─── Spec 1 — start serves the export with on-the-fly injection (anchor) ─────
test('preview start: served HTML gets the SSE snippet, assets and disk stay pristine', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-pv-start-'))
  const { app, appWindow } = await launch({ GRAPESTRAP_PREVIEW_CMD: STUB_BROWSER })
  await openSeedProject(appWindow, join(projectDir, 'pv.gstrap'))

  // Seed a .php file under site/assets/ BEFORE start (start wipes the cache
  // then exports; exportProject copies site/assets/ verbatim) — probed below.
  await fsp.writeFile(join(projectDir, 'site', 'assets', 'probe.php'),
    '<?php echo "php-mime-probe"; ?>', 'utf8')

  const status = await startPreview(appWindow)
  expect(status.running).toBe(true)
  expect(status.url).toContain('http://127.0.0.1:')
  expect(status.pageUrl.startsWith(status.url)).toBe(true)

  // Served page: real content + injected reload snippet.
  const page = await request(status.pageUrl)
  expect(page.status).toBe(200)
  expect(page.headers['content-type']).toBe('text/html')
  expect(page.headers['cache-control']).toBe('no-store')
  expect(page.body).toContain('Welcome to your new GrapeStrap project')
  expect(page.body).toContain('/__gstrap/sse')
  expect(page.body).toContain('data-grpstr-preview')

  // Non-HTML assets are served verbatim — no snippet, right type.
  const css = await request(`${status.url}/assets/css/bootstrap.css`)
  expect(css.status).toBe(200)
  expect(css.headers['content-type']).toBe('text/css')
  expect(css.body).not.toContain('/__gstrap/sse')

  // .php serves as source text (Wave 5 — was application/octet-stream,
  // which made browsers download it). No SSE injection: not text/html.
  const php = await request(`${status.url}/assets/probe.php`)
  expect(php.status).toBe(200)
  expect(php.headers['content-type']).toBe('text/plain')
  expect(php.body).toContain('php-mime-probe')
  expect(php.body).not.toContain('/__gstrap/sse')

  // Injection is serve-time only — the exported file on disk is pristine.
  const onDisk = await fsp.readFile(join(status.cacheDir, 'index.html'), 'utf8')
  expect(onDisk).not.toContain('/__gstrap/sse')
  expect(onDisk).not.toContain('data-grpstr-preview')

  // Wave-2 export contract re-pinned inside the preview cache: no template
  // dir, no .gstrap-tpl files ever land in an export.
  const entries = await fsp.readdir(status.cacheDir, { recursive: true })
  expect(entries.some(e => e.endsWith('.gstrap-tpl'))).toBe(false)
  expect(entries.some(e => e === 'templates' || e.startsWith('templates/'))).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 2 — SSE reload on save with a stubbed browser ──────────────────────
test('save broadcasts SSE reload after re-export; the change is served', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-pv-sse-'))
  const { app, appWindow } = await launch({ GRAPESTRAP_PREVIEW_CMD: STUB_BROWSER })
  await openSeedProject(appWindow, join(projectDir, 'pv.gstrap'))
  const status = await startPreview(appWindow)

  const sse = openSseReader(`${status.url}/__gstrap/sse`)
  await sse.connected

  // Mutate the canvas and save — save → project:saved → 300 ms debounce →
  // preview:refresh → re-export → reload broadcast, strictly in that order.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.getWrapper().append('<p data-spec="preview-reload-probe">changed</p>')
    window.__gstrap.eventBus.emit('command', 'file:save')
  })

  await sse.waitForReload(10_000)
  sse.close()

  // The re-export the reload announced actually carries the mutation.
  const after = await request(status.pageUrl)
  expect(after.status).toBe(200)
  expect(after.body).toContain('preview-reload-probe')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 3 — traversal 403, missing 404, method 405 ─────────────────────────
test('traversal (raw + encoded) → 403, missing file → 404, POST → 405', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-pv-guard-'))
  const { app, appWindow } = await launch({ GRAPESTRAP_PREVIEW_CMD: STUB_BROWSER })
  await openSeedProject(appWindow, join(projectDir, 'pv.gstrap'))
  const status = await startPreview(appWindow)

  const raw = await rawRequest(status.port, '/../../../../../../etc/passwd')
  expect(raw.status).toBe(403)
  expect(raw.body).not.toContain('root:')

  const encoded = await rawRequest(status.port,
    '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd')
  expect(encoded.status).toBe(403)
  expect(encoded.body).not.toContain('root:')

  const viaAssets = await rawRequest(status.port,
    '/assets/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd')
  expect(viaAssets.status).toBe(403)
  expect(viaAssets.body).not.toContain('root:')

  const missing = await request(`${status.url}/nope.html`)
  expect(missing.status).toBe(404)

  const post = await request(`${status.url}/index.html`, { method: 'POST' })
  expect(post.status).toBe(405)
  expect(post.headers.allow).toBe('GET, HEAD')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 4 — GRAPESTRAP_PREVIEW_CMD spawn contract ──────────────────────────
test('GRAPESTRAP_PREVIEW_CMD is spawned with the page URL as the single argv', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-pv-spawn-'))
  const specTmp = await fsp.mkdtemp(join(tmpdir(), 'gstrap-pv-rec-'))
  const script = join(specTmp, 'record-browser.sh')
  const logFile = join(specTmp, 'argv.log')
  // Records argc + argv[1]: "1 <url>" proves no shell, no arg-splitting,
  // URL as the sole argument — and that the override beats the PATH probe.
  await fsp.writeFile(script, `#!/bin/sh\necho "$# $1" >> "${logFile}"\n`, { mode: 0o755 })

  const { app, appWindow } = await launch({ GRAPESTRAP_PREVIEW_CMD: script })
  await openSeedProject(appWindow, join(projectDir, 'pv.gstrap'))
  const status = await startPreview(appWindow)

  await expect.poll(async () => {
    try { return await fsp.readFile(logFile, 'utf8') } catch { return '' }
  }, { timeout: 10_000 }).toBe(`1 ${status.pageUrl}\n`)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
  await fsp.rm(specTmp, { recursive: true, force: true })
})

// ─── Spec 5 — teardown on project switch ─────────────────────────────────────
test('project switch stops the server (ECONNREFUSED) and resets renderer state', async () => {
  const projectDirA = await fsp.mkdtemp(join(tmpdir(), 'gstrap-pv-a-'))
  const projectDirB = await fsp.mkdtemp(join(tmpdir(), 'gstrap-pv-b-'))
  const { app, appWindow } = await launch({ GRAPESTRAP_PREVIEW_CMD: STUB_BROWSER })
  await openSeedProject(appWindow, join(projectDirA, 'a.gstrap'))
  const status = await startPreview(appWindow)

  // Live before the switch.
  expect((await request(status.pageUrl)).status).toBe(200)

  // Create project B in-app — project:new funnels through bindProjectWatcher
  // (main-side stopPreview); projectState.set fires project:opened (renderer
  // state reset).
  await appWindow.evaluate(async path => {
    const project = await window.grapestrap.project.new({ name: 'previewb', location: path })
    window.__gstrap.projectState.set(project)
  }, join(projectDirB, 'b.gstrap'))

  await expect.poll(async () => {
    try { await request(`http://127.0.0.1:${status.port}/`); return 'up' }
    catch (err) { return err.code || 'error' }
  }, { timeout: 10_000 }).toBe('ECONNREFUSED')

  expect(await appWindow.evaluate(() => window.__gstrap.preview.status().running)).toBe(false)

  await app.close()
  await fsp.rm(projectDirA, { recursive: true, force: true })
  await fsp.rm(projectDirB, { recursive: true, force: true })
})

// ─── Spec 6 — no-browser degrade path (F4) ───────────────────────────────────
test('bad GRAPESTRAP_PREVIEW_CMD: warning toast carries the URL, server stays up', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-pv-nobrowser-'))
  const { app, appWindow } = await launch({
    GRAPESTRAP_PREVIEW_CMD: '/nonexistent/gstrap-no-browser'
  })
  await openSeedProject(appWindow, join(projectDir, 'pv.gstrap'))

  const status = await startPreview(appWindow)

  // Spawn failure funnels through the same F4 branch as a probe miss: the
  // renderer toasts a warning WITH the URL so the user can open it by hand.
  await appWindow.waitForFunction(
    needle => [...document.querySelectorAll('.gstrap-toast-warning .gstrap-toast-msg')]
      .some(el => (el.textContent || '').includes(needle)),
    'http://127.0.0.1:', { timeout: 10_000 })

  // The server survived the missing browser.
  const page = await request(status.pageUrl)
  expect(page.status).toBe(200)
  expect(page.body).toContain('/__gstrap/sse')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
