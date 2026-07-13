/**
 * GrapeStrap — E2E: starter templates
 *
 * PATH: tests/e2e/starter-templates.spec.js
 * ROLE: Wave 4 Starter Templates specs — Landing acceptance anchor (disk
 *       shapes + manifest round-trip + chrome locked), Portfolio vendoring +
 *       head-link round-trip + clean export, Blog multi-page propagation,
 *       blank-path regression pin, unknown-id fail-open, New Project dialog
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 *
 * Written to FAIL on the pre-integration baseline (templateId is dropped by
 * ipc-handlers `project:new`, so tests 1-3 and 5 see a blank project; test 4
 * is the regression pin and passes trivially; test 6 fails until the dialog
 * lands). Conventions per templates.spec.js: one launch per test, per-test
 * mkdtemp project dirs (self-cleaning via OS tmp), null-safe waitForFunction
 * predicates, constants threaded as evaluate args — no closure capture.
 */
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, EXPECTED_PLUGIN_COUNT } from './helpers.js'

// openSeedProject() hardcodes a blank project; starters need templateId, so
// this file carries its own seed helper (same waits, extra param threaded).
async function createStarterProject(appWindow, projectPath, templateId) {
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 })
  return await appWindow.evaluate(async ({ path, templateId }) => {
    const config = { name: 'startertest', location: path }
    if (templateId !== undefined) config.templateId = templateId
    const project = await window.grapestrap.project.new(config)
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
    return {
      pages: project.pages.map(p => ({ name: p.name, templateName: p.templateName })),
      templates: (project.templates || []).map(tp =>
        ({ name: tp.name, file: tp.file, regions: tp.regions, hasHtml: !!tp.html })),
      vendorDeps: project.manifest.vendorDeps || [],
      starter: project.manifest.metadata.starter || null
    }
  }, { path: projectPath, templateId })
}

async function waitForCanvasComponents(appWindow) {
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-cid]').length > 0,
    null, { timeout: 10_000 }
  )
}

const fileExists = p => fsp.access(p).then(() => true, () => false)

test('Landing starter: master + composed page on disk, manifest round-trips, chrome locked', async () => {
  // The acceptance-path anchor (Wave 6 step 1 = "create-from-Landing-starter").
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-starter-'))
  const projectPath = join(projectDir, 'landing.gstrap')

  const { app, appWindow } = await launch()
  const shape = await createStarterProject(appWindow, projectPath, 'landing')

  // ── State shape returned through project:new → loadProject ────────────────
  expect(shape.pages).toEqual([{ name: 'index', templateName: 'site' }])
  expect(shape.templates).toEqual([{
    name: 'site',
    file: 'templates/site.gstrap-tpl',
    regions: [{ id: 'content', label: 'Page content' }],
    hasHtml: true
  }])
  expect(shape.starter).toBe('landing')

  // ── Disk shapes ────────────────────────────────────────────────────────────
  const tplOnDisk = await fsp.readFile(join(projectDir, 'site', 'templates', 'site.gstrap-tpl'), 'utf8')
  expect(tplOnDisk).toContain('data-grpstr-region="content"')
  expect(tplOnDisk).not.toMatch(/<!doctype|<html/i) // body-only fragment

  const pageOnDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')
  expect(pageOnDisk).toMatch(/^<!doctype html/i) // full document
  expect(pageOnDisk).toContain('data-grpstr-region="content"')
  expect(pageOnDisk).toContain('Headline that converts') // composed content, not region default

  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(manifest.templates[0]).toEqual({
    name: 'site',
    file: 'templates/site.gstrap-tpl',
    regions: [{ id: 'content', label: 'Page content' }]
  }) // no html key persisted
  expect(manifest.pages[0].templateName).toBe('site')
  expect(manifest.metadata.starter).toBe('landing')

  // ── Chrome locked / region editable (W2 lock path fires for starters) ─────
  await waitForCanvasComponents(appWindow)
  const footerLocks = await appWindow.evaluate(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    if (!ed) return null
    function find(c) {
      if ((c.get?.('tagName') || '').toLowerCase() === 'footer') return c
      for (const k of (c.components?.() || [])) { const r = find(k); if (r) return r }
      return null
    }
    const c = find(ed.getWrapper())
    return c ? { removable: c.get('removable') } : null
  })
  expect(footerLocks).toEqual({ removable: false })

  const regionChildLocks = await appWindow.evaluate(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    if (!ed) return null
    let child = null
    function walk(c) {
      const attrs = c.getAttributes?.() || {}
      if (attrs['data-grpstr-region']) { child = c.components?.().at?.(0) || null; return }
      for (const k of (c.components?.() || [])) { if (!child) walk(k) }
    }
    walk(ed.getWrapper())
    return child ? { removable: child.get('removable') } : null
  })
  expect(regionChildLocks).not.toBeNull()
  expect(regionChildLocks.removable).not.toBe(false)

  // ── Manifest round-trip: reopen from disk ──────────────────────────────────
  const reopened = await appWindow.evaluate(async path => {
    const p2 = await window.grapestrap.project.open(path)
    return {
      tplHtml: p2.templates[0]?.html,
      pageTemplateName: p2.pages[0]?.templateName,
      starter: p2.manifest.metadata.starter
    }
  }, projectPath)
  expect(reopened.tplHtml).toBe(tplOnDisk) // byte-equal
  expect(reopened.pageTemplateName).toBe('site')
  expect(reopened.starter).toBe('landing')

  await app.close()
})

test('Portfolio starter: glightbox vendored in-project, head-linked round-trip, export clean', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-starter-'))
  const projectPath = join(projectDir, 'portfolio.gstrap')

  const { app, appWindow } = await launch()
  const shape = await createStarterProject(appWindow, projectPath, 'portfolio')
  expect(shape.vendorDeps).toEqual(['glightbox'])

  // ── Disk: vendor + starter text assets ─────────────────────────────────────
  const site = join(projectDir, 'site')
  expect(await fileExists(join(site, 'assets', 'vendor', 'glightbox', 'glightbox.css'))).toBe(true)
  expect(await fileExists(join(site, 'assets', 'vendor', 'glightbox', 'glightbox.js'))).toBe(true)
  expect(await fileExists(join(site, 'assets', 'images', 'work-1.svg'))).toBe(true)
  expect(await fileExists(join(site, 'assets', 'images', 'work-6.svg'))).toBe(true)
  expect(await fileExists(join(site, 'assets', 'js', 'site.js'))).toBe(true)

  const pageOnDisk = await fsp.readFile(join(site, 'pages', 'index.html'), 'utf8')
  expect(pageOnDisk).toContain('assets/vendor/glightbox/glightbox.css') // data-grpstr-link
  expect(pageOnDisk).toContain('assets/vendor/glightbox/glightbox.js')  // data-grpstr-script
  expect(pageOnDisk).toContain('class="glightbox')
  expect(pageOnDisk).toContain('assets/images/work-1.svg')

  // ── Head extras round-trip through load ────────────────────────────────────
  const reopened = await appWindow.evaluate(async path => {
    const p2 = await window.grapestrap.project.open(path)
    return {
      firstLinkHref: p2.pages[0]?.head?.customLinks?.[0]?.href,
      scriptSrcs: (p2.pages[0]?.head?.customScripts || []).map(s => s.src)
    }
  }, projectPath)
  expect(reopened.firstLinkHref).toBe('assets/vendor/glightbox/glightbox.css')
  expect(reopened.scriptSrcs).toEqual([
    'assets/vendor/glightbox/glightbox.js',
    'assets/js/site.js'
  ])

  // ── Export: vendor assets ride along; masters never leave the project ─────
  const outDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-starter-export-'))
  await appWindow.evaluate(async out => {
    await window.grapestrap.project.export(window.__gstrap.projectState.current, out)
  }, outDir)

  const exportedIndex = await fsp.readFile(join(outDir, 'index.html'), 'utf8')
  expect(exportedIndex).toContain('assets/vendor/glightbox/glightbox.css')
  expect(exportedIndex).toContain('class="glightbox')
  expect(await fileExists(join(outDir, 'assets', 'vendor', 'glightbox', 'glightbox.js'))).toBe(true)

  // Walk the export tree: no .gstrap-tpl file, no templates/ dir anywhere.
  const offenders = []
  async function walkOut(dir) {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'templates') offenders.push(p)
        await walkOut(p)
      } else if (entry.name.endsWith('.gstrap-tpl')) {
        offenders.push(p)
      }
    }
  }
  await walkOut(outDir)
  expect(offenders).toEqual([])

  await app.close()
})

test('Blog starter: two templated pages; template edit propagates chrome to both', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-starter-'))
  const projectPath = join(projectDir, 'blog.gstrap')

  const { app, appWindow } = await launch()
  const shape = await createStarterProject(appWindow, projectPath, 'blog')
  expect(shape.pages).toEqual([
    { name: 'index', templateName: 'site' }, // index FIRST — it's the opened tab
    { name: 'post', templateName: 'site' }
  ])
  expect(await fileExists(join(projectDir, 'site', 'pages', 'post.html'))).toBe(true)

  // Propagation smoke through the shipped W2 surface. Starter pages carry
  // regions:{} snapshots — propagation extracts region content from each
  // page's html live (the self-heal path), so this also pins that contract.
  await waitForCanvasComponents(appWindow)
  const result = await appWindow.evaluate(() => {
    const { projectState, templates } = window.__gstrap
    const tpl = projectState.getTemplate('site')
    const edited = tpl.html.replace('My Blog. Powered by plain HTML.', 'PROPAGATED-FOOTER')
    tpl.html = edited
    templates.propagateTemplate('site', edited)
    return projectState.current.pages.map(p => ({
      name: p.name,
      hasChrome: p.html.includes('PROPAGATED-FOOTER'),
      keptOwn: p.name === 'post'
        ? p.html.includes('Hello, world')
        : p.html.includes('Notes on building')
    }))
  })
  expect(result).toEqual([
    { name: 'index', hasChrome: true, keptOwn: true },
    { name: 'post', hasChrome: true, keptOwn: true }
  ])

  await app.close()
})

test('blank path unchanged: templateId omitted produces today\'s blank project (regression pin)', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-starter-'))
  const projectPath = join(projectDir, 'blank.gstrap')

  const { app, appWindow } = await launch()
  const shape = await createStarterProject(appWindow, projectPath, undefined)
  expect(shape.pages).toEqual([{ name: 'index', templateName: null }])
  expect(shape.templates).toEqual([])
  expect(shape.vendorDeps).toEqual([])
  expect(shape.starter).toBeNull() // no metadata.starter key for blank

  expect(await fileExists(join(projectDir, 'site', 'templates'))).toBe(false)
  expect(await fileExists(join(projectDir, 'site', 'assets', 'vendor'))).toBe(false)
  const pageOnDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')
  expect(pageOnDisk).toContain('Welcome to your new GrapeStrap project')

  await app.close()
})

test('unknown starter id fails open to a blank project (no throw)', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-starter-'))
  const projectPath = join(projectDir, 'unknown.gstrap')

  const { app, appWindow } = await launch()
  const shape = await createStarterProject(appWindow, projectPath, 'no-such-starter')
  // Promise resolved — project created, not null/throw.
  expect(shape.pages).toEqual([{ name: 'index', templateName: null }])
  expect(shape.templates).toEqual([])
  expect(shape.vendorDeps).toEqual([])
  expect(await fileExists(join(projectDir, 'site', 'templates'))).toBe(false)

  await app.close()
})

test('New Project dialog: starter select populated, Blank default, Esc cancels', async () => {
  // No project needed; drives the renderer dialog only. The dialog is never
  // submitted, so the native parent-folder picker is never reached.
  const { app, appWindow } = await launch()
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 })

  // Fire-and-forget: cmdNewProject awaits the dialog promise.
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'file:new-project')
  })
  await appWindow.waitForSelector('[data-npr-starter]')

  const state = await appWindow.evaluate(() => {
    const select = document.querySelector('[data-npr-starter]')
    const input = document.querySelector('[data-npr-name]')
    return {
      value: select.value,
      options: [...select.options].map(o => o.value),
      name: input.value
    }
  })
  expect(state.value).toBe('blank')
  expect(state.options).toEqual(['blank', 'landing', 'portfolio', 'blog'])
  expect(state.name).toBe('My Project')

  await appWindow.keyboard.press('Escape')
  await appWindow.waitForFunction(
    () => document.querySelector('[data-npr-starter]') === null,
    null, { timeout: 5_000 })

  await app.close()
})
