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
