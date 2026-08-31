/**
 * GrapeStrap — E2E: AI tool bridge (renderer executor)
 *
 * PATH: tests/e2e/ai-tools.spec.js
 * ROLE: Phase C specs for the renderer half of the tool bridge — a mutating
 *       tool reaching the canvas and reverting in ONE undo, two mutating tools
 *       in one turn fusing into ONE undo, the write-confirm Deny path,
 *       path-traversal refusal, and cancelling mid-confirm without wedging the
 *       panel. Fake mode (GSTRAP_AI_FAKE=1) drives real tool calls with no key
 *       and no network.
 * DEPENDS: @playwright/test, ./helpers.js, src/renderer/panels/ai/tool-executor.js,
 *          src/renderer/panels/ai/index.js, src/main/ai/fake-provider.js
 * CREATED: 2026-08-30
 *
 * Fake-provider tool script (src/main/ai/fake-provider.js):
 *   'FAKE:tool <name> <json>'  → runs that tool through the SAME bridge a real
 *                                provider uses, then streams
 *                                'Tool <name> returned: <result>'.
 *   'FAKE:tools <json-array>'  → runs [{name, input}, …] sequentially inside
 *                                ONE turn — the multi-tool undo-fusion path.
 *
 * ERROR SEMANTICS — worth knowing before reading the Deny and traversal specs.
 * An is_error tool result rejects main's parked promise (agent-session.js
 * handleToolResult), which is what makes the real SDK runner mark the result
 * is_error and let the model carry on. fake-provider.js calls tool.run()
 * directly with no catch, so under the fake seam that rejection escapes and
 * ends the TURN in state 'error' instead of producing a confirmation stream.
 * These specs therefore assert the error text reaching the transcript and the
 * side effect NOT happening on disk — both provider-independent — rather than
 * a follow-on model reply that only the real provider would produce.
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject } from './helpers.js'

// A file the tools can target that is guaranteed to exist and is not one the
// editor itself round-trips, so a spec's assertions cannot be disturbed by a
// background save.
const TARGET_FILE = 'site/ai-confirm-target.txt'
const TARGET_ORIGINAL = 'original contents'

/**
 * Wait for the AI panel to mount, then activate its tab so the transcript is
 * the visible one — the same thing a user does before answering a confirm.
 *
 * @param {import('@playwright/test').Page} appWindow
 * @returns {Promise<void>}
 */
async function openAiPanel(appWindow) {
  await appWindow.waitForFunction(
    () => !!document.querySelector('.gstrap-ai-host')
       && typeof window.__gstrap?.ai?.isRunning === 'function',
    null, { timeout: 20_000 }
  )
  await appWindow.evaluate(() => document.querySelector('.lm_tab[title="AI"]')?.click())
}

/**
 * Seed the overwrite target inside the open project.
 *
 * @param {import('@playwright/test').Page} appWindow
 * @returns {Promise<void>}
 */
function seedTargetFile(appWindow) {
  return appWindow.evaluate(
    ({ path, body }) => window.grapestrap.file.write(path, body),
    { path: TARGET_FILE, body: TARGET_ORIGINAL }
  )
}

/**
 * @param {import('@playwright/test').Page} appWindow
 * @returns {Promise<string>} the target file's current contents
 */
function readTargetFile(appWindow) {
  return appWindow.evaluate(path => window.grapestrap.file.read(path), TARGET_FILE)
}

/**
 * Send a prompt without waiting for its turn to finish.
 *
 * @param {import('@playwright/test').Page} appWindow
 * @param {string} prompt - text to send
 * @returns {Promise<void>}
 */
function startTurn(appWindow, prompt) {
  return appWindow.evaluate(text => window.__gstrap.ai.sendText(text), prompt)
}

/**
 * @param {import('@playwright/test').Page} appWindow
 * @returns {Promise<void>} resolves once no turn is in flight
 */
function waitForIdle(appWindow) {
  return appWindow.waitForFunction(
    () => window.__gstrap.ai.isRunning() === false, null, { timeout: 15_000 })
}

/**
 * @param {import('@playwright/test').Page} appWindow
 * @returns {Promise<Array<{role: string, text: string, kind: string}>>}
 */
function getTranscript(appWindow) {
  return appWindow.evaluate(() => window.__gstrap.ai.getTranscript())
}

/** @returns {Promise<string>} the canvas's current HTML */
function canvasHtml(appWindow) {
  return appWindow.evaluate(
    () => window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || '')
}

// ─── Spec 1 — a mutating tool reaches the canvas and undoes in one step ────
test('insert_html reaches the canvas and reverts with a single undo', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-aitools-insert-'))
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await openSeedProject(appWindow, join(projectDir, 'insert.gstrap'))
  await openAiPanel(appWindow)

  const before = await canvasHtml(appWindow)
  expect(before).not.toContain('ai-sec')

  await startTurn(
    appWindow,
    'FAKE:tool insert_html {"html":"<section class=\\"ai-sec\\"><p>from the agent</p></section>"}'
  )
  await waitForIdle(appWindow)

  // The tool ran against the real editor, not a stub.
  const after = await canvasHtml(appWindow)
  expect(after).toContain('ai-sec')
  expect(after).toContain('from the agent')

  // The tool row and the model's confirmation both landed in the transcript.
  const transcript = await getTranscript(appWindow)
  expect(transcript.some(entry => entry.kind === 'tool')).toBe(true)
  expect(transcript.some(
    entry => entry.role === 'assistant' && entry.text.includes('Tool insert_html returned:'))).toBe(true)

  // ONE undo through the real command route must take the whole insert back —
  // the append and the selection change that follows it are fused into a
  // single step (magic fusion, re-stamped per turn by tool-executor.js).
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'edit:undo'))
  await appWindow.waitForFunction(
    () => !(window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || '').includes('ai-sec'),
    null, { timeout: 5_000 }
  )
  expect(await canvasHtml(appWindow)).not.toContain('from the agent')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 2 — the fusion path: two mutating tools, still one undo ──────────
//
// The single-tool spec above short-circuits before the re-stamp ever runs
// (one recorded range, already one undo step). This is the spec that actually
// exercises closeTurnUndoGroup: two tool calls in one turn produce two
// separate magicFusionIndexes, and only the re-stamp collapses them.
test('two mutating tools in one turn collapse into a single undo step', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-aitools-fuse-'))
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await openSeedProject(appWindow, join(projectDir, 'fuse.gstrap'))
  await openAiPanel(appWindow)

  // Built with JSON.stringify rather than hand-escaped so the prompt cannot
  // drift from the shape the fake provider parses.
  const calls = [
    { name: 'insert_html', input: { html: '<section class="ai-sec-one"><p>first</p></section>' } },
    { name: 'insert_html', input: { html: '<section class="ai-sec-two"><p>second</p></section>' } }
  ]
  await startTurn(appWindow, `FAKE:tools ${JSON.stringify(calls)}`)
  await waitForIdle(appWindow)

  const afterTools = await canvasHtml(appWindow)
  expect(afterTools).toContain('ai-sec-one')
  expect(afterTools).toContain('ai-sec-two')

  // Both calls got their own row, and neither is still claiming to be running.
  const transcript = await getTranscript(appWindow)
  const toolRows = transcript.filter(entry => entry.kind === 'tool')
  expect(toolRows).toHaveLength(2)
  for (const row of toolRows) expect(row.text).not.toMatch(/running/i)

  // ONE undo, both gone. Without the per-turn re-stamp this takes two.
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'edit:undo'))
  await appWindow.waitForFunction(
    () => !(window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || '').includes('ai-sec-two'),
    null, { timeout: 5_000 }
  )
  const afterUndo = await canvasHtml(appWindow)
  expect(afterUndo).not.toContain('ai-sec-two')
  expect(afterUndo).not.toContain('ai-sec-one')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 3 — Deny on an overwrite leaves the file alone ───────────────────
test('write_file over an existing file asks first, and Deny leaves it unchanged', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-aitools-deny-'))
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await openSeedProject(appWindow, join(projectDir, 'deny.gstrap'))
  await openAiPanel(appWindow)
  await seedTargetFile(appWindow)

  await startTurn(
    appWindow,
    `FAKE:tool write_file {"path":"${TARGET_FILE}","content":"REPLACED BY THE AGENT"}`
  )

  // The write parks behind an inline confirm row instead of just happening.
  await appWindow.waitForFunction(
    () => !!document.querySelector('.gstrap-ai-host .gstrap-ai-confirm'), null, { timeout: 10_000 })

  const confirmRow = await appWindow.evaluate(() => {
    const row = document.querySelector('.gstrap-ai-host .gstrap-ai-confirm')
    return {
      kind: row.dataset.aiKind,
      text: row.querySelector('.gstrap-ai-confirm-text')?.textContent || '',
      hasAllow: !!row.querySelector('.gstrap-ai-confirm-allow'),
      hasDeny: !!row.querySelector('.gstrap-ai-confirm-deny'),
      callId: row.querySelector('.gstrap-ai-confirm-deny')?.dataset.aiCallId || '',
      pending: window.__gstrap.ai.hasPendingConfirm()
    }
  })
  expect(confirmRow.kind).toBe('confirm')
  expect(confirmRow.text).toContain(TARGET_FILE)
  expect(confirmRow.hasAllow).toBe(true)
  expect(confirmRow.hasDeny).toBe(true)
  expect(confirmRow.callId.length).toBeGreaterThan(0)
  expect(confirmRow.pending).toBe(true)

  // Still untouched while the question is open.
  expect(await readTargetFile(appWindow)).toBe(TARGET_ORIGINAL)

  await appWindow.evaluate(
    () => document.querySelector('.gstrap-ai-host .gstrap-ai-confirm-deny').click())
  await waitForIdle(appWindow)

  // The refusal reached the model as an is_error result, which under the fake
  // seam surfaces as a terminal error carrying the executor's own text.
  const transcript = await getTranscript(appWindow)
  const errorEntry = transcript.find(entry => entry.role === 'error')
  expect(errorEntry).toBeTruthy()
  expect(errorEntry.text).toContain('User denied the write.')

  // The safety property, independent of any provider: nothing was written.
  expect(await readTargetFile(appWindow)).toBe(TARGET_ORIGINAL)

  const settled = await appWindow.evaluate(() => ({
    confirmRows: document.querySelectorAll('.gstrap-ai-host .gstrap-ai-confirm').length,
    pending: window.__gstrap.ai.hasPendingConfirm(),
    state: document.querySelector('.gstrap-ai-host').dataset.aiState
  }))
  expect(settled.confirmRows).toBe(0)
  expect(settled.pending).toBe(false)
  expect(settled.state).toBe('idle')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 4 — traversal is refused before it reaches main ──────────────────
test('read_file refuses a path that climbs out of the project', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-aitools-path-'))
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await openSeedProject(appWindow, join(projectDir, 'path.gstrap'))
  await openAiPanel(appWindow)

  await startTurn(appWindow, 'FAKE:tool read_file {"path":"../x"}')
  await waitForIdle(appWindow)

  const transcript = await getTranscript(appWindow)
  const errorEntry = transcript.find(entry => entry.role === 'error')
  expect(errorEntry).toBeTruthy()
  expect(errorEntry.text).toContain('..')

  // No crash, no wedge: the panel is idle and the next turn still works.
  expect(await appWindow.evaluate(
    () => document.querySelector('.gstrap-ai-host').dataset.aiState)).toBe('idle')

  await startTurn(appWindow, 'still alive')
  await waitForIdle(appWindow)
  const afterRecovery = await getTranscript(appWindow)
  expect(afterRecovery.some(
    entry => entry.role === 'assistant' && entry.text === 'Echo: still alive')).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 5 — Stop while a confirm is parked must not wedge the panel ──────
test('cancelling while a write confirm is open returns the panel to idle', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-aitools-cancel-'))
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await openSeedProject(appWindow, join(projectDir, 'cancel.gstrap'))
  await openAiPanel(appWindow)
  await seedTargetFile(appWindow)

  await startTurn(
    appWindow,
    `FAKE:tool write_file {"path":"${TARGET_FILE}","content":"NEVER WRITTEN"}`
  )
  await appWindow.waitForFunction(
    () => !!document.querySelector('.gstrap-ai-host .gstrap-ai-confirm'), null, { timeout: 10_000 })

  // Stop instead of answering. main clears its parked tool call and emits a
  // terminal 'cancelled'; the panel has to drop the now-dead confirm row.
  await appWindow.evaluate(() => document.querySelector('.gstrap-ai-stop').click())
  await waitForIdle(appWindow)

  const settled = await appWindow.evaluate(() => ({
    confirmRows: document.querySelectorAll('.gstrap-ai-host .gstrap-ai-confirm').length,
    pending: window.__gstrap.ai.hasPendingConfirm(),
    state: document.querySelector('.gstrap-ai-host').dataset.aiState,
    stopHidden: document.querySelector('.gstrap-ai-stop').hidden,
    sendDisabled: document.querySelector('.gstrap-ai-send').disabled
  }))
  expect(settled.confirmRows).toBe(0)
  expect(settled.pending).toBe(false)
  expect(settled.state).toBe('idle')
  expect(settled.stopHidden).toBe(true)
  expect(settled.sendDisabled).toBe(false)

  // The abandoned write never happened.
  expect(await readTargetFile(appWindow)).toBe(TARGET_ORIGINAL)

  // And the panel still takes work — the real "no wedge" assertion.
  await startTurn(appWindow, 'after cancel')
  await waitForIdle(appWindow)
  const transcript = await getTranscript(appWindow)
  expect(transcript.some(
    entry => entry.role === 'assistant' && entry.text === 'Echo: after cancel')).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
