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
import { _electron as electron, test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..')

async function launch(extraEnv = {}) {
  const app = await electron.launch({
    args: [repoRoot, '--no-sandbox'],
    env: { ...process.env, ...extraEnv }
  })
  const appWindow = await app.firstWindow()
  await appWindow.waitForFunction(() => window.__gstrap?.eventBus, null, { timeout: 30_000 })
  return { app, appWindow }
}

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
  const onDisk = await fsp.readFile(join(projectDir, 'pages', 'index.html'), 'utf8')
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

async function openSeedProject(appWindow, projectPath) {
  await appWindow.waitForFunction(
    () => window.__gstrap?.pluginRegistry?.activated?.length === 5,
    null, { timeout: 15_000 }
  )
  await appWindow.evaluate(async path => {
    const project = await window.grapestrap.project.new({ name: 'tagtest', location: path })
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
  }, projectPath)
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-cid]').length > 0,
    null, { timeout: 10_000 }
  )
}

async function selectFirstByTag(appWindow, tag) {
  await appWindow.evaluate(t => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const wrapper = ed.getWrapper()
    function find(c) {
      if ((c.get('tagName') || '').toLowerCase() === t) return c
      for (const k of c.components()) { const r = find(k); if (r) return r }
      return null
    }
    const found = find(wrapper)
    if (found) ed.select(found)
  }, tag)
}

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

test('Quick Tag Editor: Ctrl+T renames the selected element', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-qt-'))
  const projectPath = join(projectDir, 'qt.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  // Trigger the menu command, then fill and submit the dialog.
  await appWindow.evaluate(() =>
    window.__gstrap.eventBus.emit('command', 'edit:quick-tag')
  )
  const input = appWindow.locator('.gstrap-quick-tag-input')
  await input.waitFor({ state: 'visible', timeout: 5_000 })
  await input.fill('<h2 class="rebranded">')
  await input.press('Enter')

  // After Enter, dialog should be gone and the selected component should be h2.
  await appWindow.waitForFunction(() => !document.querySelector('.gstrap-quick-tag-input'))
  const newTag = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return ed.getSelected?.()?.get?.('tagName')?.toLowerCase?.()
  })
  expect(newTag).toBe('h2')

  // Page html should reflect the rename.
  const htmlAfter = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return ed.getHtml()
  })
  expect(htmlAfter).toContain('<h2')
  expect(htmlAfter).toContain('rebranded')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Wrap with Tag: Ctrl+Shift+W wraps the selected element', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-wrap-'))
  const projectPath = join(projectDir, 'wrap.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  await appWindow.evaluate(() =>
    window.__gstrap.eventBus.emit('command', 'edit:wrap-tag')
  )
  const input = appWindow.locator('.gstrap-quick-tag-input')
  await input.waitFor({ state: 'visible', timeout: 5_000 })
  await input.fill('<header class="page-head">')
  await input.press('Enter')

  await appWindow.waitForFunction(() => !document.querySelector('.gstrap-quick-tag-input'))

  const html = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return ed.getHtml()
  })
  // <header class="page-head"><h1 …>…</h1></header> should now exist.
  expect(html).toMatch(/<header[^>]*class="page-head"[^>]*>\s*<h1/i)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Property strip heading-level dropdown changes the tag', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-strip-'))
  const projectPath = join(projectDir, 'strip.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  // The strip should have rendered for the h1 selection — find the level select.
  const select = appWindow.locator('[data-field="heading-level"]')
  await select.waitFor({ state: 'visible', timeout: 5_000 })
  await expect(select).toHaveValue('h1')

  await select.selectOption('h3')

  // Dispatch a real change event matches what the keyboard would do; verify
  // the editor's selected component is now h3.
  const newTag = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return ed.getSelected?.()?.get?.('tagName')?.toLowerCase?.()
  })
  expect(newTag).toBe('h3')

  // The strip itself should have re-rendered for the new selection (h3).
  await appWindow.waitForFunction(
    () => document.querySelector('[data-field="heading-level"]')?.value === 'h3',
    null, { timeout: 5_000 }
  )

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('DOM tree mirrors canvas + click selects component', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-domtree-'))
  const projectPath = join(projectDir, 'tree.gstrap')

  const { app, appWindow } = await launch()
  await appWindow.waitForFunction(
    () => window.__gstrap?.pluginRegistry?.activated?.length === 5,
    null, { timeout: 15_000 }
  )

  // Create + open a project so the canvas has the seed index page loaded.
  await appWindow.evaluate(async path => {
    const project = await window.grapestrap.project.new({ name: 'tree', location: path })
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
  }, projectPath)

  // Wait until GrapesJS has populated the wrapper with the seed page's
  // components and the DOM tree has rendered at least one row.
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-cid]').length > 0,
    null, { timeout: 10_000 }
  )

  // The seed page contains <main>…<h1>…<p>… — assert the tree shows them.
  const tags = await appWindow.$$eval(
    '[data-cid] .gstrap-dom-tag',
    nodes => nodes.map(n => n.textContent)
  )
  expect(tags).toContain('main')
  expect(tags).toContain('h1')
  expect(tags).toContain('p')

  // Click the h1 row → editor should select the matching component.
  const selectedTag = await appWindow.evaluate(() => {
    const h1Row = [...document.querySelectorAll('[data-cid]')]
      .find(r => r.querySelector('.gstrap-dom-tag')?.textContent === 'h1')
    h1Row.click()
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return ed?.getSelected?.()?.get?.('tagName')?.toLowerCase?.()
  })
  expect(selectedTag).toBe('h1')

  // Selection should highlight in the tree.
  const highlighted = await appWindow.locator('[data-cid].is-selected').count()
  expect(highlighted).toBe(1)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Right-click on DOM tree row opens context menu; Duplicate adds a sibling; Delete removes', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ctxmenu-'))
  const projectPath = join(projectDir, 'cm.gstrap')

  const { app, appWindow } = await launch()
  await appWindow.waitForFunction(
    () => window.__gstrap?.pluginRegistry?.activated?.length === 5,
    null, { timeout: 15_000 }
  )

  await appWindow.evaluate(async path => {
    const project = await window.grapestrap.project.new({ name: 'cm', location: path })
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
  }, projectPath)

  await appWindow.waitForFunction(
    () => [...document.querySelectorAll('[data-cid] .gstrap-dom-tag')]
      .some(n => n.textContent === 'p'),
    null, { timeout: 10_000 }
  )

  const countP = () => appWindow.evaluate(() =>
    [...document.querySelectorAll('.gstrap-dom-tag')].filter(n => n.textContent === 'p').length
  )

  expect(await countP()).toBe(1)

  // Right-click on the <p> row.
  await appWindow.evaluate(() => {
    const row = [...document.querySelectorAll('[data-cid]')]
      .find(r => r.querySelector('.gstrap-dom-tag')?.textContent === 'p')
    const rect = row.getBoundingClientRect()
    row.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true,
      clientX: rect.left + 10, clientY: rect.top + 5, button: 2
    }))
  })

  // Menu visible.
  await appWindow.waitForSelector('.gstrap-ctxmenu', { timeout: 2_000 })
  const itemLabels = await appWindow.$$eval('.gstrap-ctxmenu-item .gstrap-ctxmenu-label', els => els.map(e => e.textContent))
  expect(itemLabels).toEqual(expect.arrayContaining(['Edit Tag…', 'Wrap with Tag…', 'Duplicate', 'Copy HTML', 'Delete']))

  // Click Duplicate.
  await appWindow.evaluate(() => {
    const dup = [...document.querySelectorAll('.gstrap-ctxmenu-item')]
      .find(li => li.querySelector('.gstrap-ctxmenu-label')?.textContent === 'Duplicate')
    dup.click()
  })

  await appWindow.waitForFunction(
    () => [...document.querySelectorAll('.gstrap-dom-tag')].filter(n => n.textContent === 'p').length === 2,
    null, { timeout: 3_000 }
  )
  expect(await countP()).toBe(2)

  // Right-click the same <p> (now: any of the two) and Delete.
  await appWindow.evaluate(() => {
    const row = [...document.querySelectorAll('[data-cid]')]
      .find(r => r.querySelector('.gstrap-dom-tag')?.textContent === 'p')
    const rect = row.getBoundingClientRect()
    row.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true,
      clientX: rect.left + 10, clientY: rect.top + 5, button: 2
    }))
  })
  await appWindow.waitForSelector('.gstrap-ctxmenu', { timeout: 2_000 })
  await appWindow.evaluate(() => {
    const del = [...document.querySelectorAll('.gstrap-ctxmenu-item')]
      .find(li => li.querySelector('.gstrap-ctxmenu-label')?.textContent === 'Delete')
    del.click()
  })
  await appWindow.waitForFunction(
    () => [...document.querySelectorAll('.gstrap-dom-tag')].filter(n => n.textContent === 'p').length === 1,
    null, { timeout: 3_000 }
  )
  expect(await countP()).toBe(1)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Insert panel: clicking a tile inserts the block into the canvas', async () => {
  // Regression for the silent failure where Insert tiles had `draggable=true`
  // but no click or dragstart handler — clicking them did nothing. Click-to-
  // insert is the v0.0.1 contract; drag-and-drop on the iframe lands in v0.0.2.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-insert-'))
  const projectPath = join(projectDir, 'i.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  await appWindow.waitForFunction(
    () => document.querySelectorAll('.gstrap-block-tile').length > 0,
    null, { timeout: 10_000 }
  )

  const before = await appWindow.evaluate(() =>
    window.__gstrap.pluginRegistry.bound.editor.getWrapper().components().length
  )

  // Click the first tile in whatever the active tab is.
  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-block-tile').click()
  })

  // Wrapper should now have one more direct child, AND a new component should
  // be selected (the freshly-inserted block).
  await appWindow.waitForFunction(
    n => window.__gstrap.pluginRegistry.bound.editor.getWrapper().components().length > n,
    before, { timeout: 3_000 }
  )

  const { after, selectedExists } = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return {
      after: ed.getWrapper().components().length,
      selectedExists: !!ed.getSelected()
    }
  })
  expect(after).toBeGreaterThan(before)
  expect(selectedExists).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

/**
 * Regression: canvas pane must not drift downward when the window is resized
 * back-and-forth.
 *
 * History: pre-fix the renderer had three competing layout drivers (host RO,
 * window 'resize' listener without the 1px gate, Monaco automaticLayout × 3).
 * Each direction-flip fired updateSize once unguarded which let sub-pixel
 * walks accumulate, growing the canvas pane downward. After consolidating to
 * a single integer-gated host RO + per-Monaco container ROs, the canvas pane
 * height must equal the GL host's clientHeight (within ±1 px for GL's
 * integer panel rounding) after a sequence of direction-flips.
 */
test('canvas pane does not drift on alternating window resize', async () => {
  const { app, appWindow } = await launch()

  await appWindow.waitForFunction(() => !!document.querySelector('.gstrap-canvas-host'), null, { timeout: 10_000 })

  const measure = () => appWindow.evaluate(() => {
    const main   = document.getElementById('gstrap-main')
    const canvas = document.querySelector('.gstrap-canvas-host')
    return {
      mainH:   main?.clientHeight   ?? -1,
      canvasH: canvas?.clientHeight ?? -1
    }
  })

  await appWindow.setViewportSize({ width: 1280, height: 800 })
  await appWindow.waitForTimeout(120)
  const start = await measure()

  for (const s of [
    { width: 1400, height: 900 },
    { width: 1100, height: 700 },
    { width: 1500, height: 950 },
    { width: 1000, height: 650 },
    { width: 1280, height: 800 }
  ]) {
    await appWindow.setViewportSize(s)
    await appWindow.waitForTimeout(80)
  }

  const end = await measure()

  // GL host must have non-zero height — pre-fix it was 0 because hiding the
  // linkedfiles row via display:none shifted the gstrap-main element into
  // the linkedfiles auto-row (which collapses to 0 with no content).
  expect(start.mainH).toBeGreaterThan(100)
  expect(end.mainH).toBeGreaterThan(100)

  // Drift assertion: returning to the same viewport size must yield the same
  // pixel-rounded heights as the baseline. (Canvas pane is in a GL stack so
  // it's ~28px shorter than the host's clientHeight for the tab header — that
  // delta is constant, so we don't compare canvas vs host directly.)
  expect(Math.abs(end.mainH - start.mainH)).toBeLessThanOrEqual(1)
  expect(Math.abs(end.canvasH - start.canvasH)).toBeLessThanOrEqual(1)

  await app.close()
})
