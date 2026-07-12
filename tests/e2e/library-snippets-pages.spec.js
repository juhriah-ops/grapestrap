/**
 * GrapeStrap — E2E: library, snippets, pages
 *
 * PATH: tests/e2e/library-snippets-pages.spec.js
 * ROLE: Library items, snippets, linked-files bar, page properties, and dirty-state audit specs
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag } from './helpers.js'

test('Snippets tab: capture from selection, insert places a free copy, delete removes', async () => {
  // v0.0.2 — Snippets are reusable HTML fragments stored on the project
  // (or contributed by plugins). Unlike Library Items they're NOT linked —
  // inserting drops a free copy. Verifies:
  //   1. Snippets tab in the Insert panel shows a "+ From Selection" tile.
  //   2. Capture: select an h1, capture as "hero" snippet → tile appears.
  //   3. Insert: clicking the tile drops a copy at the canvas root.
  //   4. The dropped instance has NO data-grpstr-library wrapper (it's a
  //      bare copy, not a linked instance).
  //   5. Delete via the per-tile × removes the snippet.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-snip-'))
  const projectPath = join(projectDir, 'snip.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  // Switch to the Snippets tab.
  await appWindow.evaluate(() => {
    document.querySelector('[data-tab="snippets"]').click()
  })
  await appWindow.waitForSelector('[data-snippet-capture]', { timeout: 3_000 })

  // ── 1+2. Capture a snippet by mutating projectState directly (bypasses
  //   the prompt dialog the same way other specs do).
  await appWindow.evaluate(() => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    const sel = editor.getSelected()
    const html = sel.toHTML()
    const { projectState, eventBus } = window.__gstrap
    if (!projectState.current.snippets) projectState.current.snippets = []
    projectState.current.snippets.push({ id: 'hero', name: 'Hero', html })
    eventBus.emit('snippets:changed')
  })

  await appWindow.waitForSelector('[data-block-id="snippet:project:hero"]', { timeout: 3_000 })

  // ── 3+4. Click the snippet tile → a copy is inserted into the canvas
  //   without a library wrapper.
  const beforeCount = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    return doc.querySelectorAll('h1').length
  })

  await appWindow.evaluate(() => {
    document.querySelector('[data-block-id="snippet:project:hero"]').click()
  })

  const afterCount = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    return {
      h1s: doc.querySelectorAll('h1').length,
      libWrappers: doc.querySelectorAll('[data-grpstr-library]').length
    }
  })
  expect(afterCount.h1s).toBe(beforeCount + 1)
  expect(afterCount.libWrappers).toBe(0)

  // ── 5. Delete via the × button.
  await appWindow.evaluate(() => {
    document.querySelector('[data-snippet-delete="hero"]').click()
  })
  await appWindow.waitForFunction(
    () => !document.querySelector('[data-block-id="snippet:project:hero"]'),
    null, { timeout: 3_000 }
  )

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Linked Files bar: shows CSS/JS chips from page head, hides on library tab', async () => {
  // v0.0.2 — Linked Files strip above the canvas. Verifies:
  //   1. With a page open whose html includes <link rel=stylesheet> and
  //      <script src=>, both chips appear with the right kind label.
  //   2. Clicking a project-style chip emits 'linked-files:open-globalcss'.
  //   3. Switching to a library tab hides the bar (libraries are bare
  //      fragments without head links).
  //   4. View toggle hides/shows the bar.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-lf-'))
  const projectPath = join(projectDir, 'lf.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Mutate the index page to include a link + script.
  await appWindow.evaluate(() => {
    const { projectState } = window.__gstrap
    const page = projectState.getPage('index')
    page.html = `
      <link rel="stylesheet" href="style.css">
      <script src="js/main.js"></script>
      <main class="container py-5"><h1>seeded</h1></main>
    `
    // Tickle the bar via canvas:content-changed (parsing is from page.html).
    window.__gstrap.eventBus.emit('canvas:content-changed')
  })

  // ── 1. Chips appear ────────────────────────────────────────────────────────
  await appWindow.waitForSelector('#gstrap-linkedfiles:not([hidden]) [data-lf-href="style.css"]', { timeout: 3_000 })
  await appWindow.waitForSelector('#gstrap-linkedfiles [data-lf-href="js/main.js"]', { timeout: 1_000 })

  const chipKinds = await appWindow.$$eval(
    '#gstrap-linkedfiles .gstrap-lf-chip',
    nodes => nodes.map(n => ({
      href: n.dataset.lfHref,
      kind: n.querySelector('.gstrap-lf-chip-kind')?.textContent
    }))
  )
  expect(chipKinds).toEqual(expect.arrayContaining([
    { href: 'style.css',  kind: 'css' },
    { href: 'js/main.js', kind: 'js'  }
  ]))

  // ── 2. Click style.css chip → emits open-globalcss event ──────────────────
  const events = []
  await appWindow.exposeFunction('__captureLfEvent', e => { events.push(e) })
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.on('linked-files:open-globalcss', () => window.__captureLfEvent('opened'))
  })
  await appWindow.evaluate(() => {
    document.querySelector('[data-lf-href="style.css"]').click()
  })
  await appWindow.waitForTimeout(200)
  expect(events).toContain('opened')

  // ── 3. Switch to a library tab → bar hides ────────────────────────────────
  await appWindow.evaluate(() => {
    const { projectState, pageState } = window.__gstrap
    projectState.current.libraryItems.push({
      id: 'mybit', name: 'Bit',
      html: '<p>library content</p>', file: 'library/mybit.html'
    })
    pageState.open('mybit', { kind: 'library', label: 'Bit' })
  })
  await appWindow.waitForFunction(() =>
    document.getElementById('gstrap-linkedfiles').hidden === true,
    null, { timeout: 3_000 }
  )

  // ── 4. Toggle event hides bar even when on a normal page ──────────────────
  await appWindow.evaluate(() => {
    window.__gstrap.pageState.focus('index')
  })
  await appWindow.waitForFunction(() =>
    document.getElementById('gstrap-linkedfiles').hidden === false,
    null, { timeout: 3_000 }
  )
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('view:toggle-linked-files')
  })
  const hiddenAfterToggle = await appWindow.evaluate(() =>
    document.getElementById('gstrap-linkedfiles').hidden
  )
  expect(hiddenAfterToggle).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Library Items: create from selection, insert, edit-tab propagates to pages', async () => {
  // v0.0.2 — Dreamweaver-style Library Items. End-to-end:
  //   1. Select an h1, click "+ From Selection" → a new library item appears
  //      and the canvas h1 becomes wrapped in [data-grpstr-library="<id>"].
  //   2. Insert that item into the canvas a second time → second wrapper
  //      with the same id appears.
  //   3. Open the item in a library-kind tab, edit its content (via projectState
  //      mutation + tab swap, simulating canvas edits), switch back to the
  //      page tab → propagation has updated BOTH instances on the page.
  //   4. Wrappers' descendants are non-selectable in GrapesJS (locked).
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-lib-'))
  const projectPath = join(projectDir, 'lib.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  // ── 1. + From Selection: tag the original selection's html as a library item. ──
  // We bypass the showTextPrompt dialog by stubbing it.
  await appWindow.evaluate(() => {
    // The dialog module exports a function; in production it returns a Promise
    // resolving to the entered name. Replace with an immediate resolver.
    window.__test_promptResponses = ['Footer']
  })
  await appWindow.evaluate(async () => {
    const { projectState, eventBus } = window.__gstrap
    const editor = window.__gstrap.pluginRegistry.bound.editor
    const sel = editor.getSelected()
    const innerHtml = sel.toHTML()
    const id = 'footer'
    projectState.current.libraryItems.push({ id, name: 'Footer', html: innerHtml, file: `library/${id}.html` })
    projectState.markLibraryDirty(id)
    // Replace the selection with a wrapped instance.
    const parent = sel.parent()
    const idx = parent.components().indexOf(sel)
    parent.append(`<div data-grpstr-library="${id}" data-grpstr-library-name="Footer">${innerHtml}</div>`, { at: idx })
    sel.remove()
    eventBus.emit('library:changed')
    eventBus.emit('canvas:content-changed')
  })

  // The library panel should now show the item. The panel lives in a GL stack
  // with the Project tab and may be in the inactive stacked tab — assert
  // against attached DOM, not visibility.
  await appWindow.waitForSelector('.gstrap-lib-item[data-lib-id="footer"]',
    { timeout: 3_000, state: 'attached' })

  // The canvas should have a wrapper with data-grpstr-library="footer".
  const initialWrapperCount = await appWindow.evaluate(() => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    const doc = editor.Canvas.getFrameEl().contentDocument
    return doc.querySelectorAll('[data-grpstr-library="footer"]').length
  })
  expect(initialWrapperCount).toBe(1)

  // ── 2. Click Insert on the panel row → second instance appears in canvas. ──
  await appWindow.evaluate(() => {
    document.querySelector('[data-lib-insert="footer"]').click()
  })
  await appWindow.waitForFunction(() => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    const doc = editor.Canvas.getFrameEl().contentDocument
    return doc.querySelectorAll('[data-grpstr-library="footer"]').length === 2
  }, null, { timeout: 3_000 })

  // ── 3. Lock: descendants of the wrapper should be non-selectable. ──
  const childrenLocked = await appWindow.evaluate(() => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    const wrapper = editor.getWrapper()
    let allLocked = true
    let foundChild = false
    function walk(c) {
      if (!c) return
      const attrs = c.getAttributes() || {}
      if (Object.prototype.hasOwnProperty.call(attrs, 'data-grpstr-library')) {
        // Walk this wrapper's children — they should be locked.
        const inner = c.components()
        if (inner.length === 0) return
        function check(child) {
          foundChild = true
          if (child.get('selectable') !== false) allLocked = false
          if (child.get('editable')   !== false) allLocked = false
          for (const k of child.components()) check(k)
        }
        for (const child of inner) check(child)
        return
      }
      for (const k of c.components()) walk(k)
    }
    walk(wrapper)
    return { allLocked, foundChild }
  })
  expect(childrenLocked.foundChild).toBe(true)
  expect(childrenLocked.allLocked).toBe(true)

  // ── 4. Open the item in a library tab, edit its html, swap back, verify
  //      both instances updated. ──
  await appWindow.evaluate(() => {
    const { pageState } = window.__gstrap
    pageState.open('footer', { kind: 'library', label: 'Footer' })
  })
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    // Once swapped to library tab, pages' wrappers are no longer in canvas.
    return doc.querySelectorAll('[data-grpstr-library="footer"]').length === 0
  }, null, { timeout: 3_000 })

  // Mutate the canvas content (simulating the user editing the library item).
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.setComponents('<div class="footer-v2"><p>updated footer content</p></div>')
    window.__gstrap.eventBus.emit('canvas:content-changed')
  })

  // Swap back to the index page. Tab swap-out fires propagateLibraryItem.
  await appWindow.evaluate(() => {
    window.__gstrap.pageState.focus('index')
  })
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const wrappers = doc.querySelectorAll('[data-grpstr-library="footer"]')
    return wrappers.length === 2 &&
           [...wrappers].every(w => w.querySelector('.footer-v2'))
  }, null, { timeout: 5_000 })

  // The page's underlying html in projectState reflects the propagation.
  const pageHtml = await appWindow.evaluate(() =>
    window.__gstrap.projectState.getPage('index').html
  )
  expect((pageHtml.match(/footer-v2/g) || []).length).toBe(2)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Audit fixes: dirty-state for snippets/library-delete, orphan menu wiring, swallowed errors', async () => {
  // Audit pass 2026-05-04 found:
  //   - Snippets create/delete + library cmdDelete didn't update isDirty()
  //   - Help → About / Shortcuts emitted events nothing listened to
  //   - linked-files chip toast lied (no panel focus)
  // This spec exercises each fix.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-aud-'))
  const projectPath = join(projectDir, 'aud.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // ── 1. Snippet create marks dirty ──────────────────────────────────────
  // (start state may already be dirty from openSeedProject; clear it via save)
  await appWindow.evaluate(async () => {
    await window.grapestrap.project.save(window.__gstrap.projectState.current)
    const ps = window.__gstrap.projectState
    ps.dirtyPages.clear(); ps.dirtyTemplates.clear(); ps.dirtyLibrary.clear()
    ps.dirtySnippets.clear(); ps.globalCssDirty = false; ps.manifestDirty = false
  })
  expect(await appWindow.evaluate(() => window.__gstrap.projectState.isDirty())).toBe(false)

  // Add a snippet via projectState mutation + the marker the panel calls.
  await appWindow.evaluate(() => {
    const { projectState } = window.__gstrap
    projectState.current.snippets = projectState.current.snippets || []
    projectState.current.snippets.push({ id: 'foo', name: 'Foo', html: '<p>x</p>' })
    projectState.markSnippetsDirty('foo')
  })
  expect(await appWindow.evaluate(() => window.__gstrap.projectState.isDirty())).toBe(true)
  expect(await appWindow.evaluate(() => window.__gstrap.projectState.dirtySnippets.size)).toBe(1)

  // ── 2. Library delete marks dirty ──────────────────────────────────────
  await appWindow.evaluate(async () => {
    const ps = window.__gstrap.projectState
    ps.dirtyPages.clear(); ps.dirtySnippets.clear(); ps.dirtyLibrary.clear()
    ps.globalCssDirty = false; ps.manifestDirty = false
    ps.current.libraryItems.push({ id: 'bar', name: 'Bar', html: '<div>x</div>', file: 'library/bar.html' })
    ps.markLibraryDirty('bar')
    await window.grapestrap.project.save(ps.current)
    ps.dirtyLibrary.clear()
  })
  expect(await appWindow.evaluate(() => window.__gstrap.projectState.isDirty())).toBe(false)

  // Simulate the cmdDelete flow.
  await appWindow.evaluate(() => {
    const ps = window.__gstrap.projectState
    const i = ps.current.libraryItems.findIndex(it => it.id === 'bar')
    ps.current.libraryItems.splice(i, 1)
    ps.markLibraryDirty('bar')
  })
  expect(await appWindow.evaluate(() => window.__gstrap.projectState.isDirty())).toBe(true)

  // ── 3. dialog:about emits an info toast (was orphan) ───────────────────
  const toasts = []
  await appWindow.exposeFunction('__captureAud', t => { toasts.push(t) })
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.on('toast', t => window.__captureAud(t))
  })
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('dialog:about'))
  await appWindow.waitForTimeout(100)
  const aboutToast = toasts.find(t => t?.type === 'info' && /GrapeStrap/.test(t.message || ''))
  expect(aboutToast).toBeTruthy()

  // ── 4. dialog:shortcuts opens the Preferences dialog ───────────────────
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('dialog:shortcuts'))
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-prefs-row]').length > 0,
    null, { timeout: 3_000 }
  )

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Page Properties: title/description/favicon/custom-meta land in saved manifest + exported HTML', async () => {
  // v0.0.2 follow-up — File → Page Properties dialog. Reported on nola1
  // as "favicon upload with meta data edit." Verifies:
  //   1. Setting title + description + project favicon + a custom meta
  //      tag through the dialog persists to projectState (page.head +
  //      manifest.metadata.favicon).
  //   2. Saving and re-loading the project on disk preserves the values.
  //   3. Exporting the project emits a `<link rel=icon>` for the
  //      favicon, the custom <meta name=...>, and the page <title>.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-pp-'))
  const projectPath = join(projectDir, 'pp.gstrap')
  const outputDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-pp-out-'))

  // Drop a favicon into the project's site/assets/images/ before launch
  // so the dialog's picker has something to pick.
  // (The dialog reads from window.__gstrap_assets which the Asset Manager
  // populates; we simulate that population below via assets:changed.)

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  await fsp.mkdir(join(projectDir, 'site', 'assets', 'images'), { recursive: true })
  await fsp.writeFile(join(projectDir, 'site', 'assets', 'images', 'favicon.png'), Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=',
    'base64'
  ))
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('assets:changed'))
  await appWindow.waitForFunction(
    () => (window.__gstrap_assets?.images || []).includes('favicon.png'),
    null, { timeout: 3_000 }
  )

  // Open the Page Properties dialog.
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:page-properties'))
  await appWindow.waitForFunction(
    () => !!document.querySelector('[data-pp-field="title"]'),
    null, { timeout: 3_000 }
  )

  // ── 1. Fill general tab. ────────────────────────────────────────────────
  await appWindow.evaluate(() => {
    const t = document.querySelector('[data-pp-field="title"]')
    t.value = 'Hello World'
    t.dispatchEvent(new Event('input', { bubbles: true }))
    const d = document.querySelector('[data-pp-field="description"]')
    d.value = 'A demo page.'
    d.dispatchEvent(new Event('input', { bubbles: true }))
  })

  // Switch to Favicon tab and pick the file.
  await appWindow.evaluate(() => document.querySelector('[data-pp-tab="favicon"]').click())
  await appWindow.waitForFunction(
    () => !!document.querySelector('[data-pp-action="set-project-favicon"][data-pp-arg="assets/images/favicon.png"]'),
    null, { timeout: 3_000 }
  )
  await appWindow.evaluate(() => {
    document.querySelector('[data-pp-action="set-project-favicon"][data-pp-arg="assets/images/favicon.png"]').click()
  })

  // Switch to Meta tab, add a custom meta.
  await appWindow.evaluate(() => document.querySelector('[data-pp-tab="meta"]').click())
  await appWindow.waitForFunction(
    () => !!document.querySelector('[data-pp-action="meta-add"]'),
    null, { timeout: 3_000 }
  )
  await appWindow.evaluate(() => document.querySelector('[data-pp-action="meta-add"]').click())
  await appWindow.waitForFunction(
    () => !!document.querySelector('[data-pp-field="meta.name"][data-pp-index="0"]'),
    null, { timeout: 3_000 }
  )
  await appWindow.evaluate(() => {
    const n = document.querySelector('[data-pp-field="meta.name"][data-pp-index="0"]')
    n.value = 'keywords'
    n.dispatchEvent(new Event('input', { bubbles: true }))
    const c = document.querySelector('[data-pp-field="meta.content"][data-pp-index="0"]')
    c.value = 'bootstrap, demo'
    c.dispatchEvent(new Event('input', { bubbles: true }))
  })

  // Save the dialog → projectState reflects all three.
  await appWindow.evaluate(() => document.querySelector('[data-pp-action="save"]').click())
  await appWindow.waitForFunction(
    () => !document.querySelector('[data-pp-field="title"]'),  // dialog closed
    null, { timeout: 3_000 }
  )

  const stateAfter = await appWindow.evaluate(() => {
    const ps = window.__gstrap.projectState
    const page = ps.current.pages.find(p => p.name === 'index')
    return {
      title: page.head.title,
      description: page.head.description,
      customMeta: page.head.customMeta,
      projectFavicon: ps.current.manifest.metadata.favicon
    }
  })
  expect(stateAfter.title).toBe('Hello World')
  expect(stateAfter.description).toBe('A demo page.')
  expect(stateAfter.customMeta).toEqual([{ name: 'keywords', content: 'bootstrap, demo' }])
  expect(stateAfter.projectFavicon).toBe('assets/images/favicon.png')

  // ── 2. Save to disk + reload + verify persistence. ──────────────────────
  await appWindow.evaluate(async () => {
    await window.grapestrap.project.save(window.__gstrap.projectState.current)
  })
  const onDiskManifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(onDiskManifest.metadata.favicon).toBe('assets/images/favicon.png')
  const indexPageEntry = onDiskManifest.pages.find(p => p.name === 'index')
  expect(indexPageEntry.head.title).toBe('Hello World')
  expect(indexPageEntry.head.customMeta).toEqual([{ name: 'keywords', content: 'bootstrap, demo' }])

  // ── 3. Export emits favicon link + custom meta + title. ─────────────────
  await appWindow.evaluate(async out => {
    const project = window.__gstrap.projectState.current
    return await window.grapestrap.project.export(project, out)
  }, outputDir)

  const indexHtml = await fsp.readFile(join(outputDir, 'index.html'), 'utf8')
  expect(indexHtml).toMatch(/<title>Hello World<\/title>/)
  // Extra attrs are tolerated — composeFullPageHtml marks managed tags with
  // data-grpstr-* attributes for round-trip parsing.
  expect(indexHtml).toMatch(/<meta name="description" content="A demo page\."[^>]*>/)
  expect(indexHtml).toMatch(/<meta name="keywords" content="bootstrap, demo"[^>]*>/)
  expect(indexHtml).toMatch(/<link rel="icon" href="assets\/images\/favicon\.png" type="image\/png"[^>]*>/)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
  await fsp.rm(outputDir,  { recursive: true, force: true })
})
