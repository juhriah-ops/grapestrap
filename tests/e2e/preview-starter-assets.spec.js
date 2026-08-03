/**
 * GrapeStrap — E2E: preview serves every asset a starter page references
 *
 * PATH: tests/e2e/preview-starter-assets.spec.js
 * ROLE: v0.1.0 acceptance §5 regression — preview a project created from a
 *       starter (Landing = bundled framework, Graphite = vendored framework)
 *       and fetch, exactly like a browser would, every stylesheet <link>,
 *       every <script src>, and every url() inside each served stylesheet.
 *       Each must answer 200 with the right Content-Type. preview.spec.js
 *       covers the blank seed project only, which is why a starter-specific
 *       CSS regression could pass the suite yet fail workstation acceptance.
 * DEPENDS: @playwright/test, node:http, ./helpers.js
 * CREATED: 2026-08-03
 */
import { test, expect } from '@playwright/test'
import http from 'node:http'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, EXPECTED_PLUGIN_COUNT } from './helpers.js'

const STUB_BROWSER = '/bin/true'

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

// Same seed pattern as graphite-starter.spec.js — openSeedProject() hardcodes
// a blank project, so starters carry templateId through project.new().
async function createStarterProject(appWindow, projectPath, templateId) {
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 })
  await appWindow.evaluate(async ({ path, templateId }) => {
    const project = await window.grapestrap.project.new({
      name: 'previewassets', location: path, templateId
    })
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
  }, { path: projectPath, templateId })
}

async function startPreview(appWindow) {
  await appWindow.evaluate(() =>
    window.__gstrap.eventBus.emit('command', 'view:preview-browser'))
  await appWindow.waitForFunction(
    () => window.__gstrap?.preview?.status()?.url != null, null, { timeout: 15_000 })
  return appWindow.evaluate(() => window.__gstrap.preview.status())
}

// Attribute-order-agnostic tag scrape (compose emits rel before href, but the
// spec must not depend on that).
function stylesheetHrefs(html) {
  const out = []
  for (const [, attrs] of html.matchAll(/<link\b([^>]*)>/gi)) {
    if (!/rel\s*=\s*["']stylesheet["']/i.test(attrs)) continue
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)
    if (href) out.push(href[1])
  }
  return out
}

function scriptSrcs(html) {
  return [...html.matchAll(/<script\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)].map(m => m[1])
}

// url() targets inside a stylesheet, minus data:/external, query/hash stripped
// — resolved by the caller against the stylesheet's own URL, browser-style.
function cssUrlRefs(cssBody) {
  const out = []
  for (const [, raw] of cssBody.matchAll(/url\(\s*['"]?([^'")]+?)['"]?\s*\)/g)) {
    const ref = raw.trim().split(/[?#]/)[0]
    if (!ref || ref.startsWith('data:') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) continue
    out.push(ref)
  }
  return out
}

async function assertAllAssetsServe(pageUrl) {
  const page = await request(pageUrl)
  expect(page.status).toBe(200)

  const failures = []
  const sheets = stylesheetHrefs(page.body)
  expect(sheets.length).toBeGreaterThan(0)

  for (const href of sheets) {
    const url = new URL(href, pageUrl).toString()
    const res = await request(url)
    if (res.status !== 200 || res.headers['content-type'] !== 'text/css') {
      failures.push(`stylesheet ${href} → ${res.status} ${res.headers['content-type']}`)
      continue
    }
    for (const ref of cssUrlRefs(res.body)) {
      const assetUrl = new URL(ref, url).toString()
      const asset = await request(assetUrl)
      if (asset.status !== 200) failures.push(`css url() ${ref} (from ${href}) → ${asset.status}`)
    }
  }

  for (const src of scriptSrcs(page.body)) {
    if (src === '' || /^[a-z][a-z0-9+.-]*:/i.test(src)) continue
    const res = await request(new URL(src, pageUrl).toString())
    if (res.status !== 200 || res.headers['content-type'] !== 'text/javascript') {
      failures.push(`script ${src} → ${res.status} ${res.headers['content-type']}`)
    }
  }

  expect(failures).toEqual([])
}

test('preview: Landing starter page serves every stylesheet, script and css url() it references', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-pv-landing-'))
  const { app, appWindow } = await launch({ GRAPESTRAP_PREVIEW_CMD: STUB_BROWSER })
  await createStarterProject(appWindow, join(projectDir, 'pv.gstrap'), 'landing')

  const status = await startPreview(appWindow)
  await assertAllAssetsServe(status.pageUrl)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('preview: Graphite starter page serves every stylesheet, script and css url() it references', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-pv-graphite-'))
  const { app, appWindow } = await launch({ GRAPESTRAP_PREVIEW_CMD: STUB_BROWSER })
  await createStarterProject(appWindow, join(projectDir, 'pv.gstrap'), 'graphite')

  const status = await startPreview(appWindow)
  await assertAllAssetsServe(status.pageUrl)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// Acceptance §5 root cause (nola1, 2026-08-03): a legacy site-root-relative
// `url("assets/images/…")` sitting in the project stylesheet reached the
// preview cache unmigrated, so the browser resolved it against assets/css/
// and the background 404'd. The one-shot load migration must convert it in
// memory on open, save must persist the converted shape, and the preview must
// serve it resolvable — end to end.
test('legacy css url() migrates on open, persists on save, and previews resolvable', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-pv-legacy-'))
  const projectPath = join(projectDir, 'pv.gstrap')
  const { app, appWindow } = await launch({ GRAPESTRAP_PREVIEW_CMD: STUB_BROWSER })
  await createStarterProject(appWindow, projectPath, 'blank')

  // Seed the legacy shape on disk behind the app's back, exactly like a
  // project last written by a pre-rc.3 build, then reopen so loadProject runs.
  const png1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=',
    'base64'
  )
  await fsp.writeFile(join(projectDir, 'site', 'assets', 'images', 'bg.png'), png1x1)
  const legacyCss = '.hero { background-image: url("assets/images/bg.png"); }\n'
  await fsp.writeFile(join(projectDir, 'site', 'assets', 'css', 'style.css'), legacyCss, 'utf8')

  const memoryCss = await appWindow.evaluate(async path => {
    const project = await window.grapestrap.project.open(path)
    window.__gstrap.projectState.set(project)
    return project.globalCSS
  }, projectPath)
  expect(memoryCss).toContain('url("../images/bg.png")')
  expect(memoryCss).not.toContain('assets/images/bg.png')

  // The migration marks the CSS dirty; a plain save must persist it.
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'file:save')
  })
  await expect.poll(async () =>
    fsp.readFile(join(projectDir, 'site', 'assets', 'css', 'style.css'), 'utf8'),
  { timeout: 10_000 }).toContain('url("../images/bg.png")')

  const status = await startPreview(appWindow)
  const css = await request(new URL('assets/css/style.css', status.pageUrl).toString())
  expect(css.status).toBe(200)
  expect(css.body).toContain('url("../images/bg.png")')
  const img = await request(new URL('assets/css/../images/bg.png', status.pageUrl).toString())
  expect(img.status).toBe(200)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// Acceptance §3→§5 order: the page is edited and SAVED before preview ever
// starts, and again while it runs (step 17). Both the initial export and the
// SSE re-export must keep serving the full asset set, and the stylesheet set
// itself must stay exactly the composed four — a canvas-leaked framework tag
// (absolute gstrap-plugin:// href) would render unstyled in a real browser
// while every relative asset still probes 200.
test('preview: Landing page edited + saved before and during preview keeps its stylesheet set intact', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-pv-landedit-'))
  const { app, appWindow } = await launch({ GRAPESTRAP_PREVIEW_CMD: STUB_BROWSER })
  await createStarterProject(appWindow, join(projectDir, 'pv.gstrap'), 'landing')

  // Step-10 stand-in: mutate an editable region, then a real save.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.getWrapper().append('<p data-spec="acceptance-edit-1">edited before preview</p>')
    window.__gstrap.eventBus.emit('command', 'file:save')
  })
  await appWindow.waitForFunction(
    () => !window.__gstrap.projectState.isDirty(), null, { timeout: 10_000 })

  const status = await startPreview(appWindow)
  await assertAllAssetsServe(status.pageUrl)

  const before = await request(status.pageUrl)
  expect(before.body).toContain('acceptance-edit-1')
  expect(stylesheetHrefs(before.body)).toEqual([
    'assets/css/bootstrap.css',
    'assets/css/bootstrap-icons.css',
    'assets/css/all.css',
    'assets/css/style.css'
  ])

  // Step 17: edit + save while the server runs → debounce → re-export.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.getWrapper().append('<p data-spec="acceptance-edit-2">edited during preview</p>')
    window.__gstrap.eventBus.emit('command', 'file:save')
  })
  await expect.poll(async () =>
    (await request(status.pageUrl)).body.includes('acceptance-edit-2'),
  { timeout: 10_000 }).toBe(true)

  const after = await request(status.pageUrl)
  expect(stylesheetHrefs(after.body)).toEqual([
    'assets/css/bootstrap.css',
    'assets/css/bootstrap-icons.css',
    'assets/css/all.css',
    'assets/css/style.css'
  ])
  await assertAllAssetsServe(status.pageUrl)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
