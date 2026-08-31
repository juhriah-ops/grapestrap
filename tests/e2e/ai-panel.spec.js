/**
 * GrapeStrap — E2E: AI agent chat panel (renderer)
 *
 * PATH: tests/e2e/ai-panel.spec.js
 * ROLE: Phase B specs for the AI chat panel — GL registration, escaped
 *       streaming render, transcript survival across Reset Layout, and the
 *       host's data-ai-state lifecycle. Launches with GSTRAP_AI_FAKE=1 so
 *       agent-session.js drives fake-provider.js: no key, no network, no
 *       project needs to be open.
 * DEPENDS: @playwright/test, ./helpers.js, src/renderer/panels/ai/index.js,
 *          src/renderer/panels/ai/chat-state.js, src/main/ai/fake-provider.js
 * CREATED: 2026-08-30
 *
 * Pinned contract (what these specs hold the panel to):
 *   - host element carries .gstrap-ai-host plus data-ai-state="idle|running"
 *     and data-ai-linked="true|false"
 *   - transcript rows are .gstrap-ai-msg[data-ai-id]; the transient "thinking"
 *     indicator deliberately carries NO data-ai-id, so it never counts as one
 *   - window.__gstrap.ai = { getTranscript(), isRunning(), sendText(text) }
 *   - model text is written with textContent — markup in a reply must render
 *     as visible characters, never as elements
 *
 * Fake-provider script used here (see src/main/ai/fake-provider.js):
 *   'FAKE:stream'      → five deltas concatenating to
 *                        'Fake streaming response in five chunks.'
 *   'FAKE:error auth'  → terminal 'error' turn, error.type 'auth'
 *   anything else      → 'Echo: <prompt>' in two deltas
 */
import { test, expect } from '@playwright/test'
import { launch } from './helpers.js'

const STREAM_PROMPT = 'FAKE:stream'
const STREAM_REPLY = 'Fake streaming response in five chunks.'

/**
 * Wait until the AI panel has mounted and published its test surface.
 *
 * @param {import('@playwright/test').Page} appWindow
 * @returns {Promise<void>}
 */
async function waitForAiPanel(appWindow) {
  await appWindow.waitForFunction(
    () => !!document.querySelector('.gstrap-ai-host')
       && typeof window.__gstrap?.ai?.isRunning === 'function',
    null, { timeout: 20_000 }
  )
}

/**
 * @param {import('@playwright/test').Page} appWindow
 * @returns {Promise<Array<{role: string, text: string, kind: string}>>}
 */
function getTranscript(appWindow) {
  return appWindow.evaluate(() => window.__gstrap.ai.getTranscript())
}

/**
 * Drive one message through the composer and wait for its turn to terminate.
 *
 * isRunning() only goes false on a terminal ai:turn event, which main emits
 * after the last delta has been flushed — so once it clears, the transcript
 * is complete for that turn.
 *
 * @param {import('@playwright/test').Page} appWindow
 * @param {string} text - the prompt to send
 * @returns {Promise<void>}
 */
async function sendAndSettle(appWindow, text) {
  await appWindow.evaluate(message => window.__gstrap.ai.sendText(message), text)
  await appWindow.waitForFunction(
    () => window.__gstrap.ai.isRunning() === false, null, { timeout: 10_000 }
  )
}

// ─── Spec 1 — the panel is a real GL tab, not just a module ────────────────
test('AI panel is a right-stack tab and renders its chat shell', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await waitForAiPanel(appWindow)

  const panel = await appWindow.evaluate(() => {
    // The right stack is identified by the DOM-tree host it already holds —
    // the same anchor workspaces.spec.js and bootstrap-css-panel.spec.js use
    // to read that stack's tab titles.
    const rightStack = document.querySelector('.lm_item.lm_stack:has(.gstrap-dom-host)')
    const host = document.querySelector('.gstrap-ai-host')
    return {
      tabTitles: rightStack ? [...rightStack.querySelectorAll('.lm_tab')].map(tab => tab.title) : [],
      aiIsInRightStack: !!(rightStack && host && rightStack.contains(host)),
      hostCount: document.querySelectorAll('.gstrap-ai-host').length,
      hasTranscript: !!host?.querySelector('.gstrap-ai-transcript'),
      hasComposer: !!host?.querySelector('.gstrap-ai-composer'),
      hasInput: !!host?.querySelector('.gstrap-ai-input'),
      hasSend: !!host?.querySelector('.gstrap-ai-send'),
      hasReset: !!host?.querySelector('.gstrap-ai-reset'),
      hasEmptyState: !!host?.querySelector('.gstrap-ai-empty'),
      emptyStateVisible: host?.querySelector('.gstrap-ai-empty')?.hidden === false,
      state: host?.dataset.aiState,
      linked: host?.dataset.aiLinked
    }
  })

  expect(panel.tabTitles).toContain('AI')          // from the panel.ai message key
  expect(panel.aiIsInRightStack).toBe(true)
  expect(panel.hostCount).toBe(1)
  expect(panel.hasTranscript).toBe(true)
  expect(panel.hasComposer).toBe(true)
  expect(panel.hasInput).toBe(true)
  expect(panel.hasSend).toBe(true)
  expect(panel.hasReset).toBe(true)
  // Nothing sent yet, so the guidance block is the only thing in the transcript.
  expect(panel.hasEmptyState).toBe(true)
  expect(panel.emptyStateVisible).toBe(true)
  expect(panel.state).toBe('idle')
  // The fake provider needs no credential, so ai:status reports hasKey.
  expect(panel.linked).toBe('true')

  await app.close()
})

// ─── Spec 2 — model output is text, never markup ───────────────────────────
test('streamed and echoed model text renders escaped, never as elements', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await waitForAiPanel(appWindow)

  await sendAndSettle(appWindow, STREAM_PROMPT)

  const streamed = await getTranscript(appWindow)
  expect(streamed.map(entry => entry.role)).toEqual(['user', 'assistant'])
  // Five separate deltas have to land in one assistant row, in order.
  expect(streamed[1].text).toBe(STREAM_REPLY)

  // Now push markup through the echo branch. It arrives as model output, so
  // it must show up as characters the user can read — not as a bold element.
  const markup = '<b>hi</b>'
  await sendAndSettle(appWindow, markup)
  await appWindow.waitForFunction(
    expected => window.__gstrap.ai.getTranscript().some(
      entry => entry.role === 'assistant' && entry.text === expected),
    `Echo: ${markup}`, { timeout: 10_000 }
  )

  const rendered = await appWindow.evaluate(() => {
    const rows = [...document.querySelectorAll('.gstrap-ai-host .gstrap-ai-msg[data-ai-id]')]
    return {
      text: rows.map(row => row.textContent).join('\n'),
      html: rows.map(row => row.innerHTML).join('\n'),
      boldElementCount: document.querySelectorAll('.gstrap-ai-host .gstrap-ai-msg b').length
    }
  })

  expect(rendered.text).toContain('<b>hi</b>')            // the user's own row
  expect(rendered.text).toContain(`Echo: ${markup}`)      // the model's reply
  expect(rendered.boldElementCount).toBe(0)               // nothing was parsed
  expect(rendered.html).not.toContain('<b>')
  expect(rendered.html).toContain('&lt;b&gt;hi&lt;/b&gt;')

  await app.close()
})

// ─── Spec 3 — Reset Layout must not cost the conversation ──────────────────
//
// GL re-invokes every panel factory on Reset Layout. Without the module-held
// persistent root + module-scope transcript, the chat would be wiped; without
// the wire-once guard, the second mount would double every streamed chunk.
test('transcript survives Reset Layout and subscriptions stay single', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await waitForAiPanel(appWindow)

  await sendAndSettle(appWindow, STREAM_PROMPT)
  const before = await getTranscript(appWindow)
  expect(before).toHaveLength(2)

  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'view:reset-layout'))
  await appWindow.waitForTimeout(250)   // GL stateChanged rAF settle (workspaces.spec.js idiom)
  await appWindow.waitForFunction(
    () => document.querySelectorAll('.gstrap-ai-host').length === 1, null, { timeout: 5_000 }
  )

  expect(await getTranscript(appWindow)).toEqual(before)

  const rendered = await appWindow.evaluate(() => {
    const host = document.querySelector('.gstrap-ai-host')
    return {
      rowCount: host.querySelectorAll('.gstrap-ai-msg[data-ai-id]').length,
      transcriptText: host.querySelector('.gstrap-ai-transcript').textContent,
      state: host.dataset.aiState
    }
  })
  expect(rendered.rowCount).toBe(before.length)
  expect(rendered.transcriptText).toContain(STREAM_REPLY)
  expect(rendered.state).toBe('idle')

  // A second ai:delta subscription would render every chunk twice, so a
  // post-reset turn that echoes exactly once proves the guard held.
  await sendAndSettle(appWindow, 'post-reset')
  const after = await getTranscript(appWindow)
  expect(after).toHaveLength(4)
  expect(after[3]).toEqual({ role: 'assistant', text: 'Echo: post-reset', kind: 'message' })

  // ...and re-count the DOM, because a doubled chat-state subscription is
  // invisible to getTranscript(): the model stays clean while every change
  // paints twice. Row count is the only place that duplication shows.
  const rowsAfterReset = await appWindow.evaluate(() => {
    const host = document.querySelector('.gstrap-ai-host')
    return {
      count: host.querySelectorAll('.gstrap-ai-msg[data-ai-id]').length,
      uniqueIds: new Set(
        [...host.querySelectorAll('.gstrap-ai-msg[data-ai-id]')].map(row => row.dataset.aiId)
      ).size
    }
  })
  expect(rowsAfterReset.count).toBe(after.length)
  expect(rowsAfterReset.uniqueIds).toBe(after.length)

  await app.close()
})

// ─── Spec 5 — the empty state gets out of the way ──────────────────────────
//
// [hidden] only hides an element while nothing in the panel's own CSS gives
// it a display, so this asserts real visibility (offsetParent), not just the
// attribute the panel sets.
test('empty state hides once a message lands and returns after New chat', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await waitForAiPanel(appWindow)

  // offsetParent is null for content of a background GL tab (Properties is
  // the default-active right tab), so bring the AI tab to the front first —
  // same activation pattern as bootstrap-css-panel.spec.js.
  await appWindow.evaluate(() => {
    document.querySelector('.lm_tab[title="AI"]').click()
  })
  await appWindow.waitForFunction(
    () => document.querySelector('.gstrap-ai-host')?.offsetParent !== null,
    null, { timeout: 3_000 }
  )

  const readEmptyState = () => appWindow.evaluate(() => {
    const empty = document.querySelector('.gstrap-ai-host .gstrap-ai-empty')
    return {
      hiddenAttribute: empty.hidden,
      // offsetParent is null for anything display:none — the check that
      // catches a stylesheet overriding [hidden] back into view.
      visible: empty.offsetParent !== null,
      title: empty.textContent.trim()
    }
  })

  const beforeSend = await readEmptyState()
  expect(beforeSend.hiddenAttribute).toBe(false)
  expect(beforeSend.visible).toBe(true)
  expect(beforeSend.title.length).toBeGreaterThan(0)   // guidance text resolved

  await sendAndSettle(appWindow, STREAM_PROMPT)

  const afterSend = await readEmptyState()
  expect(afterSend.hiddenAttribute).toBe(true)
  expect(afterSend.visible).toBe(false)

  // New chat empties the transcript, so the guidance has to come back.
  await appWindow.evaluate(() => document.querySelector('.gstrap-ai-reset').click())
  await appWindow.waitForFunction(
    () => window.__gstrap.ai.getTranscript().length === 0, null, { timeout: 10_000 })

  const afterReset = await readEmptyState()
  expect(afterReset.hiddenAttribute).toBe(false)
  expect(afterReset.visible).toBe(true)

  const rowsAfterReset = await appWindow.evaluate(
    () => document.querySelectorAll('.gstrap-ai-host .gstrap-ai-msg[data-ai-id]').length)
  expect(rowsAfterReset).toBe(0)

  await app.close()
})

// ─── Spec 6 — a failed turn is reported, not swallowed ─────────────────────
test('a failed turn renders an error row and releases the panel to idle', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await waitForAiPanel(appWindow)

  await sendAndSettle(appWindow, 'FAKE:error auth')

  const transcript = await getTranscript(appWindow)
  const errorEntry = transcript.find(entry => entry.role === 'error')
  expect(errorEntry).toBeTruthy()
  expect(errorEntry.kind).toBe('auth')
  expect(errorEntry.text.trim().length).toBeGreaterThan(0)
  // ai.error.auth resolves through the catalog; with no catalog entry the
  // panel falls back to main's own message. A raw "ai.*" key reaching the
  // transcript means BOTH sources were empty.
  expect(errorEntry.text).not.toMatch(/^ai\./)

  const rendered = await appWindow.evaluate(() => {
    const host = document.querySelector('.gstrap-ai-host')
    const errorRow = host.querySelector('.gstrap-ai-msg-error')
    return {
      hasErrorRow: !!errorRow,
      errorText: errorRow?.textContent.trim() || '',
      errorKind: errorRow?.dataset.aiKind || '',
      state: host.dataset.aiState,
      sendDisabled: document.querySelector('.gstrap-ai-send').disabled,
      stopHidden: document.querySelector('.gstrap-ai-stop').hidden
    }
  })
  expect(rendered.hasErrorRow).toBe(true)
  expect(rendered.errorText.length).toBeGreaterThan(0)
  expect(rendered.errorKind).toBe('auth')
  // The turn ended, so the composer must be usable again — a stuck 'running'
  // would leave Send and Reset dead for the rest of the session.
  expect(rendered.state).toBe('idle')
  expect(rendered.stopHidden).toBe(true)
  // An auth failure re-probes ai:status; the fake provider needs no key, so
  // the panel stays linked and the composer stays enabled.
  expect(rendered.sendDisabled).toBe(false)

  await app.close()
})

// ─── Spec 4 — the running/idle lifecycle on the host ───────────────────────
test('data-ai-state flips to "running" during a turn and back to "idle"', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })
  await waitForAiPanel(appWindow)

  const initialState = await appWindow.evaluate(
    () => document.querySelector('.gstrap-ai-host').dataset.aiState)
  expect(initialState).toBe('idle')

  // Sample in the SAME tick the send is dispatched: the panel marks the turn
  // running synchronously, before it awaits ai.send(). Sampling after any
  // await would race the fake provider's five-chunk stream to the finish.
  const duringTurn = await appWindow.evaluate(() => {
    const host = document.querySelector('.gstrap-ai-host')
    const pending = window.__gstrap.ai.sendText('FAKE:stream')
    const sample = {
      state: host.dataset.aiState,
      running: window.__gstrap.ai.isRunning(),
      stopHidden: document.querySelector('.gstrap-ai-stop').hidden,
      sendDisabled: document.querySelector('.gstrap-ai-send').disabled
    }
    return pending.then(() => sample)
  })
  expect(duringTurn.state).toBe('running')
  expect(duringTurn.running).toBe(true)
  expect(duringTurn.stopHidden).toBe(false)     // Stop is the only live control
  expect(duringTurn.sendDisabled).toBe(true)

  await appWindow.waitForFunction(
    () => window.__gstrap.ai.isRunning() === false, null, { timeout: 10_000 })

  const afterTurn = await appWindow.evaluate(() => ({
    state: document.querySelector('.gstrap-ai-host').dataset.aiState,
    stopHidden: document.querySelector('.gstrap-ai-stop').hidden,
    sendDisabled: document.querySelector('.gstrap-ai-send').disabled,
    thinkingHidden: document.querySelector('.gstrap-ai-host [data-ai-kind="thinking"]').hidden
  }))
  expect(afterTurn.state).toBe('idle')
  expect(afterTurn.stopHidden).toBe(true)
  expect(afterTurn.sendDisabled).toBe(false)
  expect(afterTurn.thinkingHidden).toBe(true)

  await app.close()
})
