/**
 * GrapeStrap — E2E: power-editing Monaco contributions
 *
 * PATH: tests/e2e/monaco-power.spec.js
 * ROLE: Pins the 2026-08-07 contribution sweep — each imported feature is
 *       exercised once so a lost import (they're side-effect-only and easy
 *       to drop in a refactor) fails loudly: word ops, comment toggle,
 *       multicursor, line ops, bracket jump, folding, color decorators,
 *       hover docs, word-occurrence highlight, linked tag editing.
 * DEPENDS: @playwright/test, ./helpers.js, src/renderer/editor/monaco-init.js
 * CREATED: 2026-08-07
 */
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome } from './helpers.js'

async function seededCss(appWindowValue) {
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-power-'))
  await openSeedProject(appWindow, join(projectDir, 'power.gstrap'))
  await appWindow.evaluate(() => document.querySelector('.lm_tab[title="Custom CSS"]')?.click())
  await appWindow.evaluate(v => {
    const ed = window.__gstrap.getCssEditor()
    ed.setValue(v)
    ed.focus()
  }, appWindowValue)
  return { app, appWindow }
}

const cssEd = fn => `(() => { const ed = window.__gstrap.getCssEditor(); return (${fn})(ed) })()`

test('word operations, comment toggle, line ops, bracket jump, multicursor', async () => {
  const { app, appWindow } = await seededCss('.hero { color: red; }\n.footer { color: red; }\n')

  // Ctrl+Left equivalent: cursorWordLeft lands on the word start.
  const wordPos = await appWindow.evaluate(cssEd(`ed => {
    ed.setPosition({ lineNumber: 1, column: 21 })
    ed.trigger('e2e', 'cursorWordLeft', {})
    return ed.getPosition().column
  }`))
  expect(wordPos).toBeLessThan(21)

  // Ctrl+/ comments the line with css syntax.
  const commented = await appWindow.evaluate(cssEd(`ed => {
    ed.setPosition({ lineNumber: 1, column: 1 })
    ed.trigger('e2e', 'editor.action.commentLine', {})
    return ed.getModel().getLineContent(1)
  }`))
  expect(commented.startsWith('/*')).toBe(true)
  await appWindow.evaluate(cssEd(`ed => ed.trigger('e2e', 'editor.action.commentLine', {})`))

  // Alt+Down: move line 1 below line 2.
  const moved = await appWindow.evaluate(cssEd(`ed => {
    ed.setPosition({ lineNumber: 1, column: 1 })
    ed.trigger('e2e', 'editor.action.moveLinesDownAction', {})
    return ed.getModel().getLineContent(1)
  }`))
  expect(moved).toContain('.footer')
  await appWindow.evaluate(cssEd(`ed => ed.trigger('e2e', 'editor.action.moveLinesUpAction', {})`))

  // Ctrl+Shift+\\: jump from opening brace to its match.
  const bracketCol = await appWindow.evaluate(cssEd(`ed => {
    ed.setPosition({ lineNumber: 1, column: 7 })
    ed.trigger('e2e', 'editor.action.jumpToBracket', {})
    return ed.getPosition().column
  }`))
  expect(bracketCol).toBeGreaterThan(15)

  // Ctrl+D twice: both 'color' occurrences selected.
  const selections = await appWindow.evaluate(cssEd(`ed => {
    ed.setSelection({ startLineNumber: 1, startColumn: 9, endLineNumber: 1, endColumn: 14 })
    ed.trigger('e2e', 'editor.action.addSelectionToNextFindMatch', {})
    ed.trigger('e2e', 'editor.action.addSelectionToNextFindMatch', {})
    return ed.getSelections().length
  }`))
  expect(selections).toBe(2)

  await app.close()
})

test('color decorators render on css color values; hover shows property docs', async () => {
  const { app, appWindow } = await seededCss('.hero { color: #ff0000; background: #00ff00; }\n')

  await appWindow.waitForFunction(() =>
    document.querySelectorAll('.gstrap-cssp-host .colorpicker-color-decoration').length >= 2,
  null, { timeout: 10_000 })

  await appWindow.evaluate(cssEd(`ed => {
    ed.setPosition({ lineNumber: 1, column: 11 })   // inside 'color'
    ed.trigger('e2e', 'editor.action.showHover', {})
  }`))
  await appWindow.waitForFunction(() => {
    const hover = document.querySelector('.gstrap-cssp-host .monaco-hover')
    return !!hover && hover.textContent.length > 20
  }, null, { timeout: 10_000 })

  await app.close()
})

test('folding collapses a css rule', async () => {
  const { app, appWindow } = await seededCss(
    '.hero {\n  color: red;\n  margin: 0;\n}\n.hero-sub {\n  color: blue;\n}\n')

  // Fold-all hides the rule bodies: visible line count shrinks. Folding
  // ranges arrive async from the language worker — retry the (idempotent)
  // foldAll until they've landed.
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap.getCssEditor()
    ed.trigger('e2e', 'editor.foldAll', {})
    const visible = ed.getVisibleRanges()
      .reduce((n, r) => n + (r.endLineNumber - r.startLineNumber + 1), 0)
    return visible < 7
  }, null, { timeout: 10_000, polling: 250 })
  await appWindow.evaluate(cssEd(`ed => ed.trigger('e2e', 'editor.unfoldAll', {})`))

  await app.close()
})

// Linked editing runs against the file-tab editor: a php file tab has no
// canvas↔code sync rewriting the model mid-test (the page pair does), and
// the provider registers for html AND php.
test('linked editing renames the paired tag (php file tab)', async () => {
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-power-'))
  await openSeedProject(appWindow, join(projectDir, 'linked.gstrap'))

  await fsp.writeFile(join(projectDir, 'site', 'snippet.php'),
    '<article>linked pair</article>\n', 'utf8')
  await appWindow.waitForSelector('.gstrap-fm-item[data-fm-file="snippet.php"]', { timeout: 15_000 })
  await appWindow.dblclick('.gstrap-fm-item[data-fm-file="snippet.php"]')
  await appWindow.waitForFunction(() =>
    (window.__gstrap.getFileEditor?.()?.getModel()?.getValue() || '').includes('linked pair'),
  null, { timeout: 10_000 })

  await appWindow.evaluate(() => {
    const ed = window.__gstrap.getFileEditor()
    // Caret at the end of the opening tag name: <article|>
    ed.setPosition({ lineNumber: 1, column: 9 })
    ed.focus()
  })
  // Linked ranges are requested on caret move; type once they've settled.
  await appWindow.waitForTimeout(600)
  await appWindow.evaluate(() => {
    window.__gstrap.getFileEditor().trigger('keyboard', 'type', { text: 's' })
  })
  await appWindow.waitForFunction(() => {
    const v = window.__gstrap.getFileEditor().getModel().getValue()
    return v.includes('<articles>linked pair</articles>')
  }, null, { timeout: 5_000 })

  await app.close()
})
