/**
 * GrapeStrap — E2E: element-specific editing (Attributes section + strip)
 *
 * PATH: tests/e2e/element-fields.spec.js
 * ROLE: WP-B3 (F5) specs for the shared element field matrix
 *       (panels/element-fields.js) as seen through its two surfaces: the
 *       Properties panel's new Attributes section and the bottom property
 *       strip. Covers the round-trip into getHtml(), the empty-string-deletes
 *       attribute idiom (no `href=""` on disk), a heading retag keeping its
 *       classes and selection, locked (editable:false) elements rendering
 *       disabled controls, the checkbox and action field kinds that only the
 *       side panel renders, and the strip regression the refactor could have
 *       caused — a/img fields still work there.
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-08-18
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject } from './helpers.js'

const canvasHtml = appWindow => appWindow.evaluate(
  () => window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || '')

/** Append a fragment to the page wrapper and select the element carrying `id`. */
async function seedAndSelect(appWindow, html, id) {
  await appWindow.evaluate(({ html, id }) => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    editor.getWrapper().append(html)
    const find = component => {
      if (component.getAttributes?.().id === id) return component
      for (const child of component.components()) {
        const hit = find(child)
        if (hit) return hit
      }
      return null
    }
    const found = find(editor.getWrapper())
    if (!found) throw new Error(`seed element #${id} not found`)
    editor.select(found)
  }, { html, id })
  // `attached`, not the default `visible`: every interaction in this spec goes
  // through evaluate(), so the Properties tab does not have to be the active
  // one in its Golden Layout stack for these assertions to be meaningful.
  await appWindow.waitForSelector('.gstrap-props-attributes', { state: 'attached', timeout: 5_000 })
}

/** Re-render the panels for the current selection (after a programmatic
 *  model change that the panels have no reason to hear about). */
async function reselect(appWindow) {
  await appWindow.evaluate(() => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    const selected = editor.getSelected()
    editor.select(null)
    editor.select(selected)
  })
}

/** Type into an Attributes control and commit it the way a user's blur does. */
async function setAttrField(appWindow, key, value) {
  await appWindow.evaluate(({ key, value }) => {
    const el = document.querySelector(`.gstrap-props-attributes [data-attr-field="${key}"]`)
    if (!el) throw new Error(`attribute field not rendered: ${key}`)
    if (el.type === 'checkbox') el.checked = !!value
    else el.value = value
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, { key, value })
}

const attrFieldValue = (appWindow, key) => appWindow.evaluate(k => {
  const el = document.querySelector(`.gstrap-props-attributes [data-attr-field="${k}"]`)
  return el ? (el.type === 'checkbox' ? el.checked : el.value) : null
}, key)

test('Attributes: a link\'s href/target/rel round-trip into getHtml(), and an empty href deletes the attribute', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ef-link-'))
  const projectPath = join(projectDir, 'ef.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedAndSelect(appWindow, '<p><a id="ef-link" href="/old">Docs</a></p>', 'ef-link')

  // The section seeds itself from the live component, not from a cache.
  expect(await attrFieldValue(appWindow, 'href')).toBe('/old')
  expect(await attrFieldValue(appWindow, 'target')).toBe('')

  await setAttrField(appWindow, 'href', '/new')
  await setAttrField(appWindow, 'target', '_blank')
  await setAttrField(appWindow, 'rel', 'noopener')

  let html = await canvasHtml(appWindow)
  expect(html).toContain('href="/new"')
  expect(html).toContain('target="_blank"')
  expect(html).toContain('rel="noopener"')

  // Clearing a field must DELETE the attribute — writing href="" would ship
  // an empty attribute into every saved page.
  await setAttrField(appWindow, 'href', '')
  html = await canvasHtml(appWindow)
  expect(html).not.toContain('href=""')
  expect(html).not.toContain('href="/new"')
  expect(html).toContain('id="ef-link"')       // the element itself survives
  expect(html).toContain('target="_blank"')    // …and so do its other attributes

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Attributes: a Bootstrap button-link keeps the plain link fields and gains a label', async () => {
  // Matcher precedence pin, user-visible half: `a.btn` matches ahead of `a`,
  // and its field set is a superset — losing target/rel there would be a
  // regression against what the strip showed before the matrix existed.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ef-btn-'))
  const projectPath = join(projectDir, 'ef.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedAndSelect(appWindow,
    '<p><a id="ef-btn" class="btn btn-primary" href="/buy">Buy now</a></p>', 'ef-btn')

  const kind = await appWindow.evaluate(() =>
    document.querySelector('.gstrap-props-attributes').dataset.elementKind)
  expect(kind).toBe('link-button')
  expect(await attrFieldValue(appWindow, 'label')).toBe('Buy now')
  expect(await attrFieldValue(appWindow, 'href')).toBe('/buy')
  expect(await attrFieldValue(appWindow, 'target')).toBe('')

  await setAttrField(appWindow, 'label', 'Order now')
  const html = await canvasHtml(appWindow)
  expect(html).toContain('Order now')
  expect(html).not.toContain('Buy now')
  expect(html).toContain('class="btn btn-primary"')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Attributes: a heading retag keeps its classes and leaves the new tag selected', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ef-head-'))
  const projectPath = join(projectDir, 'ef.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedAndSelect(appWindow,
    '<h2 id="ef-head" class="display-4 text-center">Section title</h2>', 'ef-head')

  await setAttrField(appWindow, 'heading-level', 'h3')
  await appWindow.waitForFunction(
    () => (window.__gstrap.pluginRegistry.bound.editor.getSelected()?.get('tagName') || '') === 'h3',
    null, { timeout: 3_000 })

  const html = await canvasHtml(appWindow)
  expect(html).toContain('<h3')
  expect(html).not.toContain('<h2')
  expect(html).toContain('display-4')
  expect(html).toContain('text-center')
  expect(html).toContain('Section title')

  // The replacement is what stays selected — the old model is gone, so a
  // panel still pointing at it would silently edit a detached component.
  const selectedClasses = await appWindow.evaluate(
    () => window.__gstrap.pluginRegistry.bound.editor.getSelected().getClasses())
  expect(selectedClasses).toContain('display-4')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Attributes: a locked element (editable:false) renders every control disabled', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ef-lock-'))
  const projectPath = join(projectDir, 'ef.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedAndSelect(appWindow, '<p><a id="ef-lock" href="/locked">Chrome</a></p>', 'ef-lock')

  await appWindow.evaluate(() => {
    window.__gstrap.pluginRegistry.bound.editor.getSelected().set('editable', false)
  })
  await reselect(appWindow)
  await appWindow.waitForSelector('.gstrap-props-attributes', { state: 'attached', timeout: 5_000 })

  const disabledStates = await appWindow.evaluate(() =>
    [...document.querySelectorAll('.gstrap-props-attributes [data-attr-field]')]
      .map(el => el.disabled))
  expect(disabledStates.length).toBeGreaterThan(0)
  expect(disabledStates.every(Boolean)).toBe(true)

  // The bottom strip agrees, and a forced commit is refused by applyField.
  const stripDisabled = await appWindow.evaluate(() =>
    [...document.querySelectorAll('#gstrap-strip [data-field="href"]')].map(el => el.disabled))
  expect(stripDisabled).toEqual([true])

  await setAttrField(appWindow, 'href', '/hijacked')
  expect(await canvasHtml(appWindow)).toContain('href="/locked"')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Attributes: table checkboxes and action buttons (side-panel-only field kinds)', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ef-table-'))
  const projectPath = join(projectDir, 'ef.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedAndSelect(appWindow,
    '<table id="ef-tbl" class="table"><tbody><tr><td>1</td><td>2</td></tr></tbody></table>', 'ef-tbl')

  // Checkbox kind → a Bootstrap class toggle.
  await setAttrField(appWindow, 'table-striped', true)
  expect(await canvasHtml(appWindow)).toContain('table-striped')
  await setAttrField(appWindow, 'table-striped', false)
  expect(await canvasHtml(appWindow)).not.toContain('table-striped')

  // Checkbox kind → structural change (a whole <thead> in one add).
  expect(await attrFieldValue(appWindow, 'table-head')).toBe(false)
  await setAttrField(appWindow, 'table-head', true)
  let html = await canvasHtml(appWindow)
  expect(html).toContain('<thead>')
  expect((html.match(/<th\b/g) || []).length).toBe(2)   // matches the column count

  // Action kind → a button, not a value control. The strip renders neither.
  await appWindow.evaluate(() => {
    document.querySelector('.gstrap-props-attributes [data-attr-action="table-add-row"]').click()
  })
  html = await canvasHtml(appWindow)
  expect((html.match(/<tr\b/g) || []).length).toBe(3)   // head row + 2 body rows

  const stripFieldKeys = await appWindow.evaluate(() =>
    [...document.querySelectorAll('#gstrap-strip [data-field]')].map(el => el.dataset.field))
  expect(stripFieldKeys).toEqual(['id', 'classes'])     // one line stays one line

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Property strip regression: a/img fields still render and commit from the strip', async () => {
  // The strip's inline a/img/h1-6 branches were deleted in favour of the
  // shared matrix. Its behavior must be a strict superset of what shipped
  // before — same controls, same commit-on-change, plus rel.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ef-strip-'))
  const projectPath = join(projectDir, 'ef.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedAndSelect(appWindow, '<p><a id="ef-a" href="/a">A</a></p>', 'ef-a')

  const stripKeys = () => appWindow.evaluate(() =>
    [...document.querySelectorAll('#gstrap-strip [data-field]')].map(el => el.dataset.field))
  expect(await stripKeys()).toEqual(['id', 'classes', 'href', 'target', 'rel'])

  await appWindow.evaluate(() => {
    const el = document.querySelector('#gstrap-strip [data-field="href"]')
    el.value = '/from-strip'
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(await canvasHtml(appWindow)).toContain('href="/from-strip"')

  // …and an image gets src + alt, exactly as before.
  await seedAndSelect(appWindow, '<img id="ef-img" src="a.png" alt="old">', 'ef-img')
  expect(await stripKeys()).toEqual(['id', 'classes', 'src', 'alt'])
  await appWindow.evaluate(() => {
    const el = document.querySelector('#gstrap-strip [data-field="alt"]')
    el.value = 'new alt'
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(await canvasHtml(appWindow)).toContain('alt="new alt"')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
