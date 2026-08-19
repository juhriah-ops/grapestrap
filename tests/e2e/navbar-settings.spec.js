/**
 * GrapeStrap — E2E: Style Manager Navbar sub-panel
 *
 * PATH: tests/e2e/navbar-settings.spec.js
 * ROLE: The panel side of the navbar behaviors feature — resolution (which
 *       navbar a selection edits, and the hint when there is none), the
 *       class-first position control, and the `data-gs-nav-*` attribute
 *       gestures with their two halves proven separately: an ENABLE writes the
 *       attribute AND lands the behaviors runtime in the project, and an OFF
 *       really REMOVES the attribute (GrapesJS's removeAttributes round-trip,
 *       which the whole panel design rests on — the runtime tests attribute
 *       PRESENCE, so a leftover `="0"` would keep a switched-off behavior
 *       running). Sibling file navbar-behaviors.spec.js owns the INSERT side
 *       (harvested navbar sections); this file owns the panel.
 * DEPENDS: @playwright/test, ./helpers.js,
 *          src/renderer/panels/style-manager/navbar.js (the panel under test)
 * CREATED: 2026-08-18
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  launch, openSeedProject, selectFirstByTag, fileExists, dismissWelcome,
  createBundledStarterProject
} from './helpers.js'

// A navbar with everything the panel reads: the `navbar` class it resolves on,
// and a toggler whose data-bs-toggle tells it which auto-close mode fits.
const NAVBAR_HTML = `
<nav class="navbar navbar-expand-lg gs-spec-nav">
  <div class="container-fluid">
    <a class="navbar-brand" href="index.html">Brand</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#gsSpecMenu">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="gsSpecMenu">
      <ul class="navbar-nav">
        <li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>
      </ul>
    </div>
  </div>
</nav>`

/** Seed the blank project's page with the spec navbar and select it. */
async function seedNavbar(appWindow) {
  await appWindow.evaluate(html => {
    window.__gstrap.pluginRegistry.bound.editor.getWrapper().append(html)
  }, NAVBAR_HTML)
  const tag = await selectFirstByTag(appWindow, 'nav')
  expect(tag).toBe('nav')
}

/** Open the Navbar accordion section and wait for its body to render. */
async function openNavbarSection(appWindow) {
  await appWindow.evaluate(() => {
    const section = document.querySelector('.gstrap-sm-section[data-sp="navbar"]')
    const body = section.querySelector('.gstrap-sm-body')
    if (body.hasAttribute('hidden')) section.querySelector('[data-toggle="navbar"]').click()
  })
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="navbar"] .gstrap-sm-body:not([hidden])', { timeout: 5_000 })
}

/** Click a control inside the Navbar sub-panel body. */
const clickInPanel = (appWindow, selector) => appWindow.evaluate(sel => {
  document.querySelector('.gstrap-sm-section[data-sp="navbar"] .gstrap-sm-body').querySelector(sel).click()
}, selector)

/** Set a select/input inside the panel and fire the commit event it listens for. */
const setFieldInPanel = (appWindow, selector, value) => appWindow.evaluate(({ sel, val }) => {
  const field = document.querySelector('.gstrap-sm-section[data-sp="navbar"] .gstrap-sm-body').querySelector(sel)
  field.value = val
  field.dispatchEvent(new Event('change', { bubbles: true }))
}, { sel: selector, val: value })

/**
 * Wait until the navbar IN THE CANVAS DOCUMENT matches an attribute
 * expectation. The canvas DOM — not the component model — is what the
 * behaviors runtime will read on the exported page, so that is where these
 * assertions look. `null` asserts the attribute is gone entirely.
 */
const waitForNavAttribute = (appWindow, name, value) => appWindow.waitForFunction(({ n, v }) => {
  const doc = window.__gstrap.pluginRegistry.bound.editor.Canvas.getFrameEl().contentDocument
  const nav = doc.querySelector('nav.navbar')
  if (!nav) return false
  return v === null ? !nav.hasAttribute(n) : nav.getAttribute(n) === v
}, { n: name, v: value }, { timeout: 10_000 })

const navClasses = appWindow => appWindow.evaluate(() => {
  const doc = window.__gstrap.pluginRegistry.bound.editor.Canvas.getFrameEl().contentDocument
  return [...(doc.querySelector('nav.navbar')?.classList || [])]
})

test('Navbar panel: position class, scroll attributes, runtime delivery, and one-undo enable', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-navpanel-'))
  const projectPath = join(projectDir, 'navpanel.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedNavbar(appWindow)
  await openNavbarSection(appWindow)

  // ── 1. Selecting the navbar puts the real controls on screen ──────────────
  const controls = await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="navbar"] .gstrap-sm-body')
    return {
      positions: body.querySelectorAll('[data-nav-position]').length,
      hasScrollMode: !!body.querySelector('[data-nav-scroll-mode]'),
      hasShrink: !!body.querySelector('[data-nav-toggle="data-gs-nav-shrink"]'),
      hasHide: !!body.querySelector('[data-nav-toggle="data-gs-nav-hide"]'),
      autocloseOptions: [...body.querySelectorAll('[data-nav-autoclose] option')].map(o => o.textContent.trim()),
      // Nothing is switched on yet, so the shared threshold has nothing to
      // govern and stays out of the way.
      hasThreshold: !!body.querySelector('[data-nav-offset]')
    }
  })
  expect(controls.positions).toBe(3)
  expect(controls.hasScrollMode).toBe(true)
  expect(controls.hasShrink).toBe(true)
  expect(controls.hasHide).toBe(true)
  expect(controls.hasThreshold).toBe(false)
  // The toggler says data-bs-toggle="collapse", so the Collapse option — and
  // only that one — is marked as this navbar's own mechanism.
  expect(controls.autocloseOptions).toContain("Collapse menu (this navbar's)")
  expect(controls.autocloseOptions).toContain('Offcanvas panel')

  // ── 2. Position is class-first: no runtime needed to pin a navbar ─────────
  await clickInPanel(appWindow, '[data-nav-position="sticky-top"]')
  await appWindow.waitForFunction(() => {
    const doc = window.__gstrap.pluginRegistry.bound.editor.Canvas.getFrameEl().contentDocument
    return !!doc.querySelector('nav.navbar.sticky-top')
  }, null, { timeout: 5_000 })

  // ── 3. Background-on-scroll writes the attribute AND delivers the runtime ─
  await setFieldInPanel(appWindow, '[data-nav-scroll-mode]', 'solid')
  await waitForNavAttribute(appWindow, 'data-gs-nav-scroll', 'solid')

  // ensureBehaviors() is awaited BEFORE the attribute is written, so the
  // attribute showing up means the copy already finished — no polling needed.
  expect(await fileExists(join(projectDir, 'site', 'assets', 'js', 'gstrap-behaviors.js'))).toBe(true)
  expect(await fileExists(join(projectDir, 'site', 'assets', 'css', 'gstrap-behaviors.css'))).toBe(true)

  await appWindow.evaluate(async () => {
    await window.grapestrap.project.save(window.__gstrap.projectState.current)
  })
  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(manifest.behaviors).toBeTruthy()

  // ── 4. Threshold: written when it differs, ABSENT at the runtime default ──
  // The panel now shows the shared threshold, because something reads it.
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="navbar"] [data-nav-offset]', { timeout: 5_000 })
  await setFieldInPanel(appWindow, '[data-nav-offset]', '120')
  await waitForNavAttribute(appWindow, 'data-gs-nav-scroll-offset', '120')

  // Back to 40 (the runtime's own default) — an attribute restating the
  // default is noise, so the gesture REMOVES it. First removeAttributes proof.
  await setFieldInPanel(appWindow, '[data-nav-offset]', '40')
  await waitForNavAttribute(appWindow, 'data-gs-nav-scroll-offset', null)

  // ── 5. Off really removes ────────────────────────────────────────────────
  // The runtime tests presence (hasAttribute), so this is the assertion the
  // whole storage design depends on: no sentinel value is left behind.
  await setFieldInPanel(appWindow, '[data-nav-scroll-mode]', '')
  await waitForNavAttribute(appWindow, 'data-gs-nav-scroll', null)

  // The class list survived the attribute removals untouched — removeAttributes
  // rewrites the whole attribute map, and classes live beside it.
  expect(await navClasses(appWindow)).toEqual(expect.arrayContaining(['navbar', 'sticky-top', 'gs-spec-nav']))

  // ── 6. Hide on scroll down, then ONE undo ────────────────────────────────
  await clickInPanel(appWindow, '[data-nav-toggle="data-gs-nav-hide"][data-nav-toggle-to="on"]')
  await waitForNavAttribute(appWindow, 'data-gs-nav-hide', '1')

  // Undo pin: enabling a behavior is a single attribute write, so exactly one
  // undo takes it back — and takes nothing else with it (the position class
  // set three gestures ago must still be there).
  // Braces, not an expression body: UndoManager.undo() returns the manager
  // itself, which Playwright cannot serialize back across the bridge.
  await appWindow.evaluate(() => { window.__gstrap.pluginRegistry.bound.editor.UndoManager.undo() })
  await waitForNavAttribute(appWindow, 'data-gs-nav-hide', null)
  expect(await navClasses(appWindow)).toContain('sticky-top')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Navbar panel: hint off a navbar, Hide disabled while Static, everything disabled when locked', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-navpanel2-'))
  const projectPath = join(projectDir, 'navpanel2.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedNavbar(appWindow)
  await openNavbarSection(appWindow)

  // ── 1. A selection with no navbar in its ancestry gets a hint, not controls ─
  // The seed page's <main> sits beside the navbar, not inside it — the walk
  // has to stay narrow enough to say "no" here.
  expect(await selectFirstByTag(appWindow, 'main')).toBe('main')
  await appWindow.waitForFunction(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="navbar"] .gstrap-sm-body')
    return !!body && !body.querySelector('[data-nav-position]')
  }, null, { timeout: 5_000 })
  const hintText = await appWindow.evaluate(() =>
    document.querySelector('.gstrap-sm-section[data-sp="navbar"] .gstrap-sm-body').textContent)
  expect(hintText).toContain('Select a navbar to edit its behavior.')

  // ── 2. Back on the navbar: Static leaves Hide unusable, with the reason ───
  // A navbar that scrolls away with the page has nothing to hide from, and the
  // runtime skips it outright — so the control says so instead of lying.
  await selectFirstByTag(appWindow, 'nav')
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="navbar"] [data-nav-position]', { timeout: 5_000 })

  const staticState = await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="navbar"] .gstrap-sm-body')
    return {
      hideDisabled: [...body.querySelectorAll('[data-nav-toggle="data-gs-nav-hide"]')].every(b => b.disabled),
      shrinkDisabled: [...body.querySelectorAll('[data-nav-toggle="data-gs-nav-shrink"]')].some(b => b.disabled),
      text: body.textContent
    }
  })
  expect(staticState.hideDisabled).toBe(true)
  expect(staticState.shrinkDisabled).toBe(false)
  expect(staticState.text).toContain('Hide on scroll needs a sticky or fixed navbar.')

  // Pinning the navbar releases it.
  await clickInPanel(appWindow, '[data-nav-position="fixed-top"]')
  await appWindow.waitForFunction(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="navbar"] .gstrap-sm-body')
    return [...body.querySelectorAll('[data-nav-toggle="data-gs-nav-hide"]')].every(b => !b.disabled)
  }, null, { timeout: 5_000 })
  // Fixed also earns the content-offset warning that Sticky does not need.
  const fixedText = await appWindow.evaluate(() =>
    document.querySelector('.gstrap-sm-section[data-sp="navbar"] .gstrap-sm-body').textContent)
  expect(fixedText).toContain('A fixed navbar sits above the page')

  // ── 3. A locked navbar renders read-only ─────────────────────────────────
  // `removable: false` is the lock marker both lock modules set (see
  // editor/component-lock.js) — this is a template-locked navbar's state.
  await appWindow.evaluate(() => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    editor.getSelected().set('removable', false)
  })
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('canvas:component-class-changed'))

  const lockedState = await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="navbar"] .gstrap-sm-body')
    const controls = [...body.querySelectorAll('button[data-nav-position], button[data-nav-toggle], select')]
    return {
      count: controls.length,
      allDisabled: controls.every(control => control.disabled),
      text: body.textContent
    }
  })
  expect(lockedState.count).toBeGreaterThan(0)
  expect(lockedState.allDisabled).toBe(true)
  expect(lockedState.text).toContain("This navbar is locked by its template")

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Navbar panel: swap colours need a class of the navbar\'s own, then write both rules', async () => {
  // The scrolled colour is the one setting that cannot live in an attribute —
  // it is a colour, and colours belong in the stylesheet. Both rules must land
  // on a selector that identifies THIS navbar: scoping them to `.navbar` would
  // repaint every navbar in the project, which is why the row refuses to draw
  // chips until the element has a class of its own.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-navswap-'))
  const projectPath = join(projectDir, 'navswap.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await appWindow.evaluate(() => {
    // Bootstrap classes only — nothing here identifies this navbar.
    window.__gstrap.pluginRegistry.bound.editor.getWrapper()
      .append('<nav class="navbar navbar-expand-lg sticky-top"><span class="navbar-brand">Brand</span></nav>')
  })
  expect(await selectFirstByTag(appWindow, 'nav')).toBe('nav')
  await openNavbarSection(appWindow)

  await setFieldInPanel(appWindow, '[data-nav-scroll-mode]', 'swap')
  await waitForNavAttribute(appWindow, 'data-gs-nav-scroll', 'swap')

  const withoutClass = await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="navbar"] .gstrap-sm-body')
    return { chips: body.querySelectorAll('[data-nav-color]').length, text: body.textContent }
  })
  expect(withoutClass.chips).toBe(0)
  expect(withoutClass.text).toContain('Give this navbar a class of its own')

  // Give it one, exactly as the hint asks.
  await appWindow.evaluate(() => {
    const selected = window.__gstrap.pluginRegistry.bound.editor.getSelected()
    selected.setClass([...(selected.getClasses() || []), 'site-header-nav'])
  })
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="navbar"] [data-nav-color="scrolled"]', { timeout: 5_000 })

  for (const [chip, value] of [['top', '#101820'], ['scrolled', '#f5f7fa']]) {
    await clickInPanel(appWindow, `[data-nav-color="${chip}"]`)
    await appWindow.waitForSelector('.gstrap-cp-popover', { timeout: 2_000 })
    await appWindow.evaluate(v => {
      const input = document.querySelector('.gstrap-cp-popover [data-cp-input]')
      input.value = v
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, value)
    await appWindow.keyboard.press('Escape')
    await appWindow.waitForFunction(
      () => !document.querySelector('.gstrap-cp-popover'), null, { timeout: 2_000 })
  }

  const css = await appWindow.evaluate(() => window.__gstrap.projectState.current.globalCSS || '')
  // Both colours are written against the class the RUNTIME toggles while the
  // page is scrolled: the resting colour on `:not(.gs-nav-scrolled)`, the
  // scrolled one on `.gs-nav-scrolled`. Same weight, so neither state can
  // outrank the other, and both outrank a one-class theme rule.
  expect(css).toMatch(/\.site-header-nav:not\(\.gs-nav-scrolled\)\s*\{[^}]*background-color:\s*#101820/)
  expect(css).toMatch(/\.site-header-nav\.gs-nav-scrolled\s*\{[^}]*background-color:\s*#f5f7fa/)
  // The bare selector is NOT where the resting colour goes — a rule there is
  // what the Graphite starter's `.site-navbar.is-overlay` used to swallow.
  expect(css).not.toMatch(/\.site-header-nav\s*\{/)

  // The picker names the target both rules share, and offers the navbar's own
  // classes only — Bootstrap's shared navbar vocabulary is not a target.
  const targetOptions = await appWindow.evaluate(() => {
    const picker = document.querySelector(
      '.gstrap-sm-section[data-sp="navbar"] [data-selector-target="background-color"]')
    return { value: picker.value, options: [...picker.options].map(o => o.value) }
  })
  expect(targetOptions.value).toBe('.site-header-nav')
  expect(targetOptions.options).toEqual(['.site-header-nav'])

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

/**
 * Drive one swap chip through the colour picker, exactly as the swap-colours
 * test above does. Shared by the two cascade specs that follow.
 *
 * @param {import('@playwright/test').Page} appWindow
 * @param {string} chip - 'top' or 'scrolled'
 * @param {string} value - Colour to type into the picker's text field
 */
async function pickSwapColor(appWindow, chip, value) {
  await clickInPanel(appWindow, `[data-nav-color="${chip}"]`)
  await appWindow.waitForSelector('.gstrap-cp-popover', { timeout: 3_000 })
  await appWindow.evaluate(v => {
    const input = document.querySelector('.gstrap-cp-popover [data-cp-input]')
    input.value = v
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
  await appWindow.keyboard.press('Escape')
  await appWindow.waitForFunction(
    () => !document.querySelector('.gstrap-cp-popover'), null, { timeout: 3_000 })
}

/**
 * The canvas element's settled background colour. Both swap rules transition
 * `background-color` over 300ms, so a read taken straight after the write
 * returns the colour the bar is transitioning FROM — the assertion has to wait
 * for the value, not sample it once.
 *
 * @param {import('@playwright/test').Page} appWindow
 * @param {string} selector - CSS selector inside the canvas document
 * @param {string} expected - Computed colour to wait for, e.g. 'rgb(16, 24, 32)'
 */
const waitForCanvasBackground = (appWindow, selector, expected) =>
  appWindow.waitForFunction(({ sel, want }) => {
    const doc = window.__gstrap.pluginRegistry.bound.editor.Canvas.getFrameEl().contentDocument
    const el = doc.querySelector(sel)
    return !!el && doc.defaultView.getComputedStyle(el).backgroundColor === want
  }, { sel: selector, want: expected }, { timeout: 10_000 })

test('Navbar panel: the Top colour repaints a harvested navbar without editing its section chunk', async () => {
  // The harvested graphite-navbar ships `.gs-graphite-nav { background: … }`
  // inside its `gs-sec` chunk. The resting colour has to beat that shorthand
  // (a `background-color` merged INTO the chunk did, but only by rewriting
  // rules the section owns — re-inserting the section then fought the edit).
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-navswap-chunk-'))
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await openSeedProject(appWindow, join(projectDir, 'navchunk.gstrap'))

  await appWindow.evaluate(() => {
    document.querySelector('[data-lib-bundled-insert="graphite-navbar"]').click()
  })
  await appWindow.waitForFunction(() => {
    const doc = window.__gstrap.pluginRegistry.bound.editor.Canvas.getFrameEl()?.contentDocument
    return !!doc?.querySelector('nav.gs-graphite-nav')
  }, null, { timeout: 20_000 })

  // Select the nav itself — the same click a user makes on the bar.
  await appWindow.evaluate(() => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    const find = component => {
      if ((component.getClasses?.() || []).includes('gs-graphite-nav')) return component
      for (const child of component.components()) {
        const hit = find(child)
        if (hit) return hit
      }
      return null
    }
    editor.select(find(editor.getWrapper()))
  })
  await openNavbarSection(appWindow)
  await setFieldInPanel(appWindow, '[data-nav-scroll-mode]', 'swap')
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="navbar"] [data-nav-color="top"]', { timeout: 5_000 })

  await pickSwapColor(appWindow, 'top', '#101820')

  // The point of the whole fix: the bar the user is looking at changes colour.
  await waitForCanvasBackground(appWindow, 'nav.gs-graphite-nav', 'rgb(16, 24, 32)')

  const css = await appWindow.evaluate(() => window.__gstrap.projectState.current.globalCSS || '')
  // The section's own rule is byte-untouched — its shorthand is still there,
  // and the override is a rule of the user's own after the chunk.
  expect(css).toMatch(/\.gs-graphite-nav \{[^}]*background: rgba\(255, 255, 255, 0\.97\);/)
  expect(css).toMatch(/\.gs-graphite-nav:not\(\.gs-nav-scrolled\) \{\n {2}background-color: #101820;\n\}/)
  // The user's rule sits AFTER the chunk it overrides, which is the only
  // reason it wins — same specificity would lose the other way round.
  expect(css.indexOf('.gs-graphite-nav:not(.gs-nav-scrolled)'))
    .toBeGreaterThan(css.indexOf('/* gs-sec:graphite-navbar */'))

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Navbar panel: the Top colour outranks a two-class theme state rule', async () => {
  // The reported bug, end to end. The Graphite starter's index navbar wears
  // `is-overlay`, and the theme paints that state with
  // `.site-navbar.is-overlay { background: transparent }`. A resting colour on
  // the bare `.site-navbar` lost to it every time — the Scrolled colour worked,
  // because it is a two-class rule itself, which is exactly the asymmetry the
  // user saw.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-navswap-overlay-'))
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await createBundledStarterProject(appWindow, join(projectDir, 'overlay.gstrap'), { starterId: 'graphite' })
  await appWindow.waitForFunction(() => {
    const doc = window.__gstrap.pluginRegistry.bound.editor?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('nav.site-navbar.is-overlay')
  }, null, { timeout: 20_000 })

  expect(await selectFirstByTag(appWindow, 'nav')).toBe('nav')
  await openNavbarSection(appWindow)
  await setFieldInPanel(appWindow, '[data-nav-scroll-mode]', 'swap')
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="navbar"] [data-nav-color="top"]', { timeout: 5_000 })

  await pickSwapColor(appWindow, 'top', '#101820')
  await waitForCanvasBackground(appWindow, 'nav.site-navbar', 'rgb(16, 24, 32)')

  const css = await appWindow.evaluate(() => window.__gstrap.projectState.current.globalCSS || '')
  // The theme's own rule keeps its shipped declarations: the override is
  // additive, not a rewrite of somebody else's stylesheet.
  expect(css).toMatch(/\.site-navbar \{\n\t\tmin-height: var\(--navbar-height-solid\);/)
  expect(css).toMatch(/\.site-navbar:not\(\.gs-nav-scrolled\) \{\n {2}background-color: #101820;\n\}/)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
