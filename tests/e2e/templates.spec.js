/**
 * GrapeStrap — E2E: master templates
 *
 * PATH: tests/e2e/templates.spec.js
 * ROLE: Wave 2 Master Templates specs — round-trip/idempotency anchor first, then
 *       create/new-page/propagation/locking/detach/status-bar/export/missing-file
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 *
 * DELIVERABLE #1 of Wave 2: this suite is written to FAIL against baseline
 * 8220bf5 (window.__gstrap.templates does not exist yet) and go green only
 * after full integration. Test 1 is the RISK #1 contract: data-grpstr-region
 * must survive canvas serialization, the code→design rebuild, save, and
 * reopen — with locks re-applied after every rebuild.
 *
 * Conventions: one launch per test (order-independent), /tmp/gstrap-tpl-*
 * project dirs cleaned per test, null-safe predicates in every
 * waitForFunction (?. chains — never throw mid-poll). No real-mouse input
 * anywhere in this file, so dismissWelcome is not required; if a future
 * edit adds page.mouse.* driving, dismiss the welcome overlay first.
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag } from './helpers.js'

// Chrome (header/footer) + one editable region. Kept deliberately plain —
// every structural assertion below keys on these class/attr hooks.
const TPL_HTML = [
  '<header class="tpl-chrome container py-3"><h2>ACME Site</h2></header>',
  '<main class="container py-5" data-grpstr-region="content"><p class="tpl-default">Default content</p></main>',
  '<footer class="tpl-chrome container py-3"><p>© ACME</p></footer>'
].join('\n')

/** Seed a template + a page built from it via the public test surface
 *  (window.__gstrap.templates — exposed by renderer/main.js in this wave).
 *  Waits until the composed page is live in the canvas. */
async function seedTemplatedPage(appWindow, { tplName = 'master', pageName = 'about' } = {}) {
  await appWindow.evaluate(({ tplName, pageName, tplHtml }) => {
    const api = window.__gstrap?.templates
    if (!api) throw new Error('window.__gstrap.templates missing — Wave 2 not integrated')
    const tpl = api.createTemplate(tplName, tplHtml)
    if (!tpl) throw new Error('createTemplate rejected seed input')
    const page = api.createPage(pageName, tplName)
    if (!page) throw new Error('createPage rejected seed input')
  }, { tplName, pageName, tplHtml: TPL_HTML })
  // createPage opens the new page's tab; wait for the composed body to land.
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('[data-grpstr-region="content"]')
  }, null, { timeout: 10_000 })
}

/** Editor-side lock probe: flags for the first component matching a tag. */
function lockStateOf(tag) {
  // Serialized into the page context — keep it dependency-free.
  return `(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    if (!ed) return null
    function find(c) {
      if ((c.get?.('tagName') || '').toLowerCase() === '${tag}') return c
      for (const k of (c.components?.() || [])) { const r = find(k); if (r) return r }
      return null
    }
    const c = find(ed.getWrapper())
    if (!c) return null
    return {
      editable:  c.get('editable'),
      draggable: c.get('draggable'),
      removable: c.get('removable'),
      copyable:  c.get('copyable')
    }
  })()`
}

test('ROUND-TRIP: region attrs + locks survive serialize → code view → design rebuild → save → reopen', async () => {
  // The RISK #1 contract, in order:
  //   1. Page composed from a template renders with data-grpstr-region intact
  //      and chrome locked (editable/draggable/removable/copyable all false).
  //   2. Edit inside the region (page-local content).
  //   3. getHtml() round 1 carries the region attr AND the edit.
  //   4. Switch the tab to Code view, then back to Design — this runs
  //      rebuildCanvasFromCode() (canvas-sync.js), the seam where locks die
  //      with the old component tree and MUST be re-applied.
  //   5. Region attr present again, locks re-applied, and getHtml() round 2
  //      byte-equals round 1 (idempotency: GrapesJS parse→serialize of its
  //      own output is a fixed point; if this ever fails on pure whitespace,
  //      triage the formatter before relaxing the assert — the contract is
  //      semantic stability, byte stability is the strongest cheap proxy).
  //   6. Save: page file on disk keeps the attr; manifest carries
  //      pages[].regions + templates[].regions; template file is a body-only
  //      .gstrap-tpl fragment.
  //   7. Reopen the project from disk: attr + locks intact again.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tpl-rt-'))
  const projectPath = join(projectDir, 'rt.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedTemplatedPage(appWindow)

  // ── 1. Composed + locked on first load ────────────────────────────────────
  const headerLocks = await appWindow.evaluate(lockStateOf('header'))
  expect(headerLocks).toEqual({ editable: false, draggable: false, removable: false, copyable: false })

  // Region child stays free.
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
    return child ? { editable: child.get('editable'), removable: child.get('removable') } : null
  })
  expect(regionChildLocks).not.toBeNull()
  expect(regionChildLocks.editable).not.toBe(false)
  expect(regionChildLocks.removable).not.toBe(false)

  // ── 2. Edit inside the region + capture round 1 after the sync settles ────
  await appWindow.evaluate(() => {
    window.__tplSyncCount = 0
    window.__gstrap.eventBus.on('sync:canvas-to-code', () => { window.__tplSyncCount++ })
    const ed = window.__gstrap.pluginRegistry.bound.editor
    let region = null
    function walk(c) {
      const attrs = c.getAttributes?.() || {}
      if (attrs['data-grpstr-region'] === 'content') { region = c; return }
      for (const k of (c.components?.() || [])) { if (!region) walk(k) }
    }
    walk(ed.getWrapper())
    region.append('<p class="page-local-edit">hello from the about page</p>')
    window.__gstrap.eventBus.emit('canvas:content-changed')
  })
  // Design→Code sync is debounced 300ms (canvas-sync.js DEBOUNCE_MS); wait for
  // the emit so Monaco holds the edited document before we flip view modes.
  await appWindow.waitForFunction(
    () => (window.__tplSyncCount ?? 0) > 0, null, { timeout: 5_000 })

  const round1 = await appWindow.evaluate(() =>
    window.__gstrap.pluginRegistry.bound.editor.getHtml())
  expect(round1).toContain('data-grpstr-region="content"')
  expect(round1).toContain('page-local-edit')

  // ── 3+4. Code view → back to Design (rebuildCanvasFromCode runs) ──────────
  await appWindow.evaluate(() => window.__gstrap.pageState.setViewMode('about', 'code'))
  await appWindow.waitForTimeout(400)
  await appWindow.evaluate(() => window.__gstrap.pageState.setViewMode('about', 'design'))

  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('[data-grpstr-region="content"] .page-local-edit')
  }, null, { timeout: 10_000 })

  // Locks re-applied on the REBUILT tree — the Wave 2 seam.
  const headerLocksAfterRebuild = await appWindow.evaluate(lockStateOf('header'))
  expect(headerLocksAfterRebuild).toEqual({ editable: false, draggable: false, removable: false, copyable: false })

  // ── 5. Idempotency ─────────────────────────────────────────────────────────
  const round2 = await appWindow.evaluate(() =>
    window.__gstrap.pluginRegistry.bound.editor.getHtml())
  expect(round2).toBe(round1)

  // ── 6. Save → disk + manifest shapes ───────────────────────────────────────
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForFunction(
    () => window.__gstrap?.projectState?.isDirty?.() === false, null, { timeout: 10_000 })

  const pageOnDisk = await fsp.readFile(join(projectDir, 'site', 'pages', 'about.html'), 'utf8')
  expect(pageOnDisk).toContain('data-grpstr-region="content"')
  expect(pageOnDisk).toContain('page-local-edit')

  const tplOnDisk = await fsp.readFile(join(projectDir, 'site', 'templates', 'master.gstrap-tpl'), 'utf8')
  expect(tplOnDisk).toContain('data-grpstr-region="content"')
  expect(tplOnDisk).not.toMatch(/<html\b/i)   // body-only fragment by design

  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(manifest.version).toBe('1.0')        // ADDITIVE — no manifest migration
  const aboutEntry = manifest.pages.find(p => p.name === 'about')
  expect(aboutEntry.templateName).toBe('master')
  expect(aboutEntry.regions.content).toContain('page-local-edit')
  const tplEntry = manifest.templates.find(t => t.name === 'master')
  expect(tplEntry.file).toBe('templates/master.gstrap-tpl')
  expect(tplEntry.regions).toEqual([expect.objectContaining({ id: 'content' })])

  // ── 7. Reopen from disk ────────────────────────────────────────────────────
  await appWindow.evaluate(async path => {
    const project = await window.grapestrap.project.open(path)
    window.__gstrap.projectState.set(project)
    window.__gstrap.pageState.open('about')
  }, projectPath)
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('[data-grpstr-region="content"] .page-local-edit')
  }, null, { timeout: 10_000 })
  const headerLocksAfterReopen = await appWindow.evaluate(lockStateOf('header'))
  expect(headerLocksAfterReopen).toEqual({ editable: false, draggable: false, removable: false, copyable: false })

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('undo contract: canvas history clears across the code→design rebuild (fence+clear)', async () => {
  // PRODUCT DECISION pinned here (PLAN.md §4, user may veto): the same
  // UndoManager fence+clear the 2026-07-12 swapToTab fix applied
  // (canvas/index.js) now wraps rebuildCanvasFromCode. Contract: canvas undo
  // history is per view-session — a code→design switch clears it, so undo can
  // never restore a tree the authoritative Monaco buffer no longer describes.
  // If the decision flips to fence-without-clear, retitle and flip the final
  // two asserts (hasUndo stays true, undo restores the pre-switch tree).
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tpl-undo-'))
  const projectPath = join(projectDir, 'undo.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedTemplatedPage(appWindow)

  // A real design edit → at least one undo step.
  await appWindow.evaluate(() => {
    window.__tplSyncCount = 0
    window.__gstrap.eventBus.on('sync:canvas-to-code', () => { window.__tplSyncCount++ })
    const ed = window.__gstrap.pluginRegistry.bound.editor
    let region = null
    function walk(c) {
      const attrs = c.getAttributes?.() || {}
      if (attrs['data-grpstr-region']) { region = c; return }
      for (const k of (c.components?.() || [])) { if (!region) walk(k) }
    }
    walk(ed.getWrapper())
    region.append('<p class="undoable-edit">step</p>')
  })
  const hadUndo = await appWindow.evaluate(() =>
    window.__gstrap?.pluginRegistry?.bound?.editor?.UndoManager?.hasUndo?.() ?? null)
  expect(hadUndo).toBe(true)

  // Let the 300ms design→code debounce land the edit in Monaco first.
  await appWindow.waitForFunction(
    () => (window.__tplSyncCount ?? 0) > 0, null, { timeout: 5_000 })
  await appWindow.evaluate(() => window.__gstrap.pageState.setViewMode('about', 'code'))
  await appWindow.evaluate(() => window.__gstrap.pageState.setViewMode('about', 'design'))
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('.undoable-edit')
  }, null, { timeout: 10_000 })

  const afterRebuild = await appWindow.evaluate(() => {
    const um = window.__gstrap?.pluginRegistry?.bound?.editor?.UndoManager
    return um ? { hasUndo: um.hasUndo() } : null
  })
  expect(afterRebuild).toEqual({ hasUndo: false })

  // And undo now is a harmless no-op — the edit survives.
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'edit:undo'))
  const stillThere = await appWindow.evaluate(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('.undoable-edit')
  })
  expect(stillThere).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('create template: file-manager "+ New Template" → prompt → template tab; save writes .gstrap-tpl + regions meta', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tpl-new-'))
  const projectPath = join(projectDir, 'new.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // FM section + button exist once a project is open.
  await appWindow.waitForSelector('[data-fm-new-template]', { timeout: 5_000, state: 'attached' })
  await appWindow.evaluate(() => document.querySelector('[data-fm-new-template]').click())

  // Name prompt (showTextPrompt) — fill + OK.
  await appWindow.waitForSelector('.gstrap-prompt-input', { timeout: 3_000 })
  await appWindow.evaluate(() => {
    const input = document.querySelector('.gstrap-prompt-input')
    input.value = 'master'
    document.querySelector('.gstrap-prompt-overlay [data-action="ok"]').click()
  })

  // Template tab opens in template mode; FM lists it.
  await appWindow.waitForFunction(() => {
    const tab = window.__gstrap?.pageState?.active?.()
    return tab?.kind === 'template' && tab?.pageName === 'master'
  }, null, { timeout: 5_000 })
  await appWindow.waitForSelector('[data-fm-template="master"]', { timeout: 3_000, state: 'attached' })

  // Default template content carries one region; nothing is locked in
  // template-editing mode (v4 §14: open template directly → all editable).
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('[data-grpstr-region]')
  }, null, { timeout: 10_000 })
  const chromeInTplMode = await appWindow.evaluate(lockStateOf('header'))
  // NOTE: `editable` is false by GrapesJS FACTORY default on non-text
  // components (dist defaults: editable:!1), so it can't distinguish locked
  // from unlocked chrome. Probe the flags whose unlocked default is true and
  // which the chrome lock flips (integration fix — draft asserted editable).
  if (chromeInTplMode) {
    expect(chromeInTplMode.removable).not.toBe(false)
    expect(chromeInTplMode.draggable).not.toBe(false)
    expect(chromeInTplMode.copyable).not.toBe(false)
  }
  // Wave 5 chrome-dim: template-editing tabs never dim — regions exist in
  // the DOM here too, so this pins the class gate (not just the selectors).
  const dimInTplMode = await appWindow.evaluate(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return doc ? doc.documentElement.classList.contains('gstrap-tpl-locked') : null
  })
  expect(dimInTplMode).toBe(false)

  // Save flushes the template tab and writes the fragment + manifest meta.
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForFunction(
    () => window.__gstrap?.projectState?.isDirty?.() === false, null, { timeout: 10_000 })

  const tplOnDisk = await fsp.readFile(join(projectDir, 'site', 'templates', 'master.gstrap-tpl'), 'utf8')
  expect(tplOnDisk).toContain('data-grpstr-region')
  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  const entry = manifest.templates.find(t => t.name === 'master')
  expect(entry.file).toBe('templates/master.gstrap-tpl')
  expect(Array.isArray(entry.regions)).toBe(true)
  expect(entry.regions.length).toBeGreaterThan(0)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('New Page dialog: template select composes chrome + defaults; duplicate and unsafe names rejected', async () => {
  // Also pins the Wave 0 bug fix: cmdNewPage used to accept duplicate names
  // (menu-router.js had no collision check) — the dialog must reject them.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tpl-np-'))
  const projectPath = join(projectDir, 'np.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await appWindow.evaluate(tplHtml => {
    window.__gstrap.templates.createTemplate('master', tplHtml)
  }, TPL_HTML)

  // ── happy path: new page from template ────────────────────────────────────
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:new-page'))
  await appWindow.waitForSelector('[data-np-name]', { timeout: 3_000 })
  const options = await appWindow.$$eval('[data-np-template] option', els => els.map(o => o.value))
  expect(options).toContain('')          // "None" — standalone page
  expect(options).toContain('master')
  await appWindow.evaluate(() => {
    document.querySelector('[data-np-name]').value = 'about'
    document.querySelector('[data-np-template]').value = 'master'
    document.querySelector('[data-np-ok]').click()
  })
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('[data-grpstr-region="content"] .tpl-default') &&
           !!doc?.querySelector('header.tpl-chrome')
  }, null, { timeout: 10_000 })
  const pageEntry = await appWindow.evaluate(() => {
    const p = window.__gstrap.projectState.getPage('about')
    return p ? { templateName: p.templateName, hasRegions: !!p.regions?.content } : null
  })
  expect(pageEntry).toEqual({ templateName: 'master', hasRegions: true })

  // ── duplicate name rejected, nothing created ───────────────────────────────
  const pagesBefore = await appWindow.evaluate(() => window.__gstrap.projectState.current.pages.length)
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:new-page'))
  await appWindow.waitForSelector('[data-np-name]', { timeout: 3_000 })
  await appWindow.evaluate(() => {
    document.querySelector('[data-np-name]').value = 'about'
    document.querySelector('[data-np-ok]').click()
  })
  await appWindow.waitForFunction(() => {
    const err = document.querySelector('[data-np-error]')
    return !!err && !err.hidden && (err.textContent || '').length > 0
  }, null, { timeout: 3_000 })
  let pagesAfter = await appWindow.evaluate(() => window.__gstrap.projectState.current.pages.length)
  expect(pagesAfter).toBe(pagesBefore)

  // ── unsafe charset rejected (path traversal into page.file) ───────────────
  await appWindow.evaluate(() => {
    document.querySelector('[data-np-name]').value = '../evil'
    document.querySelector('[data-np-ok]').click()
  })
  await appWindow.waitForFunction(() => {
    const err = document.querySelector('[data-np-error]')
    return !!err && !err.hidden && (err.textContent || '').length > 0
  }, null, { timeout: 3_000 })
  pagesAfter = await appWindow.evaluate(() => window.__gstrap.projectState.current.pages.length)
  expect(pagesAfter).toBe(pagesBefore)
  await appWindow.evaluate(() => document.querySelector('[data-np-cancel]')?.click())

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('propagation: template edit fans out to referencing pages on tab focus-out, preserving region content', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tpl-prop-'))
  const projectPath = join(projectDir, 'prop.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await appWindow.evaluate(tplHtml => {
    const api = window.__gstrap.templates
    api.createTemplate('master', tplHtml)
    api.createPage('about', 'master')
    api.createPage('contact', 'master')
  }, TPL_HTML)

  // Give 'about' page-local region content to prove preservation.
  await appWindow.evaluate(() => {
    const page = window.__gstrap.projectState.getPage('about')
    page.html = page.html.replace('Default content', 'ABOUT-LOCAL content')
    window.__gstrap.projectState.markPageDirty('about')
  })

  // Open the template tab, mutate the chrome, then focus a page tab — the
  // swap-out capture is the propagation moment (mirrors library items).
  await appWindow.evaluate(() => {
    window.__gstrap.pageState.open('master', { kind: 'template', label: 'master' })
  })
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('header.tpl-chrome h2')
  }, null, { timeout: 10_000 })
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    function find(c) {
      if ((c.get?.('tagName') || '').toLowerCase() === 'h2') return c
      for (const k of (c.components?.() || [])) { const r = find(k); if (r) return r }
      return null
    }
    const h2 = find(ed.getWrapper())
    h2.components('ACME v2')                 // chrome edit in template mode
    window.__gstrap.eventBus.emit('canvas:content-changed')
  })
  await appWindow.evaluate(() => window.__gstrap.pageState.focus('about'))

  // Both referencing pages recomposed; about's region content preserved;
  // the seed 'index' page (no template) untouched.
  await appWindow.waitForFunction(() => {
    const ps = window.__gstrap?.projectState
    const about = ps?.getPage?.('about')
    const contact = ps?.getPage?.('contact')
    return !!about?.html?.includes('ACME v2') && !!contact?.html?.includes('ACME v2')
  }, null, { timeout: 10_000 })
  const state = await appWindow.evaluate(() => {
    const ps = window.__gstrap.projectState
    return {
      aboutKeepsLocal: ps.getPage('about').html.includes('ABOUT-LOCAL content'),
      contactHasDefault: ps.getPage('contact').html.includes('Default content'),
      indexUntouched: !ps.getPage('index').html.includes('ACME v2'),
      canvasShowsNewChrome: (() => {
        const doc = window.__gstrap.pluginRegistry.bound.editor?.Canvas?.getFrameEl?.()?.contentDocument
        return !!doc?.querySelector('header.tpl-chrome') && doc.body.textContent.includes('ACME v2')
      })()
    }
  })
  expect(state).toEqual({
    aboutKeepsLocal: true,
    contactHasDefault: true,
    indexUntouched: true,
    canvasShowsNewChrome: true
  })

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('lock enforcement: chrome refuses delete/duplicate through the command path; region children stay editable', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tpl-lock-'))
  const projectPath = join(projectDir, 'lock.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedTemplatedPage(appWindow)

  // Select the chrome <footer>, attempt Edit → Delete and Edit → Duplicate.
  await selectFirstByTag(appWindow, 'footer')
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'edit:delete'))
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'edit:duplicate'))
  const chromeState = await appWindow.evaluate(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return doc ? { footers: doc.querySelectorAll('footer.tpl-chrome').length } : null
  })
  expect(chromeState).toEqual({ footers: 1 })   // not deleted, not duplicated

  // Wave 5 chrome-dim: on a templated PAGE the canvas root carries the lock
  // class and topmost chrome is visually dimmed; region content is not.
  // (Runs before the region-child delete below — .tpl-default must exist.)
  const dimState = await appWindow.evaluate(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    if (!doc?.defaultView) return null
    const header = doc.querySelector('header.tpl-chrome')
    const regionChild = doc.querySelector('[data-grpstr-region="content"] .tpl-default')
    return {
      rootClass: doc.documentElement.classList.contains('gstrap-tpl-locked'),
      headerOpacity: header ? doc.defaultView.getComputedStyle(header).opacity : null,
      regionChildOpacity: regionChild ? doc.defaultView.getComputedStyle(regionChild).opacity : null
    }
  })
  expect(dimState).toEqual({ rootClass: true, headerOpacity: '0.6', regionChildOpacity: '1' })

  // Region child: delete goes through.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    let target = null
    function walk(c) {
      const attrs = c.getAttributes?.() || {}
      if (attrs['data-grpstr-region']) { target = c.components?.().at?.(0) || null; return }
      for (const k of (c.components?.() || [])) { if (!target) walk(k) }
    }
    walk(ed.getWrapper())
    ed.select(target)
  })
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'edit:delete'))
  const regionEmptied = await appWindow.evaluate(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !doc?.querySelector('[data-grpstr-region="content"] .tpl-default')
  })
  expect(regionEmptied).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('detach: page becomes a free copy — attrs stripped, locks cleared, propagation skips it', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tpl-det-'))
  const projectPath = join(projectDir, 'det.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedTemplatedPage(appWindow)

  await appWindow.evaluate(() => {
    const ok = window.__gstrap.templates.detachActivePage()
    if (!ok) throw new Error('detachActivePage returned falsy on a templated page')
  })

  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc && doc.querySelectorAll('[data-grpstr-region]').length === 0 &&
           !!doc.querySelector('header.tpl-chrome')   // content kept, marker gone
  }, null, { timeout: 5_000 })

  const after = await appWindow.evaluate(() => {
    const p = window.__gstrap.projectState.getPage('about')
    return { templateName: p.templateName, regions: p.regions, html: p.html }
  })
  expect(after.templateName).toBeNull()
  expect(after.regions).toEqual({})
  expect(after.html).not.toContain('data-grpstr-region')
  expect(after.html).toContain('tpl-chrome')            // rendered copy stays in place

  // Chrome is editable again.
  const headerLocks = await appWindow.evaluate(lockStateOf('header'))
  expect(headerLocks?.editable).not.toBe(false)
  expect(headerLocks?.removable).not.toBe(false)

  // Wave 5 chrome-dim: detach clears the canvas-root lock class too.
  const dimGone = await appWindow.evaluate(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return doc ? !doc.documentElement.classList.contains('gstrap-tpl-locked') : null
  })
  expect(dimGone).toBe(true)

  // Future propagation must skip the detached page.
  await appWindow.evaluate(() => {
    window.__gstrap.templates.propagateTemplate('master',
      '<header class="tpl-chrome"><h2>SHOULD NOT LAND</h2></header>' +
      '<main data-grpstr-region="content"></main>')
  })
  const untouched = await appWindow.evaluate(() =>
    !window.__gstrap.projectState.getPage('about').html.includes('SHOULD NOT LAND'))
  expect(untouched).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('status bar: region indicator reads inside / outside / none on a templated page', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tpl-sb-'))
  const projectPath = join(projectDir, 'sb.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedTemplatedPage(appWindow)

  // No selection → template-name cell, state "none".
  await appWindow.waitForFunction(() => {
    const cell = document.querySelector('.gstrap-sb-region')
    return cell?.dataset?.regionState === 'none' && (cell.textContent || '').includes('master')
  }, null, { timeout: 5_000 })

  // Select inside the region → "inside" + region id.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    let target = null
    function walk(c) {
      const attrs = c.getAttributes?.() || {}
      if (attrs['data-grpstr-region']) { target = c.components?.().at?.(0) || null; return }
      for (const k of (c.components?.() || [])) { if (!target) walk(k) }
    }
    walk(ed.getWrapper())
    ed.select(target)
  })
  await appWindow.waitForFunction(() => {
    const cell = document.querySelector('.gstrap-sb-region')
    return cell?.dataset?.regionState === 'inside' && (cell.textContent || '').includes('content')
  }, null, { timeout: 5_000 })

  // Select chrome → "outside".
  await selectFirstByTag(appWindow, 'footer')
  await appWindow.waitForFunction(() => {
    const cell = document.querySelector('.gstrap-sb-region')
    return cell?.dataset?.regionState === 'outside'
  }, null, { timeout: 5_000 })

  // A non-templated page shows no region cell at all.
  await appWindow.evaluate(() => window.__gstrap.pageState.focus('index'))
  await appWindow.waitForFunction(
    () => !document.querySelector('.gstrap-sb-region'), null, { timeout: 5_000 })

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('export skips .gstrap-tpl files while exported pages keep composed chrome', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tpl-exp-'))
  const projectPath = join(projectDir, 'exp.gstrap')
  const outputDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tpl-exp-out-'))

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedTemplatedPage(appWindow)
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForFunction(
    () => window.__gstrap?.projectState?.isDirty?.() === false, null, { timeout: 10_000 })

  await appWindow.evaluate(async out => {
    await window.grapestrap.project.export(window.__gstrap.projectState.current, out)
  }, outputDir)

  // No template artifacts anywhere in the export tree.
  const found = []
  async function walk(dir) {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) { if (e.name === 'templates') found.push(p); await walk(p) }
      else if (e.name.endsWith('.gstrap-tpl')) found.push(p)
    }
  }
  await walk(outputDir)
  expect(found).toEqual([])

  // The templated page exported with its composed chrome intact.
  const aboutHtml = await fsp.readFile(join(outputDir, 'about.html'), 'utf8')
  expect(aboutHtml).toContain('tpl-chrome')
  expect(aboutHtml).toContain('ACME Site')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
  await fsp.rm(outputDir,  { recursive: true, force: true })
})

test('missing template file: project still opens (fail-open), pages intact and locked, warning surfaced', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tpl-miss-'))
  const projectPath = join(projectDir, 'miss.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedTemplatedPage(appWindow)
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForFunction(
    () => window.__gstrap?.projectState?.isDirty?.() === false, null, { timeout: 10_000 })

  // Sabotage: delete the template fragment from disk.
  await fsp.rm(join(projectDir, 'site', 'templates', 'master.gstrap-tpl'))

  // Reopen — before the F1 fix this rejects the WHOLE project (bare readFile
  // inside Promise.all, project-manager.js loadProject). Contract: fail-open.
  const reopened = await appWindow.evaluate(async path => {
    const toasts = []
    window.__gstrap.eventBus.on('toast', t => toasts.push(t))
    const project = await window.grapestrap.project.open(path)
    if (!project) return null
    window.__gstrap.projectState.set(project)
    window.__gstrap.pageState.open('about')
    const tpl = project.templates.find(t => t.name === 'master')
    return {
      opened: true,
      tplHtml: tpl?.html ?? null,
      tplMissing: tpl?.missingFile === true,
      toastCount: toasts.length   // warning toast may land async; asserted loosely below
    }
  }, projectPath)
  expect(reopened?.opened).toBe(true)
  expect(reopened.tplHtml).toBe('')
  expect(reopened.tplMissing).toBe(true)

  // Page fails OPEN: composed content + region attrs live in the page file,
  // so it renders and locks without the template fragment.
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const doc = ed?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('[data-grpstr-region="content"]')
  }, null, { timeout: 10_000 })
  const headerLocks = await appWindow.evaluate(lockStateOf('header'))
  expect(headerLocks).toEqual({ editable: false, draggable: false, removable: false, copyable: false })

  // The missing-template warning surfaced somewhere the user can see.
  const warned = await appWindow.waitForFunction(() => {
    const host = document.getElementById('gstrap-toasts')
    return !!host && /template/i.test(host.textContent || '')
  }, null, { timeout: 5_000 }).then(() => true).catch(() => false)
  expect(warned).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
