/**
 * GrapeStrap — E2E: Style Manager Animation sub-panel
 *
 * PATH: tests/e2e/animation-panel.spec.js
 * ROLE: The panel side of the animation feature — that every control's setting
 *       reaches the SAVED PAGE as a `data-gs-anim*` attribute (the canvas DOM
 *       and the file on disk asserted separately, because the runtime only ever
 *       sees the latter), that enabling one delivers the behaviors runtime into
 *       the project, that each gesture is exactly one undo entry (including the
 *       multi-attribute "Remove all animation"), and — the assertion nothing
 *       else in the suite makes — that the Preview button's replay is PURELY
 *       transient: classes on and off the canvas element with no undo entry and
 *       no re-dirtied page behind it.
 * DEPENDS: @playwright/test, ./helpers.js,
 *          src/renderer/panels/style-manager/animation.js (the panel under test)
 * CREATED: 2026-08-18
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, fileExists } from './helpers.js'

// A plain band with a class of its own, so both the canvas assertions and the
// on-disk assertions have one unambiguous element to look at.
const SPEC_CLASS = 'gs-spec-anim'
const SPEC_HTML = `<section class="${SPEC_CLASS}"><p>Animate me</p></section>`

/** Seed the blank project's page with the spec element and select it. */
async function seedAndSelect(appWindow) {
  await appWindow.evaluate(html => {
    window.__gstrap.pluginRegistry.bound.editor.getWrapper().append(html)
  }, SPEC_HTML)

  const selected = await appWindow.evaluate(cls => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    function find(component) {
      if ((component.getClasses?.() || []).includes(cls)) return component
      for (const child of component.components()) {
        const found = find(child)
        if (found) return found
      }
      return null
    }
    const target = find(editor.getWrapper())
    if (!target) return false
    editor.select(target)
    return true
  }, SPEC_CLASS)
  expect(selected, 'seeded element was found and selected').toBe(true)
}

/** Open the Animation accordion section and wait for its body to render. */
async function openAnimationSection(appWindow) {
  await appWindow.evaluate(() => {
    const section = document.querySelector('.gstrap-sm-section[data-sp="animation"]')
    const body = section.querySelector('.gstrap-sm-body')
    if (body.hasAttribute('hidden')) section.querySelector('[data-toggle="animation"]').click()
  })
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="animation"] .gstrap-sm-body:not([hidden])', { timeout: 5_000 })
}

const panelBody = '.gstrap-sm-section[data-sp="animation"] .gstrap-sm-body'

/** Click a control inside the Animation sub-panel body. */
const clickInPanel = (appWindow, selector) => appWindow.evaluate(({ body, sel }) => {
  document.querySelector(body).querySelector(sel).click()
}, { body: panelBody, sel: selector })

/** Set a select/range inside the panel and fire the commit event it listens for. */
const setFieldInPanel = (appWindow, selector, value) => appWindow.evaluate(({ body, sel, val }) => {
  const field = document.querySelector(body).querySelector(sel)
  field.value = val
  field.dispatchEvent(new Event('change', { bubbles: true }))
}, { body: panelBody, sel: selector, val: value })

/**
 * Wait until the spec element IN THE CANVAS DOCUMENT matches an attribute
 * expectation. The canvas DOM — not the component model — is what GrapesJS
 * serializes from and what the behaviors runtime reads on the exported page, so
 * that is where these assertions look. `null` asserts the attribute is gone.
 */
const waitForCanvasAttribute = (appWindow, name, value) => appWindow.waitForFunction(({ cls, n, v }) => {
  const doc = window.__gstrap.pluginRegistry.bound.editor.Canvas.getFrameEl().contentDocument
  const element = doc.querySelector('.' + cls)
  if (!element) return false
  return v === null ? !element.hasAttribute(n) : element.getAttribute(n) === v
}, { cls: SPEC_CLASS, n: name, v: value }, { timeout: 10_000 })

/** Every attribute currently on the spec element in the canvas, as a plain map. */
const canvasAttributes = appWindow => appWindow.evaluate(cls => {
  const doc = window.__gstrap.pluginRegistry.bound.editor.Canvas.getFrameEl().contentDocument
  const element = doc.querySelector('.' + cls)
  if (!element) return null
  return Object.fromEntries([...element.attributes].map(a => [a.name, a.value]))
}, SPEC_CLASS)

/**
 * Save through the real Ctrl+S command, and wait for it to finish.
 *
 * Not `window.grapestrap.project.save()` directly: that writes whatever
 * projectState is holding, and the canvas is only captured into projectState by
 * cmdSave's `flushActiveTabIntoProject()` — so the direct call writes the page
 * as it was BEFORE anything in this file edited it. Going through the command
 * is also what clears the dirty flags the preview test measures against.
 */
const saveProject = appWindow => appWindow.evaluate(() => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('file:save produced no project:saved event')), 15_000)
  window.__gstrap.eventBus.once('project:saved', () => { clearTimeout(timer); resolve() })
  window.__gstrap.eventBus.emit('command', 'file:save')
}))

const readSavedPage = projectDir => fsp.readFile(join(projectDir, 'site', 'pages', 'index.html'), 'utf8')

// Braces, not an expression body: UndoManager.undo() hands back the manager
// itself, which Playwright cannot serialize across the bridge.
const undoOnce = appWindow => appWindow.evaluate(() => {
  window.__gstrap.pluginRegistry.bound.editor.UndoManager.undo()
})

test('Animation panel: reveal attribute reaches canvas and disk, delivers the runtime, and undoes in one step', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-anim-'))
  const projectPath = join(projectDir, 'anim.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedAndSelect(appWindow)
  await openAnimationSection(appWindow)

  // ── 1. Every group is on screen for an ordinary element ───────────────────
  // Unlike the Navbar panel there is no context to resolve: any selection can
  // be animated, so the controls are always the real ones.
  const controls = await appWindow.evaluate(body => {
    const host = document.querySelector(body)
    return {
      hasEffect: !!host.querySelector('[data-anim-effect]'),
      hasHover: !!host.querySelector('[data-anim-hover]'),
      hasLoop: !!host.querySelector('[data-anim-loop]'),
      // Nothing is switched on yet, so the reveal's timing controls have
      // nothing to govern and stay out of the way — as do both actions.
      hasTrigger: !!host.querySelector('[data-anim-trigger]'),
      hasDuration: !!host.querySelector('[data-anim-duration]'),
      previewDisabled: host.querySelector('[data-anim-preview]').disabled,
      clearDisabled: host.querySelector('[data-anim-clear]').disabled
    }
  }, panelBody)
  expect(controls.hasEffect).toBe(true)
  expect(controls.hasHover).toBe(true)
  expect(controls.hasLoop).toBe(true)
  expect(controls.hasTrigger).toBe(false)
  expect(controls.hasDuration).toBe(false)
  expect(controls.previewDisabled).toBe(true)
  expect(controls.clearDisabled).toBe(true)

  // ── 2. Choosing an effect writes the attribute AND delivers the runtime ───
  await setFieldInPanel(appWindow, '[data-anim-effect]', 'fade-up')
  await waitForCanvasAttribute(appWindow, 'data-gs-anim', 'fade-up')

  // ensureBehaviors() is awaited BEFORE the attribute is written, so the
  // attribute showing up means the copy already finished — no polling needed.
  expect(await fileExists(join(projectDir, 'site', 'assets', 'js', 'gstrap-behaviors.js'))).toBe(true)
  expect(await fileExists(join(projectDir, 'site', 'assets', 'css', 'gstrap-behaviors.css'))).toBe(true)

  // ── 3. Timing: written when it differs, ABSENT at the runtime's own default ─
  await appWindow.waitForSelector(`${panelBody} [data-anim-duration]`, { timeout: 5_000 })
  await setFieldInPanel(appWindow, '[data-anim-duration]', '1200')
  await waitForCanvasAttribute(appWindow, 'data-gs-anim-duration', '1200')

  // Back to 600 (what the stylesheet already falls back to) — an attribute
  // restating a default is noise in the saved page, so the gesture REMOVES it.
  await setFieldInPanel(appWindow, '[data-anim-duration]', '600')
  await waitForCanvasAttribute(appWindow, 'data-gs-anim-duration', null)

  // Delay behaves the same way around its own default of 0.
  await setFieldInPanel(appWindow, '[data-anim-delay]', '300')
  await waitForCanvasAttribute(appWindow, 'data-gs-anim-delay', '300')

  // ── 4. Trigger + repeat: the defaults are stored as ABSENCE ───────────────
  await clickInPanel(appWindow, '[data-anim-trigger="load"]')
  await waitForCanvasAttribute(appWindow, 'data-gs-anim-trigger', 'load')
  await clickInPanel(appWindow, '[data-anim-trigger="scroll"]')
  await waitForCanvasAttribute(appWindow, 'data-gs-anim-trigger', null)

  // "Animate once" OFF is the only half of that pair with anything to store,
  // and the runtime tests for the exact string "0".
  await clickInPanel(appWindow, '[data-anim-once="off"]')
  await waitForCanvasAttribute(appWindow, 'data-gs-anim-once', '0')

  // ── 5. The saved page on disk carries what the runtime will read ──────────
  await saveProject(appWindow)

  const manifest = JSON.parse(await fsp.readFile(projectPath, 'utf8'))
  expect(manifest.behaviors).toBeTruthy()

  const pageOnDisk = await readSavedPage(projectDir)
  expect(pageOnDisk).toContain('data-gs-anim="fade-up"')
  expect(pageOnDisk).toContain('data-gs-anim-delay="300"')
  expect(pageOnDisk).toContain('data-gs-anim-once="0"')
  // The runtime's own classes are never authored — the page ships visible and
  // JS-free-safe, and only the visitor's runtime ever hides anything.
  expect(pageOnDisk).not.toContain('gs-anim-pending')
  expect(pageOnDisk).not.toContain('gs-anim-in')
  // The behaviors pair is linked from the page, not loaded from anywhere else.
  expect(pageOnDisk).toContain('data-grpstr-fw="gsb-js"')

  // ── 6. One gesture, one undo ──────────────────────────────────────────────
  // Switching "Animate once" off was a single attribute write, so exactly one
  // undo takes it back — and takes nothing else with it.
  await undoOnce(appWindow)
  await waitForCanvasAttribute(appWindow, 'data-gs-anim-once', null)
  const afterUndo = await canvasAttributes(appWindow)
  expect(afterUndo['data-gs-anim']).toBe('fade-up')
  expect(afterUndo['data-gs-anim-delay']).toBe('300')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Animation panel: hover and loop presets, then Remove all animation in ONE undo step', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-anim-clear-'))
  const projectPath = join(projectDir, 'animclear.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedAndSelect(appWindow)
  await openAnimationSection(appWindow)

  // ── 1. Hover: one attribute, no runtime JS involved at all ────────────────
  await setFieldInPanel(appWindow, '[data-anim-hover]', 'lift')
  await waitForCanvasAttribute(appWindow, 'data-gs-anim-hover', 'lift')
  const hoverHint = await appWindow.evaluate(body => document.querySelector(body).textContent, panelBody)
  expect(hoverHint).toContain('Hover effects are pure CSS')

  // ── 2. Loop: the preset, and its speed as a second attribute ──────────────
  await setFieldInPanel(appWindow, '[data-anim-loop]', 'marquee')
  await waitForCanvasAttribute(appWindow, 'data-gs-anim-loop', 'marquee')

  // Normal is what every preset already runs at, so only slow/fast are stored.
  await appWindow.waitForSelector(`${panelBody} [data-anim-speed="slow"]`, { timeout: 5_000 })
  await clickInPanel(appWindow, '[data-anim-speed="slow"]')
  await waitForCanvasAttribute(appWindow, 'data-gs-anim-loop-speed', 'slow')

  // Marquee is the one preset whose markup does not explain itself — the
  // runtime duplicates the contents, and the panel says so.
  const marqueeHint = await appWindow.evaluate(body => document.querySelector(body).textContent, panelBody)
  expect(marqueeHint).toContain('Marquee copies this element\'s contents once')

  // ── 3. A reveal on top, so the clear has all three families to remove ─────
  await setFieldInPanel(appWindow, '[data-anim-effect]', 'zoom-in')
  await waitForCanvasAttribute(appWindow, 'data-gs-anim', 'zoom-in')

  const beforeClear = await canvasAttributes(appWindow)
  const animBefore = Object.keys(beforeClear).filter(name => name.startsWith('data-gs-anim'))
  expect(animBefore.sort()).toEqual([
    'data-gs-anim', 'data-gs-anim-hover', 'data-gs-anim-loop', 'data-gs-anim-loop-speed'
  ])

  // ── 4. Remove all animation: four attributes, ONE undo entry ──────────────
  await clickInPanel(appWindow, '[data-anim-clear]')
  await waitForCanvasAttribute(appWindow, 'data-gs-anim', null)
  const afterClear = await canvasAttributes(appWindow)
  expect(Object.keys(afterClear).filter(name => name.startsWith('data-gs-anim'))).toEqual([])
  // The element's own identity survived the sweep untouched.
  expect(afterClear.class).toContain(SPEC_CLASS)

  // The button that removed everything is now the button with nothing to do.
  await appWindow.waitForFunction(
    body => document.querySelector(body).querySelector('[data-anim-clear]').disabled,
    panelBody, { timeout: 5_000 })

  // The whole clear is a single removeAttributes call, so one Ctrl+Z brings
  // back all four attributes — not one attribute at a time.
  await undoOnce(appWindow)
  await waitForCanvasAttribute(appWindow, 'data-gs-anim', 'zoom-in')
  const afterUndo = await canvasAttributes(appWindow)
  expect(Object.keys(afterUndo).filter(name => name.startsWith('data-gs-anim')).sort()).toEqual([
    'data-gs-anim', 'data-gs-anim-hover', 'data-gs-anim-loop', 'data-gs-anim-loop-speed'
  ])

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Animation panel: Preview replays on the canvas and leaves nothing behind', async () => {
  // The reveal's start state is runtime-owned, so the editor has to fake the
  // runtime's choreography to show it. That replay is the one thing in the
  // panel that touches the canvas WITHOUT touching the document: the classes
  // and custom properties it adds must come back off, must never reach the undo
  // stack, and must never re-dirty a saved page.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-anim-preview-'))
  const projectPath = join(projectDir, 'animpreview.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedAndSelect(appWindow)
  await openAnimationSection(appWindow)

  // A long reveal so the replay's window is comfortably observable; the panel
  // caps the slider at 2000ms for exactly the reason it is the maximum here.
  await setFieldInPanel(appWindow, '[data-anim-effect]', 'fade-up')
  await waitForCanvasAttribute(appWindow, 'data-gs-anim', 'fade-up')

  // Choosing an effect auto-fires a replay of its own — proof in passing that
  // the auto-fire works, and the reason this test then explicitly waits it out.
  await appWindow.waitForFunction(cls => {
    const doc = window.__gstrap.pluginRegistry.bound.editor.Canvas.getFrameEl().contentDocument
    return !!doc.querySelector('.' + cls)?.classList.contains('gs-anim-in')
  }, SPEC_CLASS, { timeout: 5_000 })

  await appWindow.waitForSelector(`${panelBody} [data-anim-duration]`, { timeout: 5_000 })
  await setFieldInPanel(appWindow, '[data-anim-duration]', '2000')
  await waitForCanvasAttribute(appWindow, 'data-gs-anim-duration', '2000')

  // Choosing the effect auto-fires a replay of its own — let that one finish so
  // this test measures the button, not the leftovers of an earlier preview.
  await waitForPreviewIdle(appWindow)

  // Baseline AFTER a save: the page is clean, and the undo stack is whatever
  // the edits above left it at.
  await saveProject(appWindow)
  const baseline = await appWindow.evaluate(() => ({
    undoDepth: window.__gstrap.pluginRegistry.bound.editor.UndoManager.getStack().length,
    dirtyPages: [...window.__gstrap.projectState.dirtyPages]
  }))
  expect(baseline.dirtyPages).toEqual([])
  expect(baseline.undoDepth).toBeGreaterThan(0)

  // ── The replay: both runtime classes on, together, mid-transition ─────────
  await clickInPanel(appWindow, '[data-anim-preview]')
  await appWindow.waitForFunction(cls => {
    const doc = window.__gstrap.pluginRegistry.bound.editor.Canvas.getFrameEl().contentDocument
    const element = doc.querySelector('.' + cls)
    // Both at once is the runtime's own choreography: gs-anim-pending holds the
    // hidden start state and gs-anim-in carries the transition out of it — the
    // runtime never removes the first when it adds the second, and nor does the
    // preview (gstrap-behaviors.css#onRevealChange).
    return !!element &&
      element.classList.contains('gs-anim-pending') &&
      element.classList.contains('gs-anim-in')
  }, SPEC_CLASS, { timeout: 5_000 })

  // The timing the replay runs at comes from the element's own attributes, and
  // the canvas really honours it.
  const duringPreview = await appWindow.evaluate(cls => {
    const doc = window.__gstrap.pluginRegistry.bound.editor.Canvas.getFrameEl().contentDocument
    const element = doc.querySelector('.' + cls)
    const computed = doc.defaultView.getComputedStyle(element)
    return {
      duration: element.style.getPropertyValue('--gs-anim-duration'),
      delay: element.style.getPropertyValue('--gs-anim-delay'),
      transitionDuration: computed.transitionDuration,
      opacity: Number(computed.opacity)
    }
  }, SPEC_CLASS)
  expect(duringPreview.duration).toBe('2000ms')
  expect(duringPreview.delay).toBe('0ms')

  // The decisive proof that this is a real reveal and not two classes worn for
  // 2.2s: the behaviors stylesheet IS injected into the canvas (C-WP1), the
  // `[data-gs-anim].gs-anim-in` rule matched, and it read the replay's custom
  // property — so the canvas is running the same transition a visitor gets.
  // The opacity check is the other half: `gs-anim-pending` really applied the
  // hidden start state, and the element is on its way out of it. (Sampled a few
  // ms into a 2000ms reveal — a 40× margin over the round trip.)
  expect(duringPreview.transitionDuration).toContain('2s')
  expect(duringPreview.opacity).toBeLessThan(1)

  // ── …and off again, with both custom properties, inside the deadline ──────
  await waitForPreviewIdle(appWindow)
  const afterPreview = await appWindow.evaluate(cls => {
    const doc = window.__gstrap.pluginRegistry.bound.editor.Canvas.getFrameEl().contentDocument
    const element = doc.querySelector('.' + cls)
    return {
      classes: [...element.classList],
      styleAttribute: element.getAttribute('style'),
      undoDepth: window.__gstrap.pluginRegistry.bound.editor.UndoManager.getStack().length,
      dirtyPages: [...window.__gstrap.projectState.dirtyPages]
    }
  }, SPEC_CLASS)

  // `gjs-selected` is GrapesJS's own selection marker and is none of this
  // panel's business — what must be gone is every class the replay added.
  expect(afterPreview.classes).toContain(SPEC_CLASS)
  expect(afterPreview.classes.filter(name => name.startsWith('gs-anim'))).toEqual([])
  // removeProperty on the last custom property leaves an empty style attribute
  // at worst — what must not survive is a value.
  expect(afterPreview.styleAttribute || '').not.toContain('--gs-anim')

  // The two assertions the whole "transient DOM only" contract rests on.
  expect(afterPreview.undoDepth).toBe(baseline.undoDepth)
  expect(afterPreview.dirtyPages).toEqual([])

  // And the page written after a replay is byte-identical to the one written
  // before it — nothing about the replay is serializable.
  const beforeBytes = await readSavedPage(projectDir)
  await saveProject(appWindow)
  expect(await readSavedPage(projectDir)).toBe(beforeBytes)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

/**
 * Wait until no replay is running on the spec element.
 *
 * Both exits are covered: transitionend when the reveal really animates in the
 * canvas, and the panel's duration+delay+200ms deadline when it cannot (no
 * behaviors stylesheet, a hidden ancestor, reduced motion). 8s is generous
 * against the 2200ms worst case this file sets up.
 */
function waitForPreviewIdle(appWindow) {
  return appWindow.waitForFunction(cls => {
    const doc = window.__gstrap.pluginRegistry.bound.editor.Canvas.getFrameEl().contentDocument
    const element = doc.querySelector('.' + cls)
    return !!element &&
      !element.classList.contains('gs-anim-pending') &&
      !element.classList.contains('gs-anim-in')
  }, SPEC_CLASS, { timeout: 8_000 })
}
