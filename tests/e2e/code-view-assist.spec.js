/**
 * GrapeStrap — E2E: code-view assists (tag auto-close + selection highlight)
 *
 * PATH: tests/e2e/code-view-assist.spec.js
 * ROLE: Typing `<div>` in the page html editor auto-inserts `</div>` with
 *       the caret left between the tags; void elements (`<br>`) don't close;
 *       js/css models are untouched. Selecting a canvas element in Split
 *       view decorates that element's whole block in the code pane
 *       (gstrap-code-sel-highlight) and deselecting clears it.
 * DEPENDS: @playwright/test, ./helpers.js, src/renderer/editor/tag-autoclose.js,
 *          src/renderer/editor/code-select-highlight.js
 * CREATED: 2026-08-06
 */
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome, selectFirstByTag } from './helpers.js'

async function seededSplit() {
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-cva-'))
  await openSeedProject(appWindow, join(projectDir, 'cva.gstrap'))
  await appWindow.evaluate(() => {
    const { pageState } = window.__gstrap
    pageState.setViewMode(pageState.active().pageName, 'split')
  })
  return { app, appWindow }
}

// Put the caret on a fresh empty line inside <body> and type via Monaco's
// own type command (the path onDidType hooks).
async function typeAtBodyEnd(appWindow, text) {
  return appWindow.evaluate(t => {
    const ed = window.__gstrap.getMonacoPair().htmlEditor
    const model = ed.getModel()
    const bodyLine = model.findMatches('</body>', false, false, true, null, false)[0]?.range.startLineNumber
    const line = bodyLine ? bodyLine - 1 : model.getLineCount()
    ed.setPosition({ lineNumber: line, column: model.getLineMaxColumn(line) })
    ed.focus()
    // Source must be 'keyboard': onDidType (the auto-close hook) only fires
    // for real typing — paste and programmatic inserts deliberately don't
    // auto-close.
    ed.trigger('keyboard', 'type', { text: '\n' })
    ed.trigger('keyboard', 'type', { text: t })
    const p = ed.getPosition()
    return {
      line: ed.getModel().getLineContent(p.lineNumber),
      column: p.column
    }
  }, text)
}

test('typing <div> auto-inserts </div> with the caret between the tags; <br> stays open', async () => {
  const { app, appWindow } = await seededSplit()

  const div = await typeAtBodyEnd(appWindow, '<div class="wrap">')
  expect(div.line).toContain('<div class="wrap"></div>')
  // Caret sits right after the opening tag, before the close.
  expect(div.line.slice(div.column - 1)).toBe('</div>')

  const br = await typeAtBodyEnd(appWindow, '<br>')
  expect(br.line).toContain('<br>')
  expect(br.line).not.toContain('</br>')

  await app.close()
})

test('typing > in the css editor never generates close tags', async () => {
  const { app, appWindow } = await seededSplit()

  const out = await appWindow.evaluate(() => {
    const ed = window.__gstrap.getCssEditor()
    ed.setValue('')
    ed.setPosition({ lineNumber: 1, column: 1 })
    ed.focus()
    ed.trigger('keyboard', 'type', { text: 'a > b { color: red; }' })
    return ed.getValue()
  })
  expect(out).toBe('a > b { color: red; }')
  expect(out).not.toContain('</')

  await app.close()
})

test('selecting a canvas element in Split highlights its block in the code pane; deselect clears', async () => {
  const { app, appWindow } = await seededSplit()

  await selectFirstByTag(appWindow, 'h1')
  await appWindow.waitForFunction(() => {
    const model = window.__gstrap.getMonacoPair().htmlEditor.getModel()
    return model.getAllDecorations().some(d => d.options.className === 'gstrap-code-sel-highlight')
  }, null, { timeout: 5_000 })

  const decorated = await appWindow.evaluate(() => {
    const model = window.__gstrap.getMonacoPair().htmlEditor.getModel()
    const d = model.getAllDecorations().find(x => x.options.className === 'gstrap-code-sel-highlight')
    return model.getValueInRange(d.range)
  })
  expect(decorated.startsWith('<h1')).toBe(true)
  expect(decorated.endsWith('</h1>')).toBe(true)

  await appWindow.evaluate(() => {
    window.__gstrap.pluginRegistry.bound.editor.select()
  })
  await appWindow.waitForFunction(() => {
    const model = window.__gstrap.getMonacoPair().htmlEditor.getModel()
    return !model.getAllDecorations().some(d => d.options.className === 'gstrap-code-sel-highlight')
  }, null, { timeout: 5_000 })

  await app.close()
})

test('repeated identical sections: selecting the second copy highlights the second block', async () => {
  const { app, appWindow } = await seededSplit()

  // Two byte-identical sections, then select the SECOND one.
  await appWindow.evaluate(() => {
    const gjs = window.__gstrap.pluginRegistry.bound.editor
    const added = gjs.getWrapper().append(
      '<section class="twin"><p>same</p></section><section class="twin"><p>same</p></section>'
    )
    gjs.select(added[1])
  })
  await appWindow.waitForFunction(() => {
    const model = window.__gstrap.getMonacoPair().htmlEditor.getModel()
    return model.getAllDecorations().some(d => d.options.className === 'gstrap-code-sel-highlight')
  }, null, { timeout: 5_000 })

  const check = await appWindow.evaluate(() => {
    const model = window.__gstrap.getMonacoPair().htmlEditor.getModel()
    const d = model.getAllDecorations().find(x => x.options.className === 'gstrap-code-sel-highlight')
    const text = model.getValue()
    const startOffset = model.getOffsetAt({ lineNumber: d.range.startLineNumber, column: d.range.startColumn })
    const firstTwin = text.indexOf('<section class="twin">')
    return { startOffset, firstTwin, isSecond: startOffset > firstTwin }
  })
  expect(check.firstTwin).toBeGreaterThan(-1)
  expect(check.isSecond).toBe(true)

  await app.close()
})
