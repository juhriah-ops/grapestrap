// =============================================================
// PATH: tests/e2e/file-ops.spec.js
// ROLE: Wave 0 coverage-hole spec — first e2e coverage of the file:* IPC
//       surface (read/write/delete/list/exists), its safePath rails
//       (project-root escape + no-project failure modes), the chokidar
//       watcher push to the renderer, and the file-manager panel's read
//       surface (page list, dirty dots, dblclick-to-open).
//       NOTE: the FM panel has NO rename/delete/new-file UI today and there
//       is no file:rename IPC — documented in PLAN.md "needs app support";
//       this spec covers the layer those features will sit on.
// DEPENDS: ./helpers.js (launch, openSeedProject, dismissWelcome)
// CREATED: 2026-07-12
// UPDATED: 2026-08-30 (Phase C review) — extended the path-jail case with an
//          absolute-path escape (read + write) and a symlink escape (a
//          symlink physically inside site/ whose target resolves outside
//          projectRoot); the symlink case needs safePath() to be
//          realpath-based to pass — written against that fixed contract.
// =============================================================
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome } from './helpers.js'

test('File ops: write → exists → read → list → delete round-trip under site/', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-fops-'))
  const projectPath = join(projectDir, 'fops.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Write a file + a file in a not-yet-existing subdir (writeFile mkdirs).
  const writeResult = await appWindow.evaluate(async () => {
    const a = await window.grapestrap.file.write('site/notes.html', '<p>fops-sentinel</p>')
    const b = await window.grapestrap.file.write('site/js/app.js', '// fops-js-sentinel\n')
    return [a.path, b.path]
  })
  expect(writeResult).toEqual(['site/notes.html', 'site/js/app.js'])

  // Renderer-side exists + read agree with what we wrote…
  expect(await appWindow.evaluate(
    () => window.grapestrap.file.exists('site/notes.html'))).toBe(true)
  expect(await appWindow.evaluate(
    () => window.grapestrap.file.read('site/notes.html'))).toBe('<p>fops-sentinel</p>')

  // …and the REAL disk agrees too (the contract is disk state, not IPC echo).
  expect(await fsp.readFile(join(projectDir, 'site', 'notes.html'), 'utf8'))
    .toBe('<p>fops-sentinel</p>')
  expect(await fsp.readFile(join(projectDir, 'site', 'js', 'app.js'), 'utf8'))
    .toContain('fops-js-sentinel')

  // list() returns {name, type} entries.
  const listing = await appWindow.evaluate(() => window.grapestrap.file.list('site'))
  expect(listing).toEqual(expect.arrayContaining([
    { name: 'notes.html', type: 'file' },
    { name: 'pages', type: 'dir' },
    { name: 'js', type: 'dir' }
  ]))

  // Delete a file and a directory (deleteFile is recursive by design).
  await appWindow.evaluate(async () => {
    await window.grapestrap.file.delete('site/notes.html')
    await window.grapestrap.file.delete('site/js')
  })
  expect(await appWindow.evaluate(
    () => window.grapestrap.file.exists('site/notes.html'))).toBe(false)
  await expect(fsp.access(join(projectDir, 'site', 'notes.html'))).rejects.toThrow()
  await expect(fsp.access(join(projectDir, 'site', 'js'))).rejects.toThrow()

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('File ops: no-project and path-escape requests are refused', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-fops2-'))
  const projectPath = join(projectDir, 'fops2.gstrap')

  const { app, appWindow } = await launch()

  // Helper: run a file op in the renderer, return the rejection message
  // ('' when it unexpectedly succeeds). IPC errors arrive wrapped as
  // "Error invoking remote method 'file:read': Error: <msg>" — assert
  // with toContain, not toBe.
  const rejectionOf = (op, ...args) => appWindow.evaluate(async ({ op, args }) => {
    try { await window.grapestrap.file[op](...args); return '' }
    catch (err) { return String(err?.message || err) }
  }, { op, args })

  // Before any project is open, the fs surface is fully closed.
  expect(await rejectionOf('read', 'site/pages/index.html')).toContain('no project open')

  // Open a project, then try to escape its root.
  await openSeedProject(appWindow, projectPath)
  expect(await rejectionOf('read', '../outside.txt')).toContain('path escapes project root')
  expect(await rejectionOf('write', '../evil.txt', 'x')).toContain('path escapes project root')
  expect(await rejectionOf('delete', '../victim')).toContain('path escapes project root')

  // Absolute paths outside the project must be refused the same way as a
  // relative '../' escape — safePath() computes a path relative to
  // projectRoot either way, so an absolute path that lands outside it
  // rejects on the same "escapes project root" check (an absolute path
  // that resolves INSIDE projectRoot is allowed — that isn't this case).
  const outsideAbsolutePath = join(projectDir, '..', 'absolute-outside.txt')
  expect(await rejectionOf('read', outsideAbsolutePath)).toContain('path escapes project root')
  expect(await rejectionOf('write', outsideAbsolutePath, 'x')).toContain('path escapes project root')
  await expect(fsp.access(outsideAbsolutePath)).rejects.toThrow()

  // Symlink escape: a symlink physically inside site/ whose target resolves
  // outside the project root. Plain string/path-join checks on the
  // symlink's own path can't catch this — the path string itself never
  // leaves site/ — only a realpath-based safePath() can. Written against
  // that fixed contract: asserts the escape is refused, not what the
  // symlink's target contains.
  const outsideDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-fops2-outside-'))
  const secretFile = join(outsideDir, 'secret.txt')
  await fsp.writeFile(secretFile, 'top secret', 'utf8')
  await fsp.symlink(secretFile, join(projectDir, 'site', 'escape-link.txt'))
  expect(await rejectionOf('read', 'site/escape-link.txt')).toContain('path escapes project root')
  await fsp.rm(outsideDir, { recursive: true, force: true })

  // exists() deliberately swallows errors and reports false (documented
  // catch-all in file-operations.js) — assert that contract, not a throw.
  expect(await appWindow.evaluate(
    () => window.grapestrap.file.exists('../outside.txt'))).toBe(false)

  // Nothing leaked outside the project root.
  await expect(fsp.access(join(projectDir, '..', 'evil.txt'))).rejects.toThrow()

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('File ops: external add/change/delete on disk reach the renderer via the watcher', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-fops3-'))
  const projectPath = join(projectDir, 'fops3.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Subscribe BEFORE mutating disk. Events carry project-relative paths.
  await appWindow.evaluate(() => {
    window.__fmEvents = []
    window.grapestrap.watcher.onAdded(p => window.__fmEvents.push(['added', p]))
    window.grapestrap.watcher.onChanged(p => window.__fmEvents.push(['changed', p]))
    window.grapestrap.watcher.onDeleted(p => window.__fmEvents.push(['deleted', p]))
  })
  const sawEvent = (kind, path) => appWindow.waitForFunction(
    ({ kind, path }) => (window.__fmEvents || []).some(e => e[0] === kind && e[1] === path),
    { kind, path },
    // chokidar awaitWriteFinish holds events ~200ms past write stability —
    // generous ceiling, cheap when it fires early.
    { timeout: 10_000 }
  )

  // The TEST process is a genuinely external actor here — this is the
  // "user edited files outside the app" path.
  await fsp.writeFile(join(projectDir, 'site', 'extra.css'), 'body { margin: 0 }\n', 'utf8')
  await sawEvent('added', 'site/extra.css')

  await fsp.appendFile(join(projectDir, 'site', 'pages', 'index.html'), '<!-- external edit -->\n', 'utf8')
  await sawEvent('changed', 'site/pages/index.html')

  await fsp.rm(join(projectDir, 'site', 'extra.css'))
  await sawEvent('deleted', 'site/extra.css')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('File manager panel: lists pages with dirty dots; dblclick reopens a closed page tab', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-fops4-'))
  const projectPath = join(projectDir, 'fops4.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  // Real dblclick below — clear the first-run welcome overlay first, it
  // swallows pointer input until dismissed for real.
  await dismissWelcome(appWindow)

  // Add a second page the way cmdNewPage does; the markPageDirty inside
  // fires project:dirty-changed, which is what refreshes the FM panel.
  await appWindow.evaluate(() => {
    const { projectState, pageState } = window.__gstrap
    projectState.current.pages.push({
      name: 'about', file: 'pages/about.html', templateName: null, regions: {},
      head: { title: 'about', description: '' },
      html: '<main class="container py-5"><h1>about</h1></main>\n'
    })
    projectState.markPageDirty('about')
    pageState.open('about')
  })
  await appWindow.waitForSelector('.gstrap-fm-item.is-dirty[data-fm-page="about"]', { timeout: 3_000 })

  // Close the about tab, then reopen it from the file manager with a real
  // double-click (the panel's delegated dblclick → pageState.open).
  await appWindow.evaluate(() => window.__gstrap.pageState.close('about'))
  await appWindow.waitForFunction(
    () => window.__gstrap.pageState.tabs.length === 1, null, { timeout: 3_000 })

  await appWindow.dblclick('.gstrap-fm-item[data-fm-page="about"]')
  await appWindow.waitForFunction(
    () => window.__gstrap.pageState.tabs.length === 2 &&
          window.__gstrap.pageState.active()?.pageName === 'about',
    null, { timeout: 3_000 }
  )
  await appWindow.waitForFunction(
    () => /<h1[^>]*>about<\/h1>/.test(window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || ''),
    null, { timeout: 5_000 }
  )

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
