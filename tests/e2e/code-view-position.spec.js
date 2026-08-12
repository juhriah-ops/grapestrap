/**
 * GrapeStrap — E2E: code-view position fixes
 *
 * PATH: tests/e2e/code-view-position.spec.js
 * ROLE: Workstream A chunk A5 specs (modeled on code-view.spec.js). Covers:
 *       (a) a full document typed into Monaco keeps element order on save;
 *       (b) markup stray-pasted between </head> and <body> is relocated to
 *           the top of body instead of silently vanishing, with a warning
 *           toast (shared/page-html.js#extractPageFromFullHtml +
 *           editor/canvas-sync.js#rebuildCanvasFromCode);
 *       (c) a Code-view edit survives switching to another page tab and
 *           back — pins the panels/canvas/index.js#swapToTab fix that
 *           rebuilds the OUTGOING tab's canvas from Monaco before capture.
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-08-11
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject } from './helpers.js'

/** Switch the active tab to Code view and wait for Monaco to hold content. */
async function switchToCodeView(appWindow) {
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'view:mode-code')
  })
  await appWindow.waitForFunction(() => {
    const m = window.__gstrap?.pluginRegistry?.bound?.monaco
    const editors = m?.editor?.getEditors?.() || []
    return editors.some(e => (e.getValue() || '').trimStart().startsWith('<'))
  }, null, { timeout: 5_000 })
}

/** Overwrite the HTML Monaco editor's value (identified by its content
 *  starting with '<', same heuristic code-view.spec.js uses — the CSS
 *  editor's model never starts with a tag). */
async function setHtmlEditorValue(appWindow, html) {
  await appWindow.evaluate(value => {
    const m = window.__gstrap.pluginRegistry.bound.monaco
    const htmlEditor = m.editor.getEditors().find(e => (e.getValue() || '').trimStart().startsWith('<'))
    htmlEditor.setValue(value)
  }, html)
}

function readHtmlEditorValue(appWindow) {
  return appWindow.evaluate(() => {
    const m = window.__gstrap.pluginRegistry.bound.monaco
    const htmlEditor = m.editor.getEditors().find(e => (e.getValue() || '').trimStart().startsWith('<'))
    return htmlEditor?.getValue() || ''
  })
}

async function save(appWindow) {
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForTimeout(500)
}

test('(a) full document typed in Monaco with <header> as first body child saves header-first on disk', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-cvpos-'))
  const projectPath = join(projectDir, 'a.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await switchToCodeView(appWindow)

  const fullDoc = [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>Home</title></head>',
    '<body>',
    '<header class="site-header">Top of page</header>',
    '<main><h1>Home</h1></main>',
    '</body>',
    '</html>'
  ].join('\n')
  await setHtmlEditorValue(appWindow, fullDoc)
  await save(appWindow)

  const onDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')
  const headerIndex = onDisk.indexOf('site-header')
  const mainIndex = onDisk.indexOf('<main>')
  expect(headerIndex).toBeGreaterThan(-1)
  expect(mainIndex).toBeGreaterThan(-1)
  expect(headerIndex).toBeLessThan(mainIndex)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('(b) markup pasted between </head> and <body> is relocated to the top of body and warns', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-cvpos-'))
  const projectPath = join(projectDir, 'b.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await switchToCodeView(appWindow)

  const toasts = []
  await appWindow.exposeFunction('__captureCvToast', p => { toasts.push(p) })
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.on('toast', p => window.__captureCvToast(p))
  })

  // <header> sits between </head> and <body> — a real browser's parser would
  // silently hoist it to the top of <body>; extractPageFromFullHtml makes
  // that explicit (shared/page-html.js) instead of the content vanishing.
  const strayDoc = [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>Home</title></head>',
    '<header class="stray-header">Pasted outside body</header>',
    '<body>',
    '<main><h1>Home</h1></main>',
    '</body>',
    '</html>'
  ].join('\n')
  await setHtmlEditorValue(appWindow, strayDoc)

  // Save while still in Code view — flushActiveTabIntoProject rebuilds the
  // canvas from Monaco (menu-router.js), which is where the extraction (and
  // the toast) happens.
  await save(appWindow)

  const strayToast = toasts.find(t => t?.type === 'warning' && /outside/i.test(t.message || ''))
  expect(strayToast).toBeTruthy()

  const onDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')
  const headerIndex = onDisk.indexOf('stray-header')
  const mainIndex = onDisk.indexOf('<main>')
  expect(headerIndex).toBeGreaterThan(-1)
  expect(mainIndex).toBeGreaterThan(-1)
  expect(headerIndex).toBeLessThan(mainIndex)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('(c) a Code-view edit survives switching to another page tab and back', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-cvpos-'))
  const projectPath = join(projectDir, 'c.gstrap')
  const SENTINEL = '<p data-testid="swap-sentinel">preserved-across-swap</p>'

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  const firstPageName = await appWindow.evaluate(() => window.__gstrap.pageState.active().pageName)
  await switchToCodeView(appWindow)

  // Edit the full document in place (append the sentinel just before
  // </body>) rather than replacing it wholesale, so this stays a realistic
  // "user typed inside the existing doc" edit.
  const current = await readHtmlEditorValue(appWindow)
  await setHtmlEditorValue(appWindow, current.replace('</body>', `${SENTINEL}\n</body>`))

  // Switch to a second page WITHOUT saving first. Before the swapToTab fix,
  // the canvas (and therefore the captured html) never saw this Monaco-only
  // edit, so it was silently dropped on the tab switch.
  await appWindow.evaluate(() => { window.__gstrap.templates.createPage('page-two') })
  await appWindow.waitForFunction(
    () => window.__gstrap.pageState.active()?.pageName === 'page-two', null, { timeout: 5_000 })

  // Switch back to the first page.
  await appWindow.evaluate(name => { window.__gstrap.pageState.open(name) }, firstPageName)
  await appWindow.waitForFunction(
    name => window.__gstrap.pageState.active()?.pageName === name, firstPageName, { timeout: 5_000 })

  // The edit must be preserved in projectState immediately (synchronous
  // result of the swapToTab fix) — the canvas DOM confirms it's actually
  // showing, not just sitting in memory unrendered.
  const pageHtml = await appWindow.evaluate(name =>
    window.__gstrap.projectState.getPage(name)?.html || '', firstPageName)
  expect(pageHtml).toContain('swap-sentinel')

  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('[data-testid="swap-sentinel"]')
  }, null, { timeout: 10_000 })

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
