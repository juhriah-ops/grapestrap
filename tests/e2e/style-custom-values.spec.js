/**
 * GrapeStrap — E2E: Style Manager free-value affordances
 *
 * PATH: tests/e2e/style-custom-values.spec.js
 * ROLE: The two surfaces that escape Bootstrap's fixed vocabulary — the
 *       Custom colour chip (Background / Text / Border) and the Opacity
 *       slider (Display). Both store their value as a real declaration on the
 *       component's rule in project style.css, and both are mutually
 *       exclusive with the predetermined class they shadow.
 *       Third spec covers the colour picker's visual selector — spectrum, hue
 *       strip and R/G/B fields — which all emit live into the same rule.
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-08-17
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag } from './helpers.js'

// Read the body of the `.cta-link { … }` rule out of globalCSS. Asserting on
// the whole sheet would collide with the starter theme, which carries plenty
// of background-color and opacity declarations of its own. The boundary set
// mirrors SELECTOR_BOUNDARY in css-rule-utils.js — a fresh project's stylesheet
// opens with a `/* … */` header comment, so `*/` has to count as one.
async function readCtaRule(appWindow) {
  const css = await appWindow.evaluate(() => window.__gstrap.projectState.current.globalCSS || '')
  return css.match(/(?:^|[};]|\*\/)\s*\.cta-link\s*\{([^}]*)\}/)?.[1] || ''
}

const readClasses = appWindow => appWindow.evaluate(() =>
  window.__gstrap.pluginRegistry.bound.editor.getSelected().getClasses()
)

const openSection = (appWindow, id) => appWindow.evaluate(sp => {
  const toggle = document.querySelector(`.gstrap-sm-section[data-sp="${sp}"] [data-toggle="${sp}"]`)
  if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click()
}, id)

const clickInSection = (appWindow, id, selector) => appWindow.evaluate(({ sp, sel }) => {
  const body = document.querySelector(`.gstrap-sm-section[data-sp="${sp}"] .gstrap-sm-body`)
  body.querySelector(sel).click()
}, { sp: id, sel: selector })

test('Style Manager: custom colour chip and opacity slider write free values to project CSS', async () => {
  // Verifies, end to end:
  //   1. With no custom class/id there is no chip — the "needs a selector"
  //      hint stands in, same contract as the Background image row.
  //   2. Picking a free colour through the popover's text input writes
  //      `background-color` onto `.cta-link` in globalCSS, evicts the BS
  //      `bg-*` class, and repaints the element in the canvas.
  //   3. An opacity STEP pill writes the BS class and erases the rule's
  //      `opacity`; the SLIDER does the reverse. Exclusion runs both ways.
  //   4. Clicking a predetermined swatch removes the custom property while
  //      leaving the rest of the rule (the opacity we set) intact.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-smfree-'))
  const projectPath = join(projectDir, 'free.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  // ── 1. No usable selector yet → hint instead of the chip ──────────────────
  await openSection(appWindow, 'background')
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="background"] .gstrap-sm-body:not([hidden])', { timeout: 5_000 })

  const noSelectorState = await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="background"] .gstrap-sm-body')
    return {
      hasChip: !!body.querySelector('[data-custom-color-chip]'),
      text: body.textContent
    }
  })
  expect(noSelectorState.hasChip).toBe(false)
  expect(noSelectorState.text).toContain('custom values need a target selector')

  // Give the element a class we can scope a rule to.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const sel = ed.getSelected()
    sel.setClass([...(sel.getClasses() || []), 'cta-link'])
  })
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="background"] [data-custom-color-chip]', { timeout: 5_000 })

  // ── 2. Predetermined first, then a free colour that must evict it ─────────
  await clickInSection(appWindow, 'background', '[data-color="danger"]')
  expect(await readClasses(appWindow)).toContain('bg-danger')

  await clickInSection(appWindow, 'background', '[data-custom-color-chip]')
  await appWindow.waitForSelector('.gstrap-cp-popover', { timeout: 2_000 })

  // Type a value the BS palette does not offer.
  await appWindow.evaluate(() => {
    const input = document.querySelector('.gstrap-cp-popover [data-cp-input]')
    input.value = '#ff0066'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await appWindow.keyboard.press('Escape')
  await appWindow.waitForFunction(
    () => !document.querySelector('.gstrap-cp-popover'), null, { timeout: 2_000 })

  expect(await readCtaRule(appWindow)).toMatch(/background-color:\s*#ff0066/)
  // Mutual exclusion: the utility class is gone, so only the rule applies.
  expect(await readClasses(appWindow)).not.toContain('bg-danger')

  // The canvas repaints from the injected globalCSS — this is the live preview.
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const el = doc.querySelector('.cta-link')
    return !!el && getComputedStyle(el).backgroundColor === 'rgb(255, 0, 102)'
  }, null, { timeout: 5_000 })

  // The chip re-renders showing the value it now holds.
  const chipLabel = await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="background"] .gstrap-sm-body')
    return body.querySelector('[data-custom-color-chip]').textContent.trim()
  })
  expect(chipLabel).toBe('#ff0066')

  // ── 3a. Opacity STEP pill → BS class, no rule declaration ────────────────
  await openSection(appWindow, 'display')
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="display"] [data-opacity-slider]', { timeout: 5_000 })

  await clickInSection(appWindow, 'display', '[data-opacity="50"]')
  expect(await readClasses(appWindow)).toContain('opacity-50')
  expect(await readCtaRule(appWindow)).not.toMatch(/(^|;)\s*opacity:/)

  // The slider seeds itself from the active pill when the rule is silent.
  const seededFromPill = await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="display"] .gstrap-sm-body')
    return body.querySelector('[data-opacity-slider]').value
  })
  expect(seededFromPill).toBe('50')

  // ── 3b. SLIDER → rule declaration, BS class evicted ──────────────────────
  await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="display"] .gstrap-sm-body')
    const slider = body.querySelector('[data-opacity-slider]')
    slider.value = '40'
    // Readout follows 'input'; the stylesheet write only happens on 'change'.
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    slider.dispatchEvent(new Event('change', { bubbles: true }))
  })

  expect(await readCtaRule(appWindow)).toMatch(/opacity:\s*0\.4\b/)
  expect(await readClasses(appWindow)).not.toContain('opacity-50')

  const sliderState = await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="display"] .gstrap-sm-body')
    return {
      value: body.querySelector('[data-opacity-slider]').value,
      readout: body.querySelector('[data-opacity-readout]').textContent
    }
  })
  expect(sliderState.value).toBe('40')
  expect(sliderState.readout).toBe('40%')

  // ── 4. Predetermined swatch removes the custom colour, keeps the rest ────
  await clickInSection(appWindow, 'background', '[data-color="primary"]')
  expect(await readClasses(appWindow)).toContain('bg-primary')

  const finalRule = await readCtaRule(appWindow)
  expect(finalRule).not.toMatch(/background-color/)
  // The opacity we set through the slider shares this rule and must survive.
  expect(finalRule).toMatch(/opacity:\s*0\.4\b/)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Style Manager: Text and Border custom colours own their own property in one rule', async () => {
  // Both panels write into the SAME `.cta-link` rule as Background. The
  // merge discipline is what keeps them from overwriting each other, so the
  // spec sets all three and then clears one.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-smfree2-'))
  const projectPath = join(projectDir, 'free2.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const sel = ed.getSelected()
    sel.setClass([...(sel.getClasses() || []), 'cta-link'])
  })

  // Set a free colour through each panel in turn.
  for (const [section, value] of [['text', '#3fb950'], ['border', '#123456']]) {
    await openSection(appWindow, section)
    await appWindow.waitForSelector(
      `.gstrap-sm-section[data-sp="${section}"] [data-custom-color-chip]`, { timeout: 5_000 })
    await clickInSection(appWindow, section, '[data-custom-color-chip]')
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

  let rule = await readCtaRule(appWindow)
  expect(rule).toMatch(/(^|;)\s*color:\s*#3fb950/)
  expect(rule).toMatch(/border-color:\s*#123456/)

  // The Custom row's own Clear drops one property, not the whole rule.
  await clickInSection(appWindow, 'text', '[data-custom-color-clear]')
  rule = await readCtaRule(appWindow)
  expect(rule).not.toMatch(/(^|;)\s*color:\s*#3fb950/)
  expect(rule).toMatch(/border-color:\s*#123456/)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// Read the picker's own fields — hex box plus the three channel inputs — in
// one hop, so every assertion below compares a single consistent snapshot.
const readPickerFields = appWindow => appWindow.evaluate(() => {
  const popover = document.querySelector('.gstrap-cp-popover')
  const channel = key => popover.querySelector(`[data-cp-channel="${key}"]`).value
  return {
    hex: popover.querySelector('[data-cp-input]').value,
    r: channel('r'),
    g: channel('g'),
    b: channel('b')
  }
})

// Drive one of the two drag surfaces at a fractional position. Ratios outside
// 0–1 are deliberately reachable — that is how the clamp gets exercised.
const dragPicker = (appWindow, surface, steps) => appWindow.evaluate(({ sel, moves }) => {
  const target = document.querySelector(sel)
  const rect = target.getBoundingClientRect()
  const at = (type, ratioX, ratioY) => target.dispatchEvent(new PointerEvent(type, {
    pointerId: 1,
    bubbles: true,
    cancelable: true,
    clientX: rect.left + rect.width * ratioX,
    clientY: rect.top + rect.height * ratioY
  }))
  for (const [type, ratioX, ratioY] of moves) at(type, ratioX, ratioY)
}, { sel: surface, moves: steps })

test('Colour picker: spectrum, hue strip and R/G/B fields drive the hex box and the live rule', async () => {
  // The user's complaint about the first cut was that it was "an eyedropper
  // colour matcher", not a colour selector. Verifies the selector that
  // replaced it:
  //   1. Opening on an unset chip leaves the numeric fields BLANK — never
  //      NaN, never a bogus 0/0/0 the user could commit by accident.
  //   2. Typing R/G/B produces the hex, and only once all three read as
  //      numbers — a half-filled trio is not a colour.
  //   3. Dragging the hue strip moves the colour around the wheel and writes
  //      the rule live, with the popover still open.
  //   4. Dragging the spectrum past its corner clamps to pure hue (#00ffff at
  //      180°) instead of running off the scale.
  //   5. Pointer events after release are ignored — the drag really ends.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-cpvis-'))
  const projectPath = join(projectDir, 'visual.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const sel = ed.getSelected()
    sel.setClass([...(sel.getClasses() || []), 'cta-link'])
  })

  await openSection(appWindow, 'background')
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="background"] [data-custom-color-chip]', { timeout: 5_000 })
  await clickInSection(appWindow, 'background', '[data-custom-color-chip]')
  await appWindow.waitForSelector('.gstrap-cp-popover [data-cp-spectrum]', { timeout: 2_000 })

  // ── 1. The visual controls exist, and start blank rather than at zero ─────
  const openState = await appWindow.evaluate(() => {
    const popover = document.querySelector('.gstrap-cp-popover')
    return {
      hasSpectrum: !!popover.querySelector('[data-cp-spectrum]'),
      hasSpectrumThumb: !!popover.querySelector('[data-cp-spectrum-thumb]'),
      hasHue: !!popover.querySelector('[data-cp-hue]'),
      hasHueThumb: !!popover.querySelector('[data-cp-hue-thumb]'),
      channelCount: popover.querySelectorAll('[data-cp-channel]').length,
      // Palette and eyedropper stay — the selector was added around them,
      // it did not replace them.
      swatchCount: popover.querySelectorAll('[data-cp-pick]').length,
      hasEyedropper: !!popover.querySelector('[data-cp-eyedrop]')
    }
  })
  expect(openState.hasSpectrum).toBe(true)
  expect(openState.hasSpectrumThumb).toBe(true)
  expect(openState.hasHue).toBe(true)
  expect(openState.hasHueThumb).toBe(true)
  expect(openState.channelCount).toBe(3)
  expect(openState.swatchCount).toBeGreaterThan(0)
  expect(openState.hasEyedropper).toBe(true)

  expect(await readPickerFields(appWindow)).toEqual({ hex: '', r: '', g: '', b: '' })

  // The popover grew ~180px taller when it gained the spectrum, which is
  // enough to push the palette and the action buttons off the bottom of the
  // window when the trigger sits low in a scrolled panel. It must stay inside
  // the viewport whichever way it flipped.
  const box = await appWindow.evaluate(() => {
    const rect = document.querySelector('.gstrap-cp-popover').getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom, viewport: window.innerHeight }
  })
  expect(box.top).toBeGreaterThanOrEqual(0)
  expect(box.bottom).toBeLessThanOrEqual(box.viewport)

  // ── 2. R/G/B → hex + rule, emitted only when the trio is complete ─────────
  const setChannel = (key, value) => appWindow.evaluate(({ k, v }) => {
    const field = document.querySelector(`.gstrap-cp-popover [data-cp-channel="${k}"]`)
    field.value = v
    field.dispatchEvent(new Event('input', { bubbles: true }))
  }, { k: key, v: value })

  await setChannel('r', '18')
  await setChannel('g', '52')
  // Two of three filled: nothing has been emitted yet.
  expect(await readCtaRule(appWindow)).not.toMatch(/background-color/)

  await setChannel('b', '86')
  expect(await readPickerFields(appWindow)).toEqual({ hex: '#123456', r: '18', g: '52', b: '86' })
  expect(await readCtaRule(appWindow)).toMatch(/background-color:\s*#123456/)

  // ── 3. Hue drag → new colour, written live with the popover still open ───
  // Press at a quarter across, drag to the middle (180° — the cyan region),
  // release. Saturation and brightness ride along from #123456.
  await dragPicker(appWindow, '.gstrap-cp-popover [data-cp-hue]', [
    ['pointerdown', 0.25, 0.5],
    ['pointermove', 0.50, 0.5],
    ['pointerup',   0.50, 0.5]
  ])

  const afterHue = await readPickerFields(appWindow)
  expect(afterHue.hex).toMatch(/^#[0-9a-f]{6}$/)
  expect(afterHue.hex).not.toBe('#123456')
  // 180° is cyan: green and blue both above red.
  expect(Number(afterHue.g)).toBeGreaterThan(Number(afterHue.r))
  expect(Number(afterHue.b)).toBeGreaterThan(Number(afterHue.r))
  // The rule follows the drag without any commit — this is the live preview.
  expect(await readCtaRule(appWindow)).toMatch(
    new RegExp(`background-color:\\s*${afterHue.hex}`))
  expect(await appWindow.locator('.gstrap-cp-popover').count()).toBe(1)

  // ── 4. Spectrum drag past the top-right corner clamps to pure hue ────────
  await dragPicker(appWindow, '.gstrap-cp-popover [data-cp-spectrum]', [
    ['pointerdown', 0.2, 0.8],
    ['pointermove', 1.6, -0.6],   // beyond the box on both axes
    ['pointerup',   1.6, -0.6]
  ])

  const afterSpectrum = await readPickerFields(appWindow)
  expect(afterSpectrum).toEqual({ hex: '#00ffff', r: '0', g: '255', b: '255' })
  expect(await readCtaRule(appWindow)).toMatch(/background-color:\s*#00ffff/)

  // The canvas repaints from the injected globalCSS — the point of emitting live.
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const el = doc.querySelector('.cta-link')
    return !!el && getComputedStyle(el).backgroundColor === 'rgb(0, 255, 255)'
  }, null, { timeout: 5_000 })

  // ── 5. A stray move after release must not repaint ───────────────────────
  await dragPicker(appWindow, '.gstrap-cp-popover [data-cp-spectrum]', [
    ['pointermove', 0.1, 0.9]
  ])
  expect((await readPickerFields(appWindow)).hex).toBe('#00ffff')

  // Esc dismisses; the last live value stays written.
  await appWindow.keyboard.press('Escape')
  await appWindow.waitForFunction(
    () => !document.querySelector('.gstrap-cp-popover'), null, { timeout: 2_000 })
  expect(await readCtaRule(appWindow)).toMatch(/background-color:\s*#00ffff/)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
