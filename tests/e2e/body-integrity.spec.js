/**
 * GrapeStrap — E2E: single-body integrity (canvas capture → code → disk)
 *
 * PATH: tests/e2e/body-integrity.spec.js
 * ROLE: Regression for the nola1 2026-08-07 "double body tags in any
 *       project" report. GrapesJS's getHtml() wraps its output in <body>;
 *       the capture/sync boundaries now strip it, so: a fresh project's
 *       Code view and saved page files carry exactly ONE body; template
 *       pages likewise; and a legacy page file corrupted with a nested
 *       body heals on project open.
 * DEPENDS: @playwright/test, ./helpers.js, src/shared/page-html.js,
 *          src/renderer/editor/grapesjs-init.js, src/main/project-manager.js
 * CREATED: 2026-08-07
 */
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome } from './helpers.js'

const bodyCount = s => (String(s).match(/<body\b/gi) || []).length

test('fresh project: Code view and saved page file carry exactly one body tag', async () => {
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  const dir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-body-'))
  await openSeedProject(appWindow, join(dir, 'b.gstrap'))

  await appWindow.evaluate(() => {
    const { pageState } = window.__gstrap
    pageState.setViewMode(pageState.active().pageName, 'code')
  })
  await appWindow.waitForFunction(() =>
    (window.__gstrap.getMonacoPair()?.htmlEditor?.getValue() || '').includes('<body'),
  null, { timeout: 10_000 })
  const codeValue = await appWindow.evaluate(() =>
    window.__gstrap.getMonacoPair().htmlEditor.getValue())
  expect(bodyCount(codeValue)).toBe(1)

  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForFunction(() =>
    window.__gstrap.projectState.dirtyPages.size === 0, null, { timeout: 10_000 })
  const disk = await fsp.readFile(join(dir, 'site', 'pages', 'index.html'), 'utf8')
  expect(bodyCount(disk)).toBe(1)

  await app.close()
})

test('template page: Code view + page file + template file all single/no body', async () => {
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  const dir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-body-'))
  await openSeedProject(appWindow, join(dir, 'b.gstrap'))

  await appWindow.evaluate(async () => {
    const g = window.__gstrap
    g.templates.createTemplate('base')
    await new Promise(r => setTimeout(r, 400))
    g.templates.createPage('tpage', 'base')
    await new Promise(r => setTimeout(r, 400))
    g.pageState.setViewMode('tpage', 'code')
  })
  await appWindow.waitForFunction(() =>
    (window.__gstrap.getMonacoPair()?.htmlEditor?.getValue() || '').includes('<body'),
  null, { timeout: 10_000 })
  const codeValue = await appWindow.evaluate(() =>
    window.__gstrap.getMonacoPair().htmlEditor.getValue())
  expect(bodyCount(codeValue)).toBe(1)

  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForFunction(() =>
    window.__gstrap.projectState.dirtyPages.size === 0, null, { timeout: 10_000 })
  expect(bodyCount(await fsp.readFile(join(dir, 'site', 'pages', 'tpage.html'), 'utf8'))).toBe(1)
  // Template files are body-only fragments — no body tag at all.
  expect(bodyCount(await fsp.readFile(join(dir, 'site', 'templates', 'base.gstrap-tpl'), 'utf8'))).toBe(0)

  await app.close()
})

test('legacy nested-body page file heals on project open and stays healed on save', async () => {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-body-'))
  const manifestPath = join(dir, 'b.gstrap')

  // Create + save a clean project, then corrupt the page file the way
  // pre-fix builds wrote it (double body), plus a body-wrapped template.
  {
    const { app, appWindow } = await launch()
    await dismissWelcome(appWindow)
    await openSeedProject(appWindow, manifestPath)
    await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
    await appWindow.waitForFunction(() =>
      window.__gstrap.projectState.dirtyPages.size === 0, null, { timeout: 10_000 })
    await app.close()
  }
  const pageFile = join(dir, 'site', 'pages', 'index.html')
  const clean = await fsp.readFile(pageFile, 'utf8')
  const corrupted = clean.replace(/<body>/i, '<body>\n<body>').replace(/<\/body>/i, '</body>\n</body>')
  expect(bodyCount(corrupted)).toBe(2)
  await fsp.writeFile(pageFile, corrupted, 'utf8')

  // Reopen: load heals; the code view shows one body; a save writes one.
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await appWindow.evaluate(async path => {
    const project = await window.grapestrap.project.open(path)
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
  }, manifestPath)
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-cid]').length > 0, null, { timeout: 10_000 })

  const memBodies = await appWindow.evaluate(() =>
    (window.__gstrap.projectState.current.pages[0].html.match(/<body\b/gi) || []).length)
  expect(memBodies).toBe(0)

  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForFunction(() =>
    window.__gstrap.projectState.dirtyPages.size === 0, null, { timeout: 10_000 })
  expect(bodyCount(await fsp.readFile(pageFile, 'utf8'))).toBe(1)

  await app.close()
})
