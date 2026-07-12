/**
 * GrapeStrap — E2E: assets, import, export
 *
 * PATH: tests/e2e/assets-import-export.spec.js
 * ROLE: Asset Manager, import-folder, export, and canvas asset-resolution specs
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag } from './helpers.js'

test('Asset Manager: lists project assets, click-inserts an image into the canvas', async () => {
  // v0.0.2 patch — Asset Manager panel + base href preview. Verifies:
  //   1. The Assets tab renders with three sections (Images / Fonts / Videos)
  //      after a project is open.
  //   2. file:list-assets returns files dropped into assets/images/ on disk.
  //   3. Clicking an image tile inserts <img src="assets/images/foo.png">
  //      into the canvas at the current selection.
  //   4. The canvas iframe has a <base href> pointing at the project dir so
  //      relative `assets/...` URLs resolve to disk for live preview.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-am-'))
  const projectPath = join(projectDir, 'am.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Drop a tiny image into the project's assets/images/ on disk so
  // file:list-assets surfaces it.
  const imgPath = join(projectDir, 'site', 'assets', 'images', 'pixel.png')
  // 1×1 transparent PNG — minimum viable for the renderer to lazy-load.
  const png1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=',
    'base64'
  )
  await fsp.writeFile(imgPath, png1x1)

  // ── 1. Render the asset manager (the GL stack tab is hidden behind Project,
  //   so directly trigger the panel paint via the eventBus path it listens on.)
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('assets:changed'))
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-asset-name="pixel.png"]').length > 0,
    null, { timeout: 3_000 }
  )

  // ── 2. Verify the listing reflects what's on disk.
  const listed = await appWindow.evaluate(() => window.grapestrap.file.listAssets())
  expect(listed.images).toContain('pixel.png')

  // ── 3. Click the tile → <img> appears in the canvas.
  await selectFirstByTag(appWindow, 'main')
  await appWindow.evaluate(() => {
    document.querySelector('[data-asset-name="pixel.png"]').click()
  })
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    return doc.querySelector('img[src="assets/images/pixel.png"]') != null
  }, null, { timeout: 3_000 })

  // ── 4. <base href> points at the project dir so the inserted img has a
  //    resolvable absolute URL.
  const baseInfo = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const tag = doc.querySelector('base[data-grapestrap-base]')
    const img = doc.querySelector('img[src="assets/images/pixel.png"]')
    return {
      hasBase: !!tag,
      baseHref: tag?.getAttribute('href') || '',
      imgResolved: img?.src || ''
    }
  })
  expect(baseInfo.hasBase).toBe(true)
  expect(baseInfo.baseHref).toMatch(/^file:\/\//)
  expect(baseInfo.imgResolved).toContain('assets/images/pixel.png')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Import folder: scans HTML + assets and opens as a project', async () => {
  // v0.0.2 patch — file:import-folder. Verifies:
  //   1. Pre-built source dir with index.html (full-document) + about.html
  //      (body-only) + assets/images/foo.png is imported.
  //   2. Resulting project has both pages registered, body extracted from
  //      the full-document case, title captured into page.head.
  //   3. assets/images/foo.png survives intact in the new project.
  //   4. Originals are NOT modified (safety: import = copy).
  const sourceDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-imp-src-'))
  const targetDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-imp-dst-'))
  const targetPath = join(targetDir, 'imported.gstrap')

  // Build a representative static-site source.
  await fsp.writeFile(join(sourceDir, 'index.html'),
    '<!doctype html><html><head><title>My Site</title>' +
    '<meta name="description" content="hello"></head>' +
    '<body><main><h1>imported</h1></main></body></html>', 'utf8')
  await fsp.writeFile(join(sourceDir, 'about.html'),
    '<section class="about"><h2>about</h2></section>', 'utf8')
  await fsp.writeFile(join(sourceDir, 'style.css'),
    '.imported { color: rebeccapurple; }', 'utf8')
  await fsp.mkdir(join(sourceDir, 'assets', 'images'), { recursive: true })
  const png1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=',
    'base64'
  )
  await fsp.writeFile(join(sourceDir, 'assets', 'images', 'foo.png'), png1x1)

  const { app, appWindow } = await launch()
  await appWindow.waitForFunction(
    () => window.__gstrap?.pluginRegistry?.activated?.length === 5,
    null, { timeout: 15_000 }
  )

  // Bypass the dialog pickers by passing both paths through the IPC directly.
  const project = await appWindow.evaluate(opts =>
    window.grapestrap.project.importDir(opts), { sourceDir, targetPath, name: 'imported' }
  )
  expect(project).toBeTruthy()
  expect(project.pages.length).toBeGreaterThanOrEqual(2)

  const pageNames = project.pages.map(p => p.name)
  expect(pageNames).toEqual(expect.arrayContaining(['index', 'about']))

  // ── 2. Index html had a <body> wrapper — body content was extracted.
  const indexPage = project.pages.find(p => p.name === 'index')
  expect(indexPage.html).toContain('<main>')
  expect(indexPage.html).not.toContain('<body')
  expect(indexPage.head.title).toBe('My Site')
  expect(indexPage.head.description).toBe('hello')

  // about.html had no body wrapper — html stays as-is.
  const aboutPage = project.pages.find(p => p.name === 'about')
  expect(aboutPage.html).toContain('class="about"')

  // ── 3. Asset survived.
  const assetExists = await fsp.access(join(targetDir, 'site', 'assets', 'images', 'foo.png'))
    .then(() => true, () => false)
  expect(assetExists).toBe(true)

  // globalCSS was preserved from the source style.css.
  expect(project.globalCSS).toContain('rebeccapurple')

  // ── 4. Originals untouched.
  const sourceIndex = await fsp.readFile(join(sourceDir, 'index.html'), 'utf8')
  expect(sourceIndex).toContain('<!doctype html>')
  expect(sourceIndex).toContain('My Site')

  await app.close()
  await fsp.rm(sourceDir, { recursive: true, force: true })
  await fsp.rm(targetDir, { recursive: true, force: true })
})

test('Asset Manager: drag-drop multiple files writes them all to site/assets/', async () => {
  // Reported on nola1: "the photo upload only allows 1 photo in the
  // toolbar." Multi-select WAS supported through the file dialog, but
  // many Linux file pickers don't surface ctrl-click multi-select; this
  // adds drag-drop support so OS file managers can drop a whole folder
  // of images at once. Verifies:
  //   1. Two PNG buffers written via the new file:write-asset-buffer IPC
  //      land in site/assets/images/ on disk.
  //   2. file:list-assets returns both names.
  //   3. The renderer cache (window.__gstrap_assets) reflects them after
  //      assets:changed.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-amd-'))
  const projectPath = join(projectDir, 'amd.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  const png1x1 = Array.from(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=',
    'base64'
  ))

  // Simulate two drops via the same IPC the drag-drop handler uses.
  await appWindow.evaluate(async bytes => {
    const u8 = new Uint8Array(bytes)
    await window.grapestrap.file.writeAssetBuffer('images', 'first.png',  u8)
    await window.grapestrap.file.writeAssetBuffer('images', 'second.png', u8)
    window.__gstrap.eventBus.emit('assets:changed')
  }, png1x1)

  const firstExists  = await fsp.access(join(projectDir, 'site', 'assets', 'images', 'first.png')).then(() => true, () => false)
  const secondExists = await fsp.access(join(projectDir, 'site', 'assets', 'images', 'second.png')).then(() => true, () => false)
  expect(firstExists).toBe(true)
  expect(secondExists).toBe(true)

  const listed = await appWindow.evaluate(() => window.grapestrap.file.listAssets())
  expect(listed.images).toEqual(expect.arrayContaining(['first.png', 'second.png']))

  await appWindow.waitForFunction(
    () => (window.__gstrap_assets?.images || []).includes('first.png'),
    null, { timeout: 3_000 }
  )

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Export: ships project-relative framework assets (BS + BSI + FA) under assets/', async () => {
  // alpha.6: framework files live inside the project's site/assets/ from
  // creation onward (project-manager.js#copyFrameworkAssets). Export now
  // mirrors site/assets/ verbatim into outputDir/assets/, and the wrapper
  // HTML references the same project-relative paths the canvas uses, so
  // canvas preview === server deploy. The pre-alpha.6 path that copied
  // node_modules/bootstrap/dist/* into outputDir/css and outputDir/js is
  // gone.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-exp-'))
  const projectPath = join(projectDir, 'exp.gstrap')
  const outputDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-exp-out-'))

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Bypass the dialog by passing the output dir straight to the IPC.
  await appWindow.evaluate(async out => {
    const project = window.__gstrap.projectState.current
    return await window.grapestrap.project.export(project, out)
  }, outputDir)

  const expected = [
    // Bootstrap (un-min + min + maps).
    'assets/css/bootstrap.css',
    'assets/css/bootstrap.css.map',
    'assets/css/bootstrap.min.css',
    'assets/css/bootstrap.min.css.map',
    'assets/js/bootstrap.bundle.js',
    'assets/js/bootstrap.bundle.js.map',
    'assets/js/bootstrap.bundle.min.js',
    'assets/js/bootstrap.bundle.min.js.map',
    // Bootstrap Icons (un-min + min) + the woff2 it sources via fonts/.
    'assets/css/bootstrap-icons.css',
    'assets/css/bootstrap-icons.min.css',
    'assets/css/fonts/bootstrap-icons.woff2',
    // Font Awesome — un-min + min bundles + at least one webfont.
    'assets/css/all.css',
    'assets/css/all.min.css',
    'assets/webfonts/fa-solid-900.woff2'
  ]
  for (const rel of expected) {
    const exists = await fsp.access(join(outputDir, rel)).then(() => true, () => false)
    expect(exists, `missing: ${rel}`).toBe(true)
  }

  // Wrapper HTML links the un-minified versions by default — better
  // browser-devtools experience, matches Dreamweaver.
  const indexHtml = await fsp.readFile(join(outputDir, 'index.html'), 'utf8')
  expect(indexHtml).toMatch(/href="assets\/css\/bootstrap\.css"/)
  expect(indexHtml).toMatch(/href="assets\/css\/bootstrap-icons\.css"/)
  expect(indexHtml).toMatch(/href="assets\/css\/all\.css"/)
  expect(indexHtml).toMatch(/src="assets\/js\/bootstrap\.bundle\.js"/)
  expect(indexHtml).not.toMatch(/href="assets\/css\/bootstrap\.min\.css"/)
  expect(indexHtml).not.toMatch(/src="assets\/js\/bootstrap\.bundle\.min\.js"/)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
  await fsp.rm(outputDir,  { recursive: true, force: true })
})

test('Import folder: preserves head <link>/<script> + arbitrary subdirs (css/, js/)', async () => {
  // Reported on nola1 2026-05-04: imported pages rendered without their
  // CSS, and css/ + js/ subdirs in the source were silently dropped.
  // Verifies:
  //   1. Source with <link rel=stylesheet href=css/style.css> in <head>
  //      survives import — body content has the <link> hoisted as its
  //      first child so the canvas preview applies the styles.
  //   2. css/style.css and js/main.js arbitrary subdirs are preserved
  //      verbatim under site/<rel>/.
  //   3. Inline <style> and <script> blocks in head also survive.
  const sourceDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-imp2-src-'))
  const targetDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-imp2-dst-'))
  const targetPath = join(targetDir, 'imported.gstrap')

  await fsp.mkdir(join(sourceDir, 'css'), { recursive: true })
  await fsp.mkdir(join(sourceDir, 'js'),  { recursive: true })
  await fsp.writeFile(join(sourceDir, 'css', 'style.css'),
    '.brand { color: rebeccapurple; }', 'utf8')
  await fsp.writeFile(join(sourceDir, 'js', 'main.js'),
    'console.log("hi")', 'utf8')
  await fsp.writeFile(join(sourceDir, 'index.html'),
    '<!doctype html><html>' +
    '<head>' +
      '<title>Linked</title>' +
      '<link rel="stylesheet" href="css/style.css">' +
      '<style>.inline { color: red }</style>' +
      '<script src="js/main.js" defer></script>' +
    '</head>' +
    '<body><main class="brand">imported</main></body></html>', 'utf8')

  const { app, appWindow } = await launch()
  await appWindow.waitForFunction(
    () => window.__gstrap?.pluginRegistry?.activated?.length === 5,
    null, { timeout: 15_000 }
  )

  const project = await appWindow.evaluate(opts =>
    window.grapestrap.project.importDir(opts), { sourceDir, targetPath, name: 'imported' }
  )
  const indexPage = project.pages.find(p => p.name === 'index')

  // 1. <link>, <style>, <script> from head hoisted into body content.
  expect(indexPage.html).toMatch(/<link[^>]*rel=["']stylesheet["']/i)
  expect(indexPage.html).toMatch(/href=["']css\/style\.css["']/i)
  expect(indexPage.html).toMatch(/<style[^>]*>\.inline/i)
  expect(indexPage.html).toMatch(/<script[^>]*src=["']js\/main\.js["']/i)
  expect(indexPage.html).toContain('<main class="brand">imported</main>')

  // 2. css/ and js/ subdirs preserved on disk.
  const cssExists = await fsp.access(join(targetDir, 'site', 'css', 'style.css')).then(() => true, () => false)
  const jsExists  = await fsp.access(join(targetDir, 'site', 'js',  'main.js')).then(() => true, () => false)
  expect(cssExists).toBe(true)
  expect(jsExists).toBe(true)

  await app.close()
  await fsp.rm(sourceDir, { recursive: true, force: true })
  await fsp.rm(targetDir, { recursive: true, force: true })
})

test('Canvas resync: switching projectDir re-injects <base> and re-fetches relative images', async () => {
  // Reported by user 2026-05-04: "images disappear when you expand the
  // canvas window to fullscreen." GL maximize re-parents the canvas DOM
  // and reloads its iframe; the <base href> + globalCSS injection was
  // racing with image loads, so by the time <base> landed the relative
  // src had already failed-resolved against about:blank. Fix: when
  // syncBaseHrefIntoCanvas changes the href, walk every <img> with a
  // relative src and reassign the attribute to force a re-fetch.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-baseimg-'))
  const projectPath = join(projectDir, 'baseimg.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Inject an <img> directly into the iframe body (bypassing GrapesJS, which
  // would replace a failed-load src with a data:svg placeholder). Attach a
  // MutationObserver to count src-attribute writes — that's the signal that
  // the refetch hook fired.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const img = doc.createElement('img')
    img.setAttribute('data-testid', 'probe-img')
    img.setAttribute('src', 'assets/images/probe.png')
    doc.body.appendChild(img)
    // Reset the counter AFTER appending so the initial setAttribute doesn't
    // count.
    window.__probeSrcWrites = 0
    const mo = new MutationObserver(records => {
      for (const r of records) {
        if (r.attributeName === 'src') window.__probeSrcWrites++
      }
    })
    mo.observe(img, { attributes: true })
  })

  // Mutate projectDir so the next sync sees a different href, then ping
  // the resync hook. This is the same code path GL maximize hits.
  await appWindow.evaluate(() => {
    const { projectState, eventBus } = window.__gstrap
    projectState.current.projectDir = projectState.current.projectDir + '-shifted'
    eventBus.emit('canvas:gl-state-changed')
  })
  // Resync is rAF-coalesced; one frame is enough.
  await appWindow.waitForTimeout(100)

  const after = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const base = doc.querySelector('base[data-grapestrap-base]')
    const img  = doc.querySelector('[data-testid="probe-img"]')
    return {
      baseHref:  base?.getAttribute('href'),
      imgSrc:    img?.getAttribute('src'),
      srcWrites: window.__probeSrcWrites
    }
  })

  expect(after.baseHref || '').toContain('-shifted/site/')
  // The relative src must be preserved literally (NOT rewritten to absolute).
  expect(after.imgSrc).toBe('assets/images/probe.png')
  // The fix's signature: setAttribute('src', src) ran at least once after
  // the base change, forcing the browser to re-fetch under the new base.
  expect(after.srcWrites).toBeGreaterThan(0)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Canvas styles: Bootstrap CSS links stay valid through base-href + device cycling', async () => {
  // alpha.5 reported by user: "if you cycle through using buttons full
  // screen to mobile tablet etc. the style sheet will break or stop
  // loading." alpha.6 final fix: framework files live inside the project's
  // own site/assets/ tree. Canvas iframe loads them via project-relative
  // links resolved through <base href> — same paths the deploy uses.
  // This spec exercises maximize → device-cycle and asserts (a) BS link
  // is project-relative, (b) it resolves to a real file inside site/assets,
  // (c) the file actually exists on disk.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-stylesurvive-'))
  const projectPath = join(projectDir, 'stylesurvive.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Force the GL state-changed sync (this is what landed the <base href>
  // earlier and what the maximize regression covered).
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('canvas:gl-state-changed')
  })
  await appWindow.waitForTimeout(50)

  // Cycle through every device. Each switch is the same path the toolbar
  // device buttons drive.
  for (const dev of ['tablet', 'mobile', 'desktop', 'tablet', 'mobile']) {
    await appWindow.evaluate(d => {
      window.__gstrap.eventBus.emit('command', `view:device-${d}`)
    }, dev)
    await appWindow.waitForTimeout(60)
  }

  // Inspect every stylesheet link in the canvas iframe head.
  const inspection = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const links = Array.from(doc.head.querySelectorAll('link[rel="stylesheet"]'))
    const base  = doc.querySelector('base[data-grapestrap-base]')
    return {
      baseHref: base?.getAttribute('href') || null,
      links: links.map(l => ({
        attr: l.getAttribute('href'),
        resolved: l.href // browser-resolved absolute URL
      }))
    }
  })

  // Sanity: <base> IS in place (otherwise the test isn't exercising the bug).
  expect(inspection.baseHref).toMatch(/^file:\/\//)
  expect(inspection.baseHref).toContain('/site/')

  // Find the Bootstrap link. alpha.7: defaults to un-minified (devtools-
  // friendly). Excludes bootstrap-icons.css since the regex would match it.
  const bs = inspection.links.find(l => /(^|\/)bootstrap\.css$/i.test(l.attr || ''))
  expect(bs).toBeTruthy()

  // The attribute is project-relative (resolves through <base>).
  expect(bs.attr).toBe('assets/css/bootstrap.css')
  // Resolved URL must land inside the project's site/assets/css/.
  expect(bs.resolved).toContain('/site/assets/css/bootstrap.css')
  // And the file must actually exist on disk — that's the difference vs.
  // pre-alpha.6 where the link resolved to a non-existent path.
  const onDisk = await fsp.access(join(projectDir, 'site', 'assets', 'css', 'bootstrap.css'))
    .then(() => true, () => false)
  expect(onDisk).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
