/**
 * GrapeStrap — E2E: project lifecycle
 *
 * PATH: tests/e2e/project-lifecycle.spec.js
 * ROLE: Project create/open/save/refresh, on-disk layout, and persistence specs
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject } from './helpers.js'

/**
 * GrapeStrap — M1 smoke test
 *
 * Exercises the walking-skeleton end-to-end: create project → confirm canvas
 * loads index page → mutate page html via projectState → save → reopen the
 * .gstrap manifest in a fresh launch and confirm the mutation survived disk.
 *
 * Drag-and-drop block insertion is intentionally NOT exercised here — the
 * GrapesJS DnD path is hard to drive deterministically from Playwright until
 * the canvas iframe gets a stable test handle. M1 cares about manifest +
 * page-html persistence; block DnD is its own M2 spec.
 */

test('M1 smoke: open → edit → save → reopen', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-smoke-'))
  const projectPath = join(projectDir, 'smoke.gstrap')
  const SENTINEL = '<p data-testid="smoke-sentinel">smoke-test-sentinel</p>'

  // ── Pass 1: create project, mutate index page, save ─────────────────────────
  {
    const { app, appWindow } = await launch()

    // Wait for plugin host to come up so canvas is ready to swap content.
    await appWindow.waitForFunction(
      () => window.__gstrap?.pluginRegistry?.activated?.length === 5,
      null, { timeout: 15_000 }
    )

    // Drive project creation through the same IPC the renderer uses on File→New,
    // bypassing the native dialog.
    await appWindow.evaluate(async path => {
      const project = await window.grapestrap.project.new({
        name: 'smoke', location: path
      })
      const { projectState, pageState } = window.__gstrap
      projectState.set(project)
      pageState.open(project.pages[0].name)
    }, projectPath)

    // Mutate the index page html via projectState (simulates an edit).
    await appWindow.evaluate(html => {
      const { projectState } = window.__gstrap
      const page = projectState.getPage('index')
      page.html = html
      projectState.markPageDirty('index')
    }, SENTINEL)

    // Save through the same project:save IPC the menu router uses.
    await appWindow.evaluate(async () => {
      const { projectState } = window.__gstrap
      await window.grapestrap.project.save(projectState.current)
    })

    await app.close()
  }

  // Sanity: the page html landed on disk.
  const onDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')
  expect(onDisk).toContain('smoke-test-sentinel')

  // ── Pass 2: relaunch, open the saved project, confirm content survived ──────
  {
    const { app, appWindow } = await launch()

    const reloadedHtml = await appWindow.evaluate(async path => {
      const project = await window.grapestrap.project.open(path)
      const { projectState } = window.__gstrap
      projectState.set(project)
      const page = projectState.getPage('index')
      return page.html
    }, projectPath)

    expect(reloadedHtml).toContain('smoke-test-sentinel')

    await app.close()
  }

  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('File menu: cmdNewProject path does not throw on the prompt step', async () => {
  // Regression for the silent failure where window.prompt() throws in modern
  // Electron ("prompt() is and will not be supported.") and the throw was
  // being swallowed by the eventBus try/catch — File→New / File→New Page
  // both did nothing visible. The fix replaced window.prompt with our own
  // text-prompt dialog AND added an outer try/catch in handleCommand that
  // toasts errors. This spec asserts (a) the prompt dialog actually appears,
  // and (b) clicking Cancel resolves cleanly without a thrown command error.
  const { app, appWindow } = await launch()
  // Wait for boot to subscribe handlers (boot is async; launch() only waits
  // for window.__gstrap to be defined, which happens synchronously before
  // boot() starts wiring listeners).
  await appWindow.waitForFunction(
    () => window.__gstrap.eventBus.listenerCount('command') > 0,
    null, { timeout: 10_000 }
  )
  // Clear any leftover modal so visibility checks aren't confused.
  await appWindow.evaluate(() => {
    document.querySelectorAll('#gstrap-modals > *').forEach(n => n.remove())
    window.__gstrap.eventBus.emit('command', 'file:new-project')
  })
  await appWindow.waitForSelector('.gstrap-prompt-card', { timeout: 3_000 })
  const title = await appWindow.locator('.gstrap-prompt-title').textContent()
  expect(title).toBe('New project')
  // Cancel — should NOT emit an error toast.
  let toastedError = false
  await appWindow.exposeFunction('__captureToast', payload => {
    if (payload?.type === 'error') toastedError = true
  })
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.on('toast', p => window.__captureToast(p))
    document.querySelector('[data-action="cancel"]').click()
  })
  await appWindow.waitForFunction(() => !document.querySelector('.gstrap-prompt-card'), null, { timeout: 2_000 })
  expect(toastedError).toBe(false)
  await app.close()
})

test('Save: Ctrl+S keystroke writes the canvas to disk', async () => {
  // Regression for the user's "Ctrl+S doesn't work" report (2026-05-02 EOD).
  // Root cause: native menu accelerators (CmdOrCtrl+S in src/main/menus.js)
  // never fire on Linux when an iframe / Monaco has focus or the menu bar is
  // auto-hidden — the diagnostic showed the keystroke reached the document
  // but no menu:action IPC ever followed. Fix: renderer-side keybindings
  // layer (src/renderer/shortcuts/keybindings.js) catches the keydown in
  // capture phase and dispatches via the same eventBus 'command' channel
  // the menu-router already handles. This spec exercises the real keystroke,
  // not just the eventBus path the next spec covers.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-save-key-'))
  const projectPath = join(projectDir, 'savekey.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.setComponents('<p data-testid="key-sentinel">ctrl-s-sentinel</p>')
  })

  const toasts = []
  await appWindow.exposeFunction('__captureKeyToast', p => { toasts.push(p) })
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.on('toast', p => window.__captureKeyToast(p))
  })

  // Press Ctrl+S. The renderer-side keybindings layer (wireKeybindings) catches
  // this in document keydown capture and dispatches 'file:save' on the event
  // bus — same path the menu router listens on. Native menu accelerators are
  // unreliable on Linux + iframe-focused contexts so we don't depend on them.
  await appWindow.bringToFront().catch(() => {})
  await appWindow.keyboard.press('Control+s')
  await appWindow.waitForTimeout(1500)

  const onDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8').catch(() => '')
  const errors = toasts.filter(t => t?.type === 'error')
  expect(errors).toEqual([])
  expect(onDisk).toContain('ctrl-s-sentinel')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Save (file:save command): edits in canvas land on disk; no error toast', async () => {
  // Regression for the EOD 2026-05-02 bug: user reported Ctrl+S "doesn't work."
  // The M1 smoke test mutates page.html directly and bypasses both
  // flushActiveTabIntoProject and the menu-router cmdSave path. This spec
  // exercises the full real-user flow:
  //   - create project (the cmdSave flow used by File→Save / Ctrl+S)
  //   - edit the canvas via the GrapesJS editor (NOT direct page.html)
  //   - dispatch the same `file:save` command the menu/keyboard sends
  //   - verify (a) no error toast, (b) "Saved." success toast, (c) disk updated
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-save-'))
  const projectPath = join(projectDir, 'save.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Mutate via the GrapesJS editor so flushActiveTabIntoProject's
  // getCanvasHtml() path is what carries the change to disk.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.setComponents('<p data-testid="save-sentinel">save-flow-sentinel</p>')
  })

  // Capture toasts so we see error vs success and any silent failures.
  const toasts = []
  await appWindow.exposeFunction('__captureSaveToast', p => { toasts.push(p) })
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.on('toast', p => window.__captureSaveToast(p))
  })

  // Dispatch the same command the menu accelerator (CmdOrCtrl+S) sends.
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'file:save')
  })

  // Wait for the save round-trip to finish (success or error toast).
  await appWindow.waitForFunction(
    () => window.__gstrap_save_done === true,
    null, { timeout: 5_000 }
  ).catch(() => {})
  // Fallback: small wait for toast IPC to flush.
  await appWindow.waitForTimeout(500)

  const errors = toasts.filter(t => t?.type === 'error')
  expect(errors).toEqual([])
  const successes = toasts.filter(t => t?.type === 'success' && /saved/i.test(t.message || ''))
  expect(successes.length).toBeGreaterThan(0)

  const onDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')
  expect(onDisk).toContain('save-flow-sentinel')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Project layout: .gstrap at root + site/ subdir for deployable web content', async () => {
  // v0.0.2-alpha.2 — projects keep deployable web content under
  // <projectDir>/site/ so the project folder is self-contained and the
  // site/ tree can be rsynced as-is. Verifies:
  //   1. createProject puts pages, assets, style.css under site/.
  //   2. The .gstrap manifest sits at <projectDir>/<name>.gstrap (NOT inside site/).
  //   3. Old-layout projects (pages/ as sibling of manifest) are rejected with
  //      a path-of-action error message.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-layout-'))
  const projectPath = join(projectDir, 'layout.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  const siteExists      = await fsp.access(join(projectDir, 'site')).then(() => true, () => false)
  const indexInSite     = await fsp.access(join(projectDir, 'site', 'pages', 'index.html')).then(() => true, () => false)
  // alpha.7+: project's custom CSS lives at assets/css/style.css alongside
  // the framework — one assets/ tree both in canvas and on the deploy.
  const stylecssInSite  = await fsp.access(join(projectDir, 'site', 'assets', 'css', 'style.css')).then(() => true, () => false)
  const assetsImagesDir = await fsp.access(join(projectDir, 'site', 'assets', 'images')).then(() => true, () => false)
  const manifestAtRoot  = await fsp.access(projectPath).then(() => true, () => false)
  const oldPagesAtRoot  = await fsp.access(join(projectDir, 'pages')).then(() => true, () => false)

  expect(siteExists).toBe(true)
  expect(indexInSite).toBe(true)
  expect(stylecssInSite).toBe(true)
  expect(assetsImagesDir).toBe(true)
  expect(manifestAtRoot).toBe(true)
  expect(oldPagesAtRoot).toBe(false)

  await app.close()

  // Synthesize a v0.0.1-style project to confirm the old-layout guard fires.
  const oldDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-old-'))
  await fsp.mkdir(join(oldDir, 'pages'), { recursive: true })
  await fsp.writeFile(join(oldDir, 'pages', 'index.html'), '<main></main>', 'utf8')
  const oldManifestPath = join(oldDir, 'old.gstrap')
  await fsp.writeFile(oldManifestPath, JSON.stringify({
    version: '1.0',
    format: 'grapestrap-project',
    metadata: { name: 'old', created: '', modified: '', lastSavedAt: '', appVersion: '' },
    pages: [{ name: 'index', file: 'pages/index.html' }],
    templates: [], libraryItems: [], snippets: [],
    globalCSS: 'style.css', palette: [], assets: [], vendorDeps: [], plugins: [],
    preferences: {}
  }), 'utf8')

  const { app: app2, appWindow: w2 } = await launch()
  await w2.waitForFunction(
    () => window.__gstrap?.pluginRegistry?.activated?.length === 5,
    null, { timeout: 15_000 }
  )
  const errorMsg = await w2.evaluate(async (path) => {
    try { await window.grapestrap.project.open(path); return null }
    catch (err) { return String(err?.message || err) }
  }, oldManifestPath)
  expect(errorMsg).toBeTruthy()
  expect(errorMsg).toMatch(/Old project layout/i)

  await app2.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
  await fsp.rm(oldDir,     { recursive: true, force: true })
})

test('Refresh toolbar action: saves to disk + re-emits sync events', async () => {
  // Reported on nola1: "there should be a refresh ability to make sure
  // all assets actually save." Belt-and-suspenders Save + resync.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-rfr-'))
  const projectPath = join(projectDir, 'rfr.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Mutate globalCSS (lives independent of canvas, so flushActiveTabIntoProject
  // can't clobber it) — the per-page html flush path is already covered by
  // the M1 smoke spec; this one is specifically about Refresh's resync +
  // event-broadcast behavior.
  await appWindow.evaluate(() => {
    const { projectState } = window.__gstrap
    projectState.current.globalCSS = '/* refreshed */\n'
    projectState.markCssDirty()
  })

  // Capture the events the refresh broadcasts. Shared via window so the
  // round-trip through exposeFunction isn't on the hot path.
  await appWindow.evaluate(() => {
    window.__rfr_events = []
    ;['project:saved', 'project:css-changed', 'assets:changed', 'library:changed'].forEach(name => {
      window.__gstrap.eventBus.on(name, () => window.__rfr_events.push(name))
    })
  })

  await appWindow.evaluate(() => {
    document.querySelector('[data-cmd="file:refresh"]').click()
  })

  // cmdRefresh is async (project:save IPC round-trip). Wait until the
  // toast event fires so we know it's done.
  await appWindow.waitForFunction(
    () => (window.__rfr_events || []).includes('project:saved'),
    null, { timeout: 5_000 }
  )
  const events = await appWindow.evaluate(() => window.__rfr_events)

  // Disk reflects the css mutation. Lives at assets/css/style.css alongside
  // the framework so the canvas + deploy share one assets/ tree.
  const styleCss = await fsp.readFile(join(projectDir, 'site', 'assets', 'css', 'style.css'), 'utf8')
  expect(styleCss).toContain('refreshed')

  // All four sync events fired.
  expect(events).toEqual(expect.arrayContaining([
    'project:saved', 'project:css-changed', 'assets:changed', 'library:changed'
  ]))

  // Dirty flags cleared.
  const stillDirty = await appWindow.evaluate(() => {
    const ps = window.__gstrap.projectState
    return { css: ps.globalCssDirty }
  })
  expect(stillDirty.css).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Pages on disk: saved as full HTML with framework links in <head>', async () => {
  // Reported by user 2026-05-04: ".html editor theres no reference in
  // header meta." alpha.7 architectural change: pages are saved as full
  // HTML documents on disk so each file is a real standalone webpage with
  // <head> containing the framework + project-css links + the manifest's
  // per-page meta. The Code-view editor in-app shows the same composed
  // doc, and edits to the head section round-trip back into the manifest's
  // page.head fields.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-fulldoc-'))
  const projectPath = join(projectDir, 'fulldoc.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Save to flush whatever the canvas currently shows back to disk.
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'file:save')
  })
  await appWindow.waitForTimeout(400)

  // The on-disk file must be a full HTML document with the framework links.
  const onDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')
  expect(onDisk).toMatch(/<!doctype html>/i)
  expect(onDisk).toMatch(/<html\b/i)
  expect(onDisk).toMatch(/<head>/i)
  expect(onDisk).toMatch(/<meta charset="utf-8">/i)
  expect(onDisk).toMatch(/<meta name="viewport"/i)
  expect(onDisk).toMatch(/<title>/i)
  // Framework links — present and pointing at un-minified project-relative
  // paths (devtools-friendly default).
  expect(onDisk).toMatch(/<link[^>]*href="assets\/css\/bootstrap\.css"[^>]*>/i)
  expect(onDisk).toMatch(/<link[^>]*href="assets\/css\/bootstrap-icons\.css"[^>]*>/i)
  expect(onDisk).toMatch(/<link[^>]*href="assets\/css\/all\.css"[^>]*>/i)
  expect(onDisk).toMatch(/<link[^>]*href="assets\/css\/style\.css"[^>]*>/i)
  expect(onDisk).toMatch(/<script[^>]*src="assets\/js\/bootstrap\.bundle\.js"[^>]*defer[^>]*>/i)
  // Body still contains the seed content.
  expect(onDisk).toMatch(/<main\b/i)

  // Round-trip: re-open the project (next-launch simulation) and the
  // canvas page.html should still hold ONLY the body, with head fields
  // back in manifest.head — the full-doc -> body extraction must be
  // lossless on the parts the user edits.
  await app.close()

  const { app: app2, appWindow: w2 } = await launch()
  await w2.waitForFunction(
    () => window.__gstrap?.pluginRegistry?.activated?.length === 5,
    null, { timeout: 15_000 }
  )
  const reload = await w2.evaluate(async path => {
    const project = await window.grapestrap.project.open(path)
    return {
      bodyHasMain:    /<main\b/i.test(project.pages[0].html),
      bodyHasDoctype: /<!doctype/i.test(project.pages[0].html),
      bodyHasHead:    /<head\b/i.test(project.pages[0].html),
      headTitle:      project.pages[0].head?.title || ''
    }
  }, projectPath)

  expect(reload.bodyHasMain).toBe(true)        // body content preserved
  expect(reload.bodyHasDoctype).toBe(false)    // body-only in memory
  expect(reload.bodyHasHead).toBe(false)       // body-only in memory
  // Title round-tripped from disk through the parser.
  expect(reload.headTitle.length).toBeGreaterThan(0)

  await app2.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Project creation: Bootstrap + BSI + FA copied into site/assets/ at create time', async () => {
  // alpha.6 architectural change: a freshly-created project ships with the
  // framework assets in its OWN site/ tree so canvas preview === server
  // deploy. Preview just rsync the site/ dir and the same relative paths
  // resolve correctly under HTTP.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-fwbundle-'))
  const projectPath = join(projectDir, 'fwbundle.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Both un-min + min ship for every framework (alpha.7) — un-min is the
  // default link target, .min is there so a deploy can swap to the
  // production version without re-running copy.
  const checks = [
    'site/assets/css/bootstrap.css',
    'site/assets/css/bootstrap.min.css',
    'site/assets/css/bootstrap-icons.css',
    'site/assets/css/bootstrap-icons.min.css',
    'site/assets/css/all.css',
    'site/assets/css/all.min.css',
    'site/assets/css/fonts/bootstrap-icons.woff2',
    'site/assets/js/bootstrap.bundle.js',
    'site/assets/js/bootstrap.bundle.min.js',
    'site/assets/webfonts/fa-solid-900.woff2',
    'site/assets/webfonts/fa-regular-400.woff2',
    'site/assets/webfonts/fa-brands-400.woff2'
  ]
  for (const rel of checks) {
    const exists = await fsp.access(join(projectDir, rel)).then(() => true, () => false)
    expect(exists, `missing ${rel}`).toBe(true)
  }

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
