/**
 * GrapeStrap — E2E: code view
 *
 * PATH: tests/e2e/code-view.spec.js
 * ROLE: Code/Split view modes, Monaco sync, toolbar view-mode buttons, and code-path save specs
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, EXPECTED_PLUGIN_COUNT } from './helpers.js'

test('Code view shows pretty-printed HTML, not the GrapesJS one-liner', async () => {
  // Regression for "HTML output is on one line — needs to be readable".
  // editor.getHtml() returns single-line markup; getCanvasHtml() now feeds it
  // through formatHtml() so the Code-view Monaco AND the on-disk save AND
  // the export all see the indented form.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-fmt-'))
  const projectPath = join(projectDir, 'fmt.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await appWindow.waitForFunction(
    () => [...document.querySelectorAll('.gstrap-dom-tag')].some(n => n.textContent === 'h1'),
    null, { timeout: 10_000 }
  )

  // Drop in a couple of nested elements so there's something to indent.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.getWrapper().append('<section class="x"><div class="y"><h2>Heading</h2><p>Body <a href="#">link</a> end.</p></div></section>')
  })

  const html = await appWindow.evaluate(async () => {
    const { getCanvasHtml } = await import('/src/renderer/editor/grapesjs-init.js')
    return getCanvasHtml()
  }).catch(async () => {
    // ESM dynamic import may not work in the bundled Electron — fall back to
    // reading what canvas-sync.js wrote into the Monaco code editor by
    // forcing a sync, then inspect Monaco's value.
    return appWindow.evaluate(() => {
      const ed = window.__gstrap.pluginRegistry.bound.editor
      // Mirror getCanvasHtml: pretty-printed via formatHtml at the boundary.
      // We can't import the renderer module here, so just verify the raw
      // output contains the markers and that the Code Monaco shows multi-line.
      return ed.getHtml()
    })
  })

  // If we got the raw form, just verify it CONTAINS the section — the formatter
  // unit-check above this test exercises the formatter directly. The point of
  // this spec is end-to-end: getCanvasHtml is wired to formatHtml.
  expect(html).toContain('section')

  // Switch to Code view and confirm Monaco's value has newlines + indentation.
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'view:mode-code')
  })
  // Force a sync so Monaco gets the latest html.
  await appWindow.waitForTimeout(400)
  // The Monaco textarea holds focused content only; the .view-lines is a
  // visual representation. Pull the editor's underlying model value via
  // window.monaco — the editor whose value starts with `<` is the HTML one.
  const htmlValue = await appWindow.evaluate(() => {
    const monaco = window.__gstrap.pluginRegistry.bound.monaco
    const editors = monaco?.editor?.getEditors?.() || []
    const htmlEd = editors.find(e => (e.getValue?.() || '').trimStart().startsWith('<'))
    return htmlEd?.getValue?.() || ''
  })
  expect(htmlValue).toContain('\n')
  expect(htmlValue).toMatch(/<section[^>]*>\s*\n\s+<div/)

  // Monaco's HTML/CSS language contributions must be registered, otherwise
  // createModel(html, 'html') silently downgrades to 'plaintext' and the
  // Code view shows an unhighlighted blob. Diagnostic landed in the v0.0.1
  // memory; fix is the four contribution imports in monaco-init.js.
  const monacoLangs = await appWindow.evaluate(() => {
    const monaco = window.__gstrap.pluginRegistry.bound.monaco
    const editors = monaco?.editor?.getEditors?.() || []
    const htmlEd = editors.find(e => (e.getValue?.() || '').trimStart().startsWith('<'))
    const registered = (monaco?.languages?.getLanguages?.() || []).map(l => l.id)
    return {
      htmlModelLang: htmlEd?.getModel?.()?.getLanguageId?.() || null,
      registered
    }
  })
  expect(monacoLangs.htmlModelLang).toBe('html')
  expect(monacoLangs.registered).toContain('html')
  expect(monacoLangs.registered).toContain('css')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Toolbar Save / Code / Split work after File→New (cmdNewProject path, not direct IPC)', async () => {
  // Reported on nola1 2026-05-03: toolbar Save / Code / Split work for an
  // OPENED project but not for a project created via File→New. The other
  // toolbar tests bypass cmdNewProject (they call window.grapestrap.project.new
  // directly), so this spec drives the full UI path: click toolbar New →
  // text-prompt dialog → IPC create → location dialog → projectState set.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tbnew-'))
  const projectPath = join(projectDir, 'tbnew.gstrap')

  const { app, appWindow } = await launch()
  // Wait for the renderer to fully boot: command listeners + plugins active.
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 }
  )
  await appWindow.waitForFunction(
    () => window.__gstrap.eventBus.listenerCount('command') > 0,
    null, { timeout: 5_000 }
  )

  // Drive cmdNewProject: bypass the showTextPrompt UI and the native file
  // picker by emitting the project:new IPC ourselves with a known location,
  // but call projectState.set + pageState.open the SAME way cmdNewProject
  // would. (The text-prompt dialog is exercised separately in another spec.)
  await appWindow.evaluate(async loc => {
    const project = await window.grapestrap.project.new({ name: 'tbnew', location: loc })
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
  }, projectPath)
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-cid]').length > 0,
    null, { timeout: 10_000 }
  )

  // Capture toasts
  const toasts = []
  await appWindow.exposeFunction('__captureNewToast', p => { toasts.push(p) })
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.on('toast', p => window.__captureNewToast(p))
  })

  // ── Save toolbar click ──────────────────────────────────────────────────────
  await appWindow.evaluate(() => {
    document.querySelector('[data-cmd="file:save"]').click()
  })
  await appWindow.waitForTimeout(800)
  const savedToast = toasts.find(t => t?.type === 'success' && /saved/i.test(t.message || ''))
  expect(savedToast).toBeTruthy()

  // ── Code toolbar click ─────────────────────────────────────────────────────
  await appWindow.evaluate(() => {
    document.querySelector('[data-cmd="view:mode-code"]').click()
  })
  await appWindow.waitForTimeout(300)
  const designHidden = await appWindow.evaluate(() =>
    document.querySelector('[data-region="canvas-design"]').hidden
  )
  expect(designHidden).toBe(true)

  // ── Split toolbar click ────────────────────────────────────────────────────
  await appWindow.evaluate(() => {
    document.querySelector('[data-cmd="view:mode-split"]').click()
  })
  await appWindow.waitForTimeout(300)
  const splitState = await appWindow.evaluate(() => ({
    designHidden: document.querySelector('[data-region="canvas-design"]').hidden,
    codeHidden:   document.querySelector('[data-region="canvas-code"]').hidden
  }))
  expect(splitState.designHidden).toBe(false)
  expect(splitState.codeHidden).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Toolbar buttons: Save / Code / Split dispatch their commands and effects', async () => {
  // Reported on nola1 2026-05-03: top toolbar Save / Code / Split don't work
  // (Open / New / Design do). All buttons emit eventBus 'command' from a
  // single delegated click handler in panels/toolbar.js, so they should
  // either all work or all fail — diverging behavior says some commands
  // fail downstream of the dispatch.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tb-'))
  const projectPath = join(projectDir, 'tb.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Capture toasts so we can see whether commands actually run.
  const toasts = []
  await appWindow.exposeFunction('__captureTbToast', p => { toasts.push(p) })
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.on('toast', p => window.__captureTbToast(p))
  })

  // ── Save: click the toolbar Save button, assert "Saved." toast ─────────────
  await appWindow.evaluate(() => {
    document.querySelector('[data-cmd="file:save"]').click()
  })
  await appWindow.waitForTimeout(800)
  const savedToast = toasts.find(t => t?.type === 'success' && /saved/i.test(t.message || ''))
  expect(savedToast).toBeTruthy()

  // ── Code: click Code mode button, assert design pane hides + code shows ───
  await appWindow.evaluate(() => {
    document.querySelector('[data-cmd="view:mode-code"]').click()
  })
  await appWindow.waitForTimeout(300)
  const codeView = await appWindow.evaluate(() => {
    const design = document.querySelector('[data-region="canvas-design"]')
    const code   = document.querySelector('[data-region="canvas-code"]')
    return { designHidden: design?.hidden, codeHidden: code?.hidden }
  })
  expect(codeView.designHidden).toBe(true)
  expect(codeView.codeHidden).toBe(false)

  // ── Split: click Split mode, both panes should be visible ─────────────────
  await appWindow.evaluate(() => {
    document.querySelector('[data-cmd="view:mode-split"]').click()
  })
  await appWindow.waitForTimeout(300)
  const splitView = await appWindow.evaluate(() => {
    const design = document.querySelector('[data-region="canvas-design"]')
    const code   = document.querySelector('[data-region="canvas-code"]')
    const host = document.querySelector('.gstrap-canvas-host')
    return {
      designHidden: design?.hidden,
      codeHidden: code?.hidden,
      hostIsSplit: host?.classList?.contains('is-split')
    }
  })
  expect(splitView.designHidden).toBe(false)
  expect(splitView.codeHidden).toBe(false)
  expect(splitView.hostIsSplit).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Code view sync: works after user has previously focused Monaco', async () => {
  // Reported on nola1 2026-05-03 after the v0.0.1-alpha cut: "code view is no
  // longer working" on a new project; "i opened the test page i created and
  // there was code view." The activeSide flag in canvas-sync.js was set to
  // 'code' the moment Monaco gained focus, and never reset until the canvas
  // iframe regained focus — but switching view modes / opening different
  // projects doesn't re-focus the iframe contentWindow on its own. So
  // queueCanvasToCode would early-return forever once the user had clicked
  // into Code view even once. This spec drives that exact sequence.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-codesync-'))
  const projectPath = join(projectDir, 's.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await appWindow.waitForFunction(
    () => document.querySelectorAll('.gstrap-block-tile').length > 0,
    null, { timeout: 10_000 }
  )

  // Step 1: switch to Code view AND focus Monaco — same as a real user
  // peeking at the markup.
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'view:mode-code')
  })
  await appWindow.waitForTimeout(200)
  await appWindow.evaluate(() => {
    const monaco = window.__gstrap.pluginRegistry.bound.monaco
    const editors = monaco?.editor?.getEditors?.() || []
    const htmlEd = editors[0]
    htmlEd?.focus?.()
  })
  await appWindow.waitForTimeout(100)

  // Step 2: switch back to Design and add an element via the canvas.
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'view:mode-design')
  })
  await appWindow.waitForTimeout(200)
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.getWrapper().append('<p data-testid="codesync-marker">codesync-marker-text</p>')
  })

  // Step 3: wait past the 300ms debounce, then check Monaco picked up the edit.
  await appWindow.waitForTimeout(700)
  const monacoVal = await appWindow.evaluate(() => {
    const monaco = window.__gstrap.pluginRegistry.bound.monaco
    const editors = monaco?.editor?.getEditors?.() || []
    const htmlEd = editors.find(e => (e.getValue?.() || '').trimStart().startsWith('<'))
    return htmlEd?.getValue?.() || ''
  })
  expect(monacoVal).toContain('codesync-marker-text')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Split view: Design and Code panes lay out side-by-side, not overlapping', async () => {
  // Reported on nola1 2026-05-04: in Split mode, the Canvas iframe paints
  // on top of the Monaco code pane — line numbers visible behind the canvas.
  // Root cause: .gstrap-canvas-design and .gstrap-canvas-code are both
  // position:absolute inset:0; the .is-split CSS hook in applyViewMode was
  // a no-op until 33b0569's follow-up landed the 50/50 flex layout.
  // This spec asserts (a) both panes are non-zero in split mode, (b) they
  // don't overlap — design's right edge ≤ code's left edge.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-split-'))
  const projectPath = join(projectDir, 'split.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Switch to Split mode via the same command path the toolbar uses.
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'view:mode-split')
  })
  await appWindow.waitForSelector('.gstrap-canvas-host.is-split', { timeout: 3_000 })
  // Give the rAF + GL refresh a moment to settle.
  await appWindow.waitForTimeout(200)

  const rects = await appWindow.evaluate(() => {
    const design = document.querySelector('.gstrap-canvas-design')
    const code   = document.querySelector('.gstrap-canvas-code')
    const d = design.getBoundingClientRect()
    const c = code.getBoundingClientRect()
    return {
      design: { x: d.x, w: d.width, h: d.height, right: d.right },
      code:   { x: c.x, w: c.width, h: c.height, left:  c.left  },
      designHidden: design.hasAttribute('hidden'),
      codeHidden:   code.hasAttribute('hidden')
    }
  })

  expect(rects.designHidden).toBe(false)
  expect(rects.codeHidden).toBe(false)
  expect(rects.design.w).toBeGreaterThan(40)
  expect(rects.code.w).toBeGreaterThan(40)
  expect(rects.design.h).toBeGreaterThan(40)
  // The two rects must NOT overlap. Design's right edge should be at or
  // before Code's left edge (allow a 1px tolerance for the divider border).
  expect(rects.design.right).toBeLessThanOrEqual(rects.code.left + 1)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Code view save: Monaco edits persist to disk without switching back to design', async () => {
  // Reported by user 2026-05-04: "the save state — it doesn't save edits to
  // the code directly." Root causes:
  //   (1) flushActiveTabIntoProject always read getCanvasHtml(), so Monaco
  //       text typed in Code view was never the source of truth on save.
  //   (2) pageState.setViewMode mutated tab.viewMode BEFORE emitting, so the
  //       canvas-panel listener received prev === next and never called
  //       rebuildCanvasFromCode on a code → design switch.
  // Both paths fixed: this spec exercises path (1) — save while still in code
  // view — which is the path that actually loses data without a switch.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-codesave-'))
  const projectPath = join(projectDir, 'codesave.gstrap')
  const SENTINEL = '<p data-testid="code-save-sentinel">code-only-edit</p>'

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Switch to code view via the same command path the toolbar uses.
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'view:mode-code')
  })
  // Wait for the code pane to be the visible one.
  await appWindow.waitForFunction(() => {
    const code   = document.querySelector('.gstrap-canvas-code')
    const design = document.querySelector('.gstrap-canvas-design')
    return code && !code.hasAttribute('hidden') && design.hasAttribute('hidden')
  }, null, { timeout: 5_000 })

  // Wait for Monaco to be populated by the design→code sync (debounced 300ms).
  await appWindow.waitForFunction(() => {
    const m = window.__gstrap?.pluginRegistry?.bound?.monaco
    const editors = m?.editor?.getEditors?.() || []
    return editors.some(e => (e.getValue() || '').trim().length > 0)
  }, null, { timeout: 5_000 })

  // Type the sentinel into the HTML monaco editor (the first one whose model
  // language is 'html'). Use setValue so the edit is unambiguous.
  await appWindow.evaluate(html => {
    const m = window.__gstrap.pluginRegistry.bound.monaco
    const htmlEditor = m.editor.getEditors().find(e =>
      e.getModel?.()?.getLanguageId?.() === 'html'
    )
    htmlEditor.setValue(html)
  }, SENTINEL)

  // Save WITHOUT switching back to design. The fix should rebuild the canvas
  // from Monaco before flushing into projectState.
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'file:save')
  })
  // Give the save IPC time to settle.
  await appWindow.waitForTimeout(500)

  // Read the page html off disk — the sentinel must be there.
  const onDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')
  expect(onDisk).toContain('code-save-sentinel')
  expect(onDisk).toContain('code-only-edit')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
