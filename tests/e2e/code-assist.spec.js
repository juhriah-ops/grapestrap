/**
 * GrapeStrap — E2E: code assist (suggest + url() asset completion + find in Custom CSS)
 *
 * PATH: tests/e2e/code-assist.spec.js
 * ROLE: Proves the Monaco suggest machinery is alive in every code surface
 *       (Custom CSS panel, page pair in Split) — the suggest controller is a
 *       contribution editor.api.js doesn't ship, so a regression here means
 *       completions silently vanish app-wide. Also proves the css url()
 *       image completion inserts the right relative path per stylesheet
 *       (../images/… for the global stylesheet, assets/images/… for inline
 *       page styles), and that Edit → Find lands in the focused Custom CSS
 *       editor without yanking the view mode.
 * DEPENDS: @playwright/test, ./helpers.js, src/renderer/editor/css-asset-completion.js
 * CREATED: 2026-08-06
 */
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome } from './helpers.js'

async function seededLaunch() {
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-assist-'))
  const projectPath = join(projectDir, 'assist.gstrap')
  await openSeedProject(appWindow, projectPath)
  return { app, appWindow }
}

// Activate the Custom CSS right-stack tab and put the caret in its editor
// with the given content, cursor at the end.
async function focusCustomCss(appWindow, content) {
  await appWindow.evaluate(() => document.querySelector('.lm_tab[title="Custom CSS"]')?.click())
  await appWindow.evaluate(text => {
    const ed = window.__gstrap.getCssEditor()
    ed.setValue(text)
    const model = ed.getModel()
    const line = model.getLineCount()
    ed.setPosition({ lineNumber: line, column: model.getLineMaxColumn(line) })
    ed.focus()
  }, content)
}

const suggestShown = () => {
  const w = document.querySelector('.suggest-widget')
  return !!w && w.classList.contains('visible') && w.textContent.length > 0
}

test('Custom CSS panel: typing pops CSS completions (suggest controller alive)', async () => {
  const { app, appWindow } = await seededLaunch()

  await focusCustomCss(appWindow, 'body { col')
  await appWindow.evaluate(() =>
    window.__gstrap.getCssEditor().trigger('e2e', 'editor.action.triggerSuggest', {}))
  await appWindow.waitForFunction(suggestShown, null, { timeout: 5_000 })
  const text = await appWindow.evaluate(() => document.querySelector('.suggest-widget').textContent)
  expect(text).toContain('color')

  await app.close()
})

test('Split view: page HTML editor pops tag completions', async () => {
  const { app, appWindow } = await seededLaunch()

  await appWindow.evaluate(() => {
    const { pageState } = window.__gstrap
    pageState.setViewMode(pageState.active().pageName, 'split')
  })
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.getMonacoPair().htmlEditor
    const model = ed.getModel()
    const line = model.getLineCount()
    ed.setPosition({ lineNumber: line, column: model.getLineMaxColumn(line) })
    ed.focus()
    ed.trigger('e2e', 'type', { text: '<sp' })
    ed.trigger('e2e', 'editor.action.triggerSuggest', {})
  })
  await appWindow.waitForFunction(suggestShown, null, { timeout: 5_000 })
  const text = await appWindow.evaluate(() => document.querySelector('.suggest-widget').textContent)
  expect(text).toContain('span')

  await app.close()
})

test('css url() completion: global stylesheet gets ../images/…, inline page styles get assets/images/…', async () => {
  const { app, appWindow } = await seededLaunch()

  // The provider reads the Asset Manager's synchronous cache; seed it the
  // same shape publishCache() writes. (Watcher/refresh plumbing has its own
  // coverage in assets-import-export.spec.js.)
  await appWindow.evaluate(() => {
    window.__gstrap_assets = { images: ['hero-test.png'], fonts: [], videos: [] }
  })

  // Global stylesheet (Custom CSS panel) → stylesheet-relative path.
  await focusCustomCss(appWindow, 'body { background: url(')
  await appWindow.evaluate(() =>
    window.__gstrap.getCssEditor().trigger('e2e', 'editor.action.triggerSuggest', {}))
  await appWindow.waitForFunction(suggestShown, null, { timeout: 5_000 })
  expect(await appWindow.evaluate(() =>
    document.querySelector('.suggest-widget').textContent)).toContain('hero-test.png')
  await appWindow.evaluate(() =>
    window.__gstrap.getCssEditor().trigger('e2e', 'acceptSelectedSuggestion', {}))
  const globalCssValue = await appWindow.evaluate(() => window.__gstrap.getCssEditor().getValue())
  expect(globalCssValue).toContain('url(../images/hero-test.png')

  // Inline page styles (pair css editor in Split) → document-relative path.
  await appWindow.evaluate(() => {
    const { pageState } = window.__gstrap
    pageState.setViewMode(pageState.active().pageName, 'split')
  })
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.getMonacoPair().cssEditor
    ed.setValue('h1 { background: url(')
    const model = ed.getModel()
    ed.setPosition({ lineNumber: 1, column: model.getLineMaxColumn(1) })
    ed.focus()
    ed.trigger('e2e', 'editor.action.triggerSuggest', {})
  })
  await appWindow.waitForFunction(suggestShown, null, { timeout: 5_000 })
  await appWindow.evaluate(() =>
    window.__gstrap.getMonacoPair().cssEditor.trigger('e2e', 'acceptSelectedSuggestion', {}))
  const pairCssValue = await appWindow.evaluate(() =>
    window.__gstrap.getMonacoPair().cssEditor.getValue())
  expect(pairCssValue).toContain('url(assets/images/hero-test.png')

  await app.close()
})

test('Edit → Find lands in the focused Custom CSS editor without switching view mode', async () => {
  const { app, appWindow } = await seededLaunch()

  await focusCustomCss(appWindow, '.hero { color: red; }')
  const clicked = await app.evaluate(({ Menu }) => {
    const edit = Menu.getApplicationMenu()?.items.find(i => i.label === '&Edit')
    const find = edit?.submenu?.items.find(i => i.label === 'Find')
    if (!find) return false
    find.click()
    return true
  })
  expect(clicked).toBe(true)

  // The find widget must appear inside the Custom CSS panel's host…
  await appWindow.waitForFunction(
    () => !!document.querySelector('.gstrap-cssp-host .find-widget.visible'),
    null, { timeout: 5_000 })
  // …and the page tab must still be in Design view (no forced Split switch).
  const mode = await appWindow.evaluate(() => window.__gstrap.pageState.active().viewMode)
  expect(mode).toBe('design')

  await app.close()
})
