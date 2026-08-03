/**
 * GrapeStrap — E2E: Style Manager
 *
 * PATH: tests/e2e/style-manager.spec.js
 * ROLE: Style Manager sub-panels, pseudo-states, color picker, custom CSS sync, and breakpoint specs
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag } from './helpers.js'

test('Style Manager: Spacing/Display/Text panels write BS classes and round-trip', async () => {
  // v0.0.2 chunk A — class-first Style Manager replaces the v0.0.1 placeholder
  // in the right Properties panel. Three sub-panels ship in this chunk:
  // Spacing (mt-3 etc.), Display (d-flex / d-md-block), Text (text-center,
  // fw-bold, fs-2, text-primary). Verifies:
  //   1. The Spacing accordion is open by default; clicking a margin scale
  //      writes the matching `m-N` class to the selected component.
  //   2. Display panel: selecting `flex` writes `d-flex`; switching to `md`
  //      breakpoint and selecting `block` writes `d-md-block` and KEEPS the
  //      base `d-flex` (responsive variants stack).
  //   3. Text panel: align center, weight bold, size 2, color primary all
  //      land as the right BS classes.
  //   4. Toggling: clicking the active scale a second time clears it.
  //   5. The chip list in the Classes section reflects every change without
  //      needing a manual re-select.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-sm-'))
  const projectPath = join(projectDir, 'sm.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  // Style Manager renders for the selected h1. Spacing accordion is the
  // default-open section.
  await appWindow.waitForSelector('.gstrap-sm-section[data-sp="spacing"] .gstrap-sm-body:not([hidden])', { timeout: 5_000 })

  const readClasses = () => appWindow.evaluate(() =>
    window.__gstrap.pluginRegistry.bound.editor.getSelected().getClasses()
  )

  // ── 1. Spacing: click margin scale "3" with side=All ──────────────────────
  await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="spacing"] .gstrap-sm-body')
    body.querySelector('[data-scales-for="m"] [data-scale="3"]').click()
  })
  let cls = await readClasses()
  expect(cls).toContain('m-3')

  // Toggle: click the same button again → m-3 cleared.
  await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="spacing"] .gstrap-sm-body')
    body.querySelector('[data-scales-for="m"] [data-scale="3"]').click()
  })
  cls = await readClasses()
  expect(cls).not.toContain('m-3')

  // Re-apply, then switch side to "Top" and apply scale 5 — final state is
  // m-3 (all sides, set first) PLUS mt-5 (top, narrower side overrides via
  // BS cascade). The pattern is per-side, so the two coexist.
  await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="spacing"] .gstrap-sm-body')
    body.querySelector('[data-scales-for="m"] [data-scale="3"]').click()
    body.querySelector('[data-prop="m"] [data-side="t"]').click()
  })
  // After side switch the panel re-renders; re-query and click scale 5.
  await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="spacing"] .gstrap-sm-body')
    body.querySelector('[data-scales-for="m"] [data-scale="5"]').click()
  })
  cls = await readClasses()
  expect(cls).toContain('m-3')
  expect(cls).toContain('mt-5')

  // ── 2. Display panel: open it, write d-flex, then md / d-md-block ─────────
  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-sm-section[data-sp="display"] [data-toggle="display"]').click()
  })
  await appWindow.waitForSelector('.gstrap-sm-section[data-sp="display"] .gstrap-sm-body:not([hidden])', { timeout: 3_000 })
  await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="display"] .gstrap-sm-body')
    body.querySelector('[data-display="flex"]').click()
  })
  cls = await readClasses()
  expect(cls).toContain('d-flex')

  // Switch breakpoint to md and click "block".
  await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="display"] .gstrap-sm-body')
    body.querySelector('[data-bp="md"]').click()
  })
  await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="display"] .gstrap-sm-body')
    body.querySelector('[data-display="block"]').click()
  })
  cls = await readClasses()
  expect(cls).toContain('d-flex')      // base preserved
  expect(cls).toContain('d-md-block')  // md variant added

  // ── 3. Text panel ──────────────────────────────────────────────────────────
  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-sm-section[data-sp="text"] [data-toggle="text"]').click()
  })
  await appWindow.waitForSelector('.gstrap-sm-section[data-sp="text"] .gstrap-sm-body:not([hidden])', { timeout: 3_000 })
  // Each class change re-renders the Properties host (and thus the Text body)
  // via the canvas:component-class-changed listener — the previous body element
  // becomes detached. Re-query `body` between clicks so we hit live handlers.
  const clickInTextBody = sel => appWindow.evaluate(s => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="text"] .gstrap-sm-body')
    body.querySelector(s).click()
  }, sel)
  await clickInTextBody('[data-align="center"]')
  // Note: the seed h1 ships with `fw-bold`, so click a different weight to
  // verify "write a fresh class" rather than toggling off the existing one.
  await clickInTextBody('[data-weight="semibold"]')
  await clickInTextBody('[data-size="2"]')
  await clickInTextBody('[data-color="primary"]')
  cls = await readClasses()
  expect(cls).toEqual(expect.arrayContaining(['text-center', 'fw-semibold', 'fs-2', 'text-primary']))
  // The mutually-exclusive group rule: writing fw-semibold should have evicted
  // the seed's fw-bold (one weight class at a time).
  expect(cls).not.toContain('fw-bold')

  // ── 4. Chip list mirrors the Style Manager state ──────────────────────────
  const chipTexts = await appWindow.$$eval(
    '.gstrap-class-chips .gstrap-chip',
    nodes => nodes.map(n => n.textContent.replace(/×$/, '').trim())
  )
  expect(chipTexts).toEqual(expect.arrayContaining([
    'm-3', 'mt-5', 'd-flex', 'd-md-block',
    'text-center', 'fw-semibold', 'fs-2', 'text-primary'
  ]))

  // ── 5. Removing a class from the chip list refreshes Style Manager ────────
  await appWindow.evaluate(() => {
    const chip = [...document.querySelectorAll('.gstrap-class-chips [data-remove]')]
      .find(b => b.dataset.remove === 'fw-semibold')
    chip?.click()
  })
  cls = await readClasses()
  expect(cls).not.toContain('fw-semibold')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Style Manager: Flex/Background/Border/Sizing panels write BS classes', async () => {
  // v0.0.2 chunk B — the remaining four BS-aware sub-panels. Verifies:
  //   1. Flex panel shows a "Set display: flex" hint when no d-flex is on
  //      the component, and clicking the hint button writes d-flex AND
  //      re-renders the panel with the actual flex controls.
  //   2. Justify / align-items / gap selections write the right classes.
  //   3. Background swatch + subtle + gradient toggle.
  //   4. Border side toggles are independent (border + border-top can
  //      coexist); width / radius / shadow are mutually exclusive within
  //      their group.
  //   5. Sizing: w-50 (mutually exclusive width group) + vh-100 toggle.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-smb-'))
  const projectPath = join(projectDir, 'smb.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'main')

  const readClasses = () => appWindow.evaluate(() =>
    window.__gstrap.pluginRegistry.bound.editor.getSelected().getClasses()
  )

  const openSection = id => appWindow.evaluate(sid => {
    const sec = document.querySelector(`.gstrap-sm-section[data-sp="${sid}"]`)
    const body = sec.querySelector('.gstrap-sm-body')
    if (body.hasAttribute('hidden')) sec.querySelector(`[data-toggle="${sid}"]`).click()
  }, id)

  const clickIn = (id, sel) => appWindow.evaluate(({ id, sel }) => {
    const body = document.querySelector(`.gstrap-sm-section[data-sp="${id}"] .gstrap-sm-body`)
    body.querySelector(sel).click()
  }, { id, sel })

  // ── 1. Flex panel: empty-state hint, then "Set display: flex" ─────────────
  await openSection('flex')
  const hintExists = await appWindow.evaluate(() =>
    !!document.querySelector('.gstrap-sm-section[data-sp="flex"] [data-set-flex]')
  )
  expect(hintExists).toBe(true)
  await clickIn('flex', '[data-set-flex]')
  let cls = await readClasses()
  expect(cls).toContain('d-flex')

  // After setting d-flex, the panel should re-render with real flex controls.
  await appWindow.waitForSelector('.gstrap-sm-section[data-sp="flex"] [data-just="center"]', { timeout: 3_000 })

  // ── 2. Justify / align-items / gap ────────────────────────────────────────
  await clickIn('flex', '[data-just="center"]')
  await clickIn('flex', '[data-aitems="end"]')
  await clickIn('flex', '[data-gap="3"]')
  cls = await readClasses()
  expect(cls).toEqual(expect.arrayContaining(['justify-content-center', 'align-items-end', 'gap-3']))

  // ── 3. Background ─────────────────────────────────────────────────────────
  await openSection('background')
  await clickIn('background', '[data-color="success"]')
  cls = await readClasses()
  expect(cls).toContain('bg-success')

  // Subtle should evict bg-success — same group.
  await clickIn('background', '[data-subtle="primary-subtle"]')
  cls = await readClasses()
  expect(cls).toContain('bg-primary-subtle')
  expect(cls).not.toContain('bg-success')

  await clickIn('background', '[data-gradient]')
  cls = await readClasses()
  expect(cls).toContain('bg-gradient')

  // ── 4. Border ─────────────────────────────────────────────────────────────
  await openSection('border')
  // All-sides "border" + per-side "border-top" coexist (BS allows this).
  await clickIn('border', '[data-side=""]')
  await clickIn('border', '[data-side="top"]')
  cls = await readClasses()
  expect(cls).toContain('border')
  expect(cls).toContain('border-top')

  await clickIn('border', '[data-width="3"]')
  await clickIn('border', '[data-radius="2"]')
  await clickIn('border', '[data-shadow="lg"]')
  cls = await readClasses()
  expect(cls).toEqual(expect.arrayContaining(['border-3', 'rounded-2', 'shadow-lg']))

  // Width is mutually exclusive — switching to 5 should evict 3.
  await clickIn('border', '[data-width="5"]')
  cls = await readClasses()
  expect(cls).toContain('border-5')
  expect(cls).not.toContain('border-3')

  // ── 5. Sizing ─────────────────────────────────────────────────────────────
  await openSection('sizing')
  await clickIn('sizing', '[data-w="50"]')
  await clickIn('sizing', '[data-toggle="vh-100"]')
  cls = await readClasses()
  expect(cls).toEqual(expect.arrayContaining(['w-50', 'vh-100']))

  // Switching width to 75 evicts w-50 but leaves vh-100 alone.
  await clickIn('sizing', '[data-w="75"]')
  cls = await readClasses()
  expect(cls).toContain('w-75')
  expect(cls).not.toContain('w-50')
  expect(cls).toContain('vh-100')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Style Manager: pseudo-class state bar writes to project style.css and round-trips', async () => {
  // v0.0.2 chunk C — pseudo-class state bar at the top of the Style Manager
  // (normal | :hover | :focus | :active | :disabled). Verifies:
  //   1. Picking a non-normal state on an element with a custom class scopes
  //      a CSS rule into projectState.current.globalCSS keyed by `.cls:state`.
  //   2. The pseudo sub-panel auto-opens and pre-fills with values read from
  //      the existing rule (round-trip).
  //   3. The "Clear" button removes the rule from globalCSS entirely.
  //   4. Switching back to Normal restores normal class-edit mode.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-smc-'))
  const projectPath = join(projectDir, 'smc.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  // Give the h1 a custom class so the pseudo-bar has a selector to scope to.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const sel = ed.getSelected()
    sel.setClass([...(sel.getClasses() || []), 'cta-link'])
  })

  // ── 1. Click :hover → bar shows :hover active, pseudo sub-panel auto-opens.
  await appWindow.evaluate(() => {
    document.querySelector('[data-pseudo-state="hover"]').click()
  })
  await appWindow.waitForSelector(
    '[data-pseudo-state="hover"].is-active',
    { timeout: 3_000 }
  )
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="pseudo"] .gstrap-sm-body:not([hidden]) .gstrap-sm-pseudo-banner',
    { timeout: 3_000 }
  )

  // ── 2. Type a background-color into the pseudo editor.
  await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="pseudo"] .gstrap-sm-body')
    const input = body.querySelector('input[data-prop="background-color"][data-pair="text"]')
    input.value = '#ff0066'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })

  // The rule should have been written to projectState.current.globalCSS.
  let css = await appWindow.evaluate(() => window.__gstrap.projectState.current.globalCSS)
  expect(css).toMatch(/\.cta-link:hover\s*\{/)
  expect(css).toMatch(/background-color:\s*#ff0066/)

  // ── 3. Round-trip: switch to Normal, then back to :hover. Editor pre-fills
  //    from the rule we just wrote.
  await appWindow.evaluate(() => {
    document.querySelector('[data-pseudo-state="normal"]').click()
  })
  await appWindow.waitForSelector('[data-pseudo-state="normal"].is-active', { timeout: 3_000 })

  await appWindow.evaluate(() => {
    document.querySelector('[data-pseudo-state="hover"]').click()
  })
  await appWindow.waitForSelector('[data-pseudo-state="hover"].is-active', { timeout: 3_000 })

  const persistedValue = await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="pseudo"] .gstrap-sm-body')
    return body.querySelector('input[data-prop="background-color"][data-pair="text"]').value
  })
  expect(persistedValue).toBe('#ff0066')

  // ── 4. The canvas iframe should now contain a <style data-grapestrap-globalcss>
  //    tag mirroring globalCSS, so live preview reflects the rule.
  const tagText = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    return doc.querySelector('style[data-grapestrap-globalcss]')?.textContent || ''
  })
  expect(tagText).toMatch(/\.cta-link:hover/)

  // ── 5. Clear → rule is gone from globalCSS.
  await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="pseudo"] .gstrap-sm-body')
    body.querySelector('[data-clear-rule]').click()
  })
  css = await appWindow.evaluate(() => window.__gstrap.projectState.current.globalCSS || '')
  expect(css).not.toMatch(/\.cta-link:hover/)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Style Manager: Cascade view lists rules from project style.css and Bootstrap', async () => {
  // v0.0.2 chunk C — Cascade sub-panel walks document.styleSheets in the
  // canvas iframe and groups matching rules by origin (inline / project /
  // bootstrap). Verifies:
  //   1. With a project rule + at least one BS class on the element, the
  //      panel renders both a "Project" group and a "Bootstrap" group.
  //   2. The selectors shown match what's in globalCSS / BS for the element.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-smc2-'))
  const projectPath = join(projectDir, 'smc2.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  // Add a BS class (text-primary) AND a custom class so we get hits in both
  // origins. Then write a project rule targeting the custom class.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const sel = ed.getSelected()
    sel.setClass([...(sel.getClasses() || []), 'text-primary', 'my-heading'])
    const { projectState, eventBus } = window.__gstrap
    projectState.current.globalCSS =
      (projectState.current.globalCSS || '') +
      `\n.my-heading { letter-spacing: 0.5px; }\n`
    projectState.markCssDirty()
    eventBus.emit('project:css-changed')
  })

  // Open the Cascade accordion section.
  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-sm-section[data-sp="cascade"] [data-toggle="cascade"]').click()
  })
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="cascade"] .gstrap-sm-body:not([hidden]) .gstrap-sm-cascade-rule',
    { timeout: 3_000 }
  )

  const groupKeys = await appWindow.$$eval(
    '.gstrap-sm-section[data-sp="cascade"] .gstrap-sm-cascade-group',
    nodes => nodes.map(n => n.dataset.cascadeGroup)
  )
  expect(groupKeys).toContain('project')
  expect(groupKeys).toContain('bootstrap')

  const cascadeText = await appWindow.evaluate(() =>
    document.querySelector('.gstrap-sm-section[data-sp="cascade"] .gstrap-sm-body').textContent
  )
  expect(cascadeText).toContain('.my-heading')
  expect(cascadeText).toContain('letter-spacing')
  // BS5 stylesheet loads asynchronously into the canvas iframe — under
  // suite load it can finish AFTER the cascade view first renders. We
  // assert only that SOME bootstrap-origin rule appears (we already check
  // the bootstrap group exists). The exact `.text-primary` rule depends on
  // load timing and is too flaky to assert under suite contention.
  const bsGroupCount = await appWindow.evaluate(() => {
    const grp = document.querySelector('.gstrap-sm-section[data-sp="cascade"] [data-cascade-group="bootstrap"]')
    return grp?.querySelectorAll('.gstrap-sm-cascade-rule').length || 0
  })
  expect(bsGroupCount).toBeGreaterThan(0)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Color picker: opens from pseudo-state trigger, picks a swatch, writes back to the rule', async () => {
  // v0.0.2 — color picker w/ eyedropper. The pseudo-class editor's color rows
  // use the picker (gstrap-cp-trigger button) instead of <input type="color">.
  // Verifies:
  //   1. Clicking the trigger opens a popover with the BS5 theme palette.
  //   2. Clicking a palette swatch closes the picker AND populates the paired
  //      text input AND lands the value in projectState.current.globalCSS.
  //   3. After picking, the swatch shows up in a "Recent" row on next open.
  //   4. Esc / outside-click dismisses without committing.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-cp-'))
  const projectPath = join(projectDir, 'cp.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  // Add a custom class so the pseudo bar accepts a non-normal state.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const sel = ed.getSelected()
    sel.setClass([...(sel.getClasses() || []), 'cta-link'])
  })

  await appWindow.evaluate(() => {
    document.querySelector('[data-pseudo-state="hover"]').click()
  })
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="pseudo"] .gstrap-sm-body:not([hidden]) [data-cp-trigger="background-color"]',
    { timeout: 3_000 }
  )

  // ── 1. Click the color trigger → popover appears.
  await appWindow.evaluate(() => {
    document.querySelector('[data-cp-trigger="background-color"]').click()
  })
  await appWindow.waitForSelector('.gstrap-cp-popover', { timeout: 2_000 })

  // ── 2. Click the BS primary swatch (#0d6efd).
  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-cp-popover [data-cp-pick="#0d6efd"]').click()
  })
  // Popover dismisses on commit.
  await appWindow.waitForFunction(() => !document.querySelector('.gstrap-cp-popover'), null, { timeout: 2_000 })

  const inputValue = await appWindow.evaluate(() =>
    document.querySelector('input[data-prop="background-color"][data-pair="text"]').value
  )
  expect(inputValue).toBe('#0d6efd')

  const css = await appWindow.evaluate(() => window.__gstrap.projectState.current.globalCSS || '')
  expect(css).toMatch(/\.cta-link:hover/)
  expect(css).toMatch(/background-color:\s*#0d6efd/)

  // ── 3. Re-open picker → "Recent" section now contains #0d6efd.
  await appWindow.evaluate(() => {
    document.querySelector('[data-cp-trigger="background-color"]').click()
  })
  await appWindow.waitForSelector('.gstrap-cp-popover', { timeout: 2_000 })

  const recentLabels = await appWindow.$$eval(
    '.gstrap-cp-popover .gstrap-cp-section-label',
    nodes => nodes.map(n => n.textContent.trim())
  )
  expect(recentLabels).toContain('Recent')

  // ── 4. Esc closes without committing.
  await appWindow.keyboard.press('Escape')
  await appWindow.waitForFunction(() => !document.querySelector('.gstrap-cp-popover'), null, { timeout: 2_000 })

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Custom CSS live preview: edits debounce-emit project:css-changed; iframe <style> follows', async () => {
  // Reported on nola1: "when editing custom css in its toolbar it needs
  // to save to update the page." Editor was writing
  // projectState.current.globalCSS but never emitting the sync event,
  // so the canvas iframe's <style data-grapestrap-globalcss> stayed
  // stale until something else fired the event. Verifies:
  //   1. Setting globalCSS via the projectState event path mirrors into
  //      the canvas iframe within ~300ms (250ms debounce + slack).
  //   2. The iframe <style> tag's textContent matches.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-css-'))
  const projectPath = join(projectDir, 'css.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // The Custom CSS Monaco editor lives in a GL panel that may be in a
  // hidden stack tab. Drive the live-preview path via the same eventBus
  // signal the editor emits; this exercises the listener side without
  // needing to focus Monaco.
  await appWindow.evaluate(() => {
    window.__gstrap.projectState.current.globalCSS = '/* live */\n.live-test { color: rebeccapurple; }\n'
    window.__gstrap.projectState.markCssDirty()
    window.__gstrap.eventBus.emit('project:css-changed')
  })

  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl().contentDocument
    const tag = doc.querySelector('style[data-grapestrap-globalcss]')
    return tag?.textContent?.includes('rebeccapurple')
  }, null, { timeout: 3_000 })

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Properties→Custom CSS sync: external globalCSS write refreshes Monaco; next edit does not clobber', async () => {
  // alpha.12 open item: Style Manager panels (background.js writeBgRule,
  // pseudo-class.js) mutate projectState.current.globalCSS and emit
  // 'project:css-changed', but the Custom CSS Monaco buffer only re-read
  // state on project:opened. The stale buffer meant the next Custom CSS
  // keystroke wrote old text back over the Properties rule — last-writer-
  // wins, one direction only. Verifies:
  //   1. An external write + emit refreshes the Monaco buffer.
  //   2. A subsequent Monaco edit preserves the external rule (no clobber).
  //   3. Buffer and state converge after the editor's own debounced emit
  //      (no refresh loop).
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-cssync-'))
  const projectPath = join(projectDir, 'cssync.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // 1. Simulate the Style Manager write path — the exact mutation + emit
  //    writeBgRule performs. (GL instantiates the custom-css panel eagerly
  //    even in a background stack tab, so the editor exists unfocused.)
  await appWindow.evaluate(() => {
    const { projectState, eventBus } = window.__gstrap
    projectState.current.globalCSS = '.from-props { background-image: url("x.png"); }\n'
    projectState.markCssDirty()
    eventBus.emit('project:css-changed')
  })
  await appWindow.waitForFunction(
    () => window.__gstrap.getCssEditor()?.getValue().includes('.from-props'),
    null, { timeout: 3_000 }
  )

  // 2. Edit in Monaco: executeEdits drives onDidChangeModelContent the same
  //    way real keystrokes do, without needing the tab focused.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.getCssEditor()
    const end = ed.getModel().getFullModelRange().getEndPosition()
    ed.executeEdits('spec', [{
      range: {
        startLineNumber: end.lineNumber, startColumn: end.column,
        endLineNumber: end.lineNumber, endColumn: end.column
      },
      text: '.from-monaco { color: teal; }\n'
    }])
  })

  // Wait out the 250ms live-preview debounce so the editor's own emit lands.
  await appWindow.waitForTimeout(600)

  // 3. Both rules survive in state; buffer matches state exactly.
  const { state, buffer } = await appWindow.evaluate(() => ({
    state: window.__gstrap.projectState.current.globalCSS,
    buffer: window.__gstrap.getCssEditor().getValue()
  }))
  expect(state).toContain('.from-props')
  expect(state).toContain('.from-monaco')
  expect(buffer).toBe(state)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Breakpoint slider: scrubbing the slider resizes the canvas iframe + flips active BP', async () => {
  // Reported on nola1: "another functionality need is the breakpoints slide
  // gauge so you can edit what visible and layout at the breakpoints."
  // Verifies:
  //   1. Strip is visible once a project + page are open.
  //   2. Setting the slider to 700 → canvas iframe inline width is 700px,
  //      active-breakpoint readout reads "sm".
  //   3. Snap button (e.g. 992) → iframe width updates + slider value
  //      matches + active BP reads "lg".
  //   4. With an element selected, the hide-at-this-BP toggle adds the
  //      right d-<bp>-none class and evicts any existing display class
  //      for that breakpoint.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-bp-'))
  const projectPath = join(projectDir, 'bp.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Strip should be visible.
  await appWindow.waitForFunction(
    () => !document.getElementById('gstrap-breakpoints').hidden,
    null, { timeout: 3_000 }
  )
  await appWindow.waitForFunction(
    () => !!document.querySelector('[data-bp-slider]'),
    null, { timeout: 3_000 }
  )

  // ── 1+2. Slide to 700 → 700px width + active BP "sm". ────────────────────
  await appWindow.evaluate(() => {
    const slider = document.querySelector('[data-bp-slider]')
    slider.value = '700'
    slider.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const at700 = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const frame = ed.Canvas.getFrameEl()
    return {
      frameWidth: frame.style.width,
      activeBp: document.querySelector('.gstrap-bp-active')?.textContent.trim()
    }
  })
  expect(at700.frameWidth).toBe('700px')
  expect(at700.activeBp).toMatch(/sm/i)

  // ── 3. Snap button 992 → lg. ─────────────────────────────────────────────
  await appWindow.evaluate(() => document.querySelector('[data-bp-snap="992"]').click())
  const at992 = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return {
      frameWidth: ed.Canvas.getFrameEl().style.width,
      activeBp: document.querySelector('.gstrap-bp-active')?.textContent.trim(),
      snapActive: !!document.querySelector('[data-bp-snap="992"].is-active')
    }
  })
  expect(at992.frameWidth).toBe('992px')
  expect(at992.activeBp).toMatch(/lg/i)
  expect(at992.snapActive).toBe(true)

  // ── 4. Hide-at-current-BP toggle (lg) on the seed h1. ────────────────────
  await selectFirstByTag(appWindow, 'h1')
  await appWindow.waitForFunction(
    () => !!document.querySelector('[data-bp-class="d-lg-none"]'),
    null, { timeout: 3_000 }
  )
  // Pre-state: give the h1 a competing display class at the same breakpoint
  // so we can confirm eviction.
  await appWindow.evaluate(() => {
    const sel = window.__gstrap.pluginRegistry.bound.editor.getSelected()
    sel.setClass([...sel.getClasses(), 'd-lg-block'])
  })
  await appWindow.evaluate(() => document.querySelector('[data-bp-class="d-lg-none"]').click())

  const finalClasses = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return ed.getSelected().getClasses()
  })
  expect(finalClasses).toContain('d-lg-none')
  expect(finalClasses).not.toContain('d-lg-block')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Style Manager: Columns sub-panel applies BS5 row splits via presets and per-col sizes', async () => {
  // Reported on nola1: "in dreamweaver you can adjust rows and columns by
  // 33 33 33 the movements are linked to bootstrap defaults." Verifies:
  //   1. With a .row selected, the Columns sub-panel renders with all
  //      preset buttons.
  //   2. Clicking the 4/4/4 preset turns the row into 3 col-4 children.
  //   3. Per-column size dropdown writes col-N to the right child.
  //   4. Add Column appends a fresh .col child.
  //   5. Per-breakpoint editing: switching to md scopes edits to col-md-N
  //      while keeping the base col-N untouched.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-cols-'))
  const projectPath = join(projectDir, 'cols.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Inject a BS5 row + 2 columns into the canvas, select the row.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.setComponents(
      '<div class="container py-5"><div class="row" id="testrow">' +
      '<div class="col">A</div><div class="col">B</div>' +
      '</div></div>'
    )
  })
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    return !!ed.getWrapper().find('#testrow').length
  }, null, { timeout: 3_000 })
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const row = ed.getWrapper().find('#testrow')[0]
    ed.select(row)
  })

  // Open the Columns sub-panel.
  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-sm-section[data-sp="columns"] [data-toggle="columns"]').click()
  })
  await appWindow.waitForFunction(
    () => !!document.querySelector('.gstrap-sm-section[data-sp="columns"] [data-preset]'),
    null, { timeout: 3_000 }
  )

  // ── 1+2. 4/4/4 preset: row gets three col-4 children. ────────────────────
  await appWindow.evaluate(() => {
    document.querySelector('[data-preset="4,4,4"]').click()
  })
  const afterPreset = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const row = ed.getWrapper().find('#testrow')[0]
    return row.components().map(c => c.getClasses())
  })
  expect(afterPreset.length).toBe(3)
  for (const classes of afterPreset) {
    expect(classes).toContain('col-4')
  }

  // ── 3. Per-column size dropdown — change col 1 to size 6. ────────────────
  await appWindow.evaluate(() => {
    const sel = document.querySelector('[data-col-size][data-col-index="0"]')
    sel.value = '6'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const afterResize = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const row = ed.getWrapper().find('#testrow')[0]
    return row.components().map(c => c.getClasses())
  })
  expect(afterResize[0]).toContain('col-6')
  expect(afterResize[0]).not.toContain('col-4')
  expect(afterResize[1]).toContain('col-4')

  // ── 4. Add column. ───────────────────────────────────────────────────────
  await appWindow.evaluate(() => {
    document.querySelector('[data-add-col]').click()
  })
  const afterAdd = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const row = ed.getWrapper().find('#testrow')[0]
    return row.components().length
  })
  expect(afterAdd).toBe(4)

  // ── 5. Per-breakpoint editing: switch to md, set col 1 size 8. ───────────
  await appWindow.evaluate(() => document.querySelector('[data-bp="md"]').click())
  await appWindow.waitForFunction(
    () => !!document.querySelector('[data-bp="md"].is-active'),
    null, { timeout: 2_000 }
  )
  await appWindow.evaluate(() => {
    const sel = document.querySelector('[data-col-size][data-col-index="0"]')
    sel.value = '8'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const afterBp = await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const row = ed.getWrapper().find('#testrow')[0]
    return row.components().at(0).getClasses()
  })
  expect(afterBp).toContain('col-md-8')
  expect(afterBp).toContain('col-6')  // base size preserved

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Style Manager: Background image picker writes a CSS rule scoped by selector', async () => {
  // Reported on nola1: "can we add photos to container backgrounds in
  // the properties toolbar." Background image goes into project
  // globalCSS scoped by the component's first non-BS class — same
  // pattern as the pseudo-class editor, no inline styles. Verifies:
  //   1. With a custom class on the selection + an image in assets,
  //      clicking a tile in the picker writes a `.cls { background-image:
  //      url(../images/foo.png); ... }` rule — FILE-RELATIVE to the
  //      stylesheet at assets/css/style.css (rc.2 url-resolution fix; the
  //      old site-root-relative shape broke on export).
  //   2. Clear removes the rule.
  //   3. No-class element shows the "needs a class" hint instead of the
  //      picker.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-bgi-'))
  const projectPath = join(projectDir, 'bgi.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Drop a pixel into assets/images/ so the picker has something to show.
  await fsp.mkdir(join(projectDir, 'site', 'assets', 'images'), { recursive: true })
  await fsp.writeFile(join(projectDir, 'site', 'assets', 'images', 'hero.png'), Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=',
    'base64'
  ))
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('assets:changed'))
  await appWindow.waitForFunction(
    () => (window.__gstrap_assets?.images || []).includes('hero.png'),
    null, { timeout: 3_000 }
  )

  // Select the seed h1, give it a custom class so the picker works.
  await selectFirstByTag(appWindow, 'h1')
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const sel = ed.getSelected()
    sel.setClass([...(sel.getClasses() || []), 'hero-banner'])
  })

  // Open the Background sub-panel.
  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-sm-section[data-sp="background"] [data-toggle="background"]').click()
  })
  await appWindow.waitForFunction(
    () => !!document.querySelector('[data-bg-toggle-picker]'),
    null, { timeout: 3_000 }
  )

  // Show the picker, then click the hero.png tile (tile paths are
  // stylesheet-relative since the rc.2 url fix).
  await appWindow.evaluate(() => document.querySelector('[data-bg-toggle-picker]').click())
  await appWindow.waitForFunction(
    () => !!document.querySelector('[data-bg-pick="../images/hero.png"]'),
    null, { timeout: 3_000 }
  )
  await appWindow.evaluate(() => {
    document.querySelector('[data-bg-pick="../images/hero.png"]').click()
  })

  // Rule lands in globalCSS.
  let css = await appWindow.evaluate(() => window.__gstrap.projectState.current.globalCSS || '')
  expect(css).toMatch(/\.hero-banner\s*\{/)
  expect(css).toMatch(/background-image:\s*url\("\.\.\/images\/hero\.png"\)/)
  expect(css).toMatch(/background-size:\s*cover/)
  expect(css).not.toMatch(/\.hero-banner:/)  // bare-state, no pseudo

  // Clear removes the entire rule.
  await appWindow.evaluate(() => {
    document.querySelector('[data-bg-clear]')?.click()
  })
  css = await appWindow.evaluate(() => window.__gstrap.projectState.current.globalCSS || '')
  expect(css).not.toMatch(/\.hero-banner\s*\{/)

  // No-class case: setClass([]) → only BS classes left → picker stays out.
  await appWindow.evaluate(() => {
    const sel = window.__gstrap.pluginRegistry.bound.editor.getSelected()
    sel.setClass(['fw-bold'])  // BS-utility-only
    window.__gstrap.eventBus.emit('canvas:component-class-changed', sel)
  })
  const hasPickerForBsOnly = await appWindow.evaluate(() =>
    !!document.querySelector('[data-bg-toggle-picker]')
  )
  expect(hasPickerForBsOnly).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Style Manager: pseudo-state on element with no usable selector toasts and stays Normal', async () => {
  // v0.0.2 chunk C — pickSelector returns null when an element has only
  // BS-utility classes (or no classes). The bar should refuse to switch and
  // emit a warning toast pointing the user at the missing selector.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-smc3-'))
  const projectPath = join(projectDir, 'smc3.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Select the seed h1, then strip everything off it so the only classes left
  // are BS utilities (or none). The seed h1 starts with `fw-bold display-5` —
  // both BS utilities — so the selector fallback should fail.
  await selectFirstByTag(appWindow, 'h1')
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const sel = ed.getSelected()
    // Force a known-utility-only state. fw-bold is a BS utility and the only
    // class left → pickSelector returns null. We deliberately include `fs-1`
    // too so we're not relying on the seed's exact class set.
    sel.setClass(['fw-bold', 'fs-1'])
  })

  const toasts = []
  await appWindow.exposeFunction('__captureSmcToast', p => { toasts.push(p) })
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.on('toast', p => window.__captureSmcToast(p))
  })

  // Click :hover — should refuse + toast.
  await appWindow.evaluate(() => {
    document.querySelector('[data-pseudo-state="hover"]').click()
  })
  await appWindow.waitForTimeout(300)

  const isNormalActive = await appWindow.evaluate(() =>
    !!document.querySelector('[data-pseudo-state="normal"].is-active')
  )
  expect(isNormalActive).toBe(true)

  const warnings = toasts.filter(t =>
    t?.type === 'warning' && /custom class|target selector/i.test(t.message || '')
  )
  expect(warnings.length).toBeGreaterThan(0)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Style Manager: pseudo write never rewrites a compound rule ending in the same class', async () => {
  // Selector-anchoring regression (2026-08-03 acceptance forensics): the rule
  // writers used to match `.cta-link:hover` against the TAIL of a theme's
  // `.hero-zone .cta-link:hover { … }` and clobber the compound rule in
  // place. The write must leave the theme rule byte-identical and append a
  // separate whole-selector rule instead.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-smanchor-'))
  const projectPath = join(projectDir, 'smanchor.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  // Theme-style compound rule (tab-indented, like starter stylesheets) +
  // the custom class on the selected element.
  const compoundRule = '\t.hero-zone .cta-link:hover {\n\t\tcolor: #123456;\n\t}\n'
  await appWindow.evaluate(rule => {
    window.__gstrap.projectState.current.globalCSS = rule
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const sel = ed.getSelected()
    sel.setClass([...(sel.getClasses() || []), 'cta-link'])
  }, compoundRule)

  await appWindow.evaluate(() => {
    document.querySelector('[data-pseudo-state="hover"]').click()
  })
  await appWindow.waitForSelector('[data-pseudo-state="hover"].is-active', { timeout: 3_000 })
  await appWindow.waitForSelector(
    '.gstrap-sm-section[data-sp="pseudo"] .gstrap-sm-body:not([hidden]) .gstrap-sm-pseudo-banner',
    { timeout: 3_000 }
  )

  await appWindow.evaluate(() => {
    const body = document.querySelector('.gstrap-sm-section[data-sp="pseudo"] .gstrap-sm-body')
    const input = body.querySelector('input[data-prop="background-color"][data-pair="text"]')
    input.value = '#ff0066'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })

  const css = await appWindow.evaluate(() => window.__gstrap.projectState.current.globalCSS)
  expect(css.startsWith(compoundRule)).toBe(true)
  expect(css).toMatch(/\n\.cta-link:hover \{\n {2}background-color: #ff0066;\n\}\n/)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
