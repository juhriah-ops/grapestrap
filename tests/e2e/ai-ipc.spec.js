/**
 * GrapeStrap — E2E: AI agent panel IPC wiring
 *
 * PATH: tests/e2e/ai-ipc.spec.js
 * ROLE: Mechanical wiring specs for the v0.2 Phase A AI agent panel —
 *       proves window.grapestrap.ai.* round-trips through the preload
 *       bridge to ipc-handlers.js's `ai:*` block and into agent-session.js.
 *       Launches with GSTRAP_AI_FAKE=1 so agent-session.js drives
 *       fake-provider.js instead of a real Anthropic call — no project
 *       needs to be open, no network access or API key involved.
 * DEPENDS: @playwright/test, ./helpers.js, src/preload/preload.js,
 *          src/main/ipc-handlers.js, src/main/ai/agent-session.js (fake mode)
 * CREATED: 2026-08-30
 * UPDATED: 2026-08-30 (review pass) — added the FAKE:refusal case (a
 * zero-text "done" turn with stopReason 'refusal', not an 'error' state);
 * removed the "drop if flaky" hedge on the busy-turn spec — sendTurn claims
 * the single-flight slot synchronously, so two invokes queued in one
 * renderer tick are deterministic, not racy.
 *
 * Event payload shapes (pinned contract, matches agent-session.js):
 * 'ai:turn' pushes { turnId, state, stopReason?, error?, usage? } where state
 * is 'running' | 'done' | 'error' | 'cancelled' and, on 'error',
 * error.type / error.message are set; 'ai:delta' pushes { turnId, text }
 * where text is the next batched chunk.
 */
import { test, expect } from '@playwright/test'
import { launch } from './helpers.js'

test('ai:status resolves with provider/model/effort fields present', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })

  const status = await appWindow.evaluate(() => window.grapestrap.ai.status())

  expect(status.ok).toBe(true)
  expect(typeof status.provider).toBe('string')
  expect(status.provider.length).toBeGreaterThan(0)
  expect(typeof status.model).toBe('string')
  expect(status.model.length).toBeGreaterThan(0)
  expect(typeof status.effort).toBe('string')
  expect(status.effort.length).toBeGreaterThan(0)

  await app.close()
})

test('ai:send streams deltas that concatenate to non-empty text, ending in a matching "done" turn', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })

  // Subscribe BEFORE sending — a delta landing between send() resolving and
  // the subscription being wired would otherwise be lost.
  await appWindow.evaluate(() => {
    window.__aiDeltas = []
    window.__aiTurns = []
    window.grapestrap.ai.onDelta(p => window.__aiDeltas.push(p))
    window.grapestrap.ai.onTurn(p => window.__aiTurns.push(p))
  })

  const sendResult = await appWindow.evaluate(() => window.grapestrap.ai.send('FAKE:stream'))
  expect(sendResult.ok).toBe(true)
  expect(typeof sendResult.turnId).toBe('string')
  expect(sendResult.turnId.length).toBeGreaterThan(0)

  await appWindow.waitForFunction(
    turnId => window.__aiTurns?.some(t => t.turnId === turnId && t.state === 'done'),
    sendResult.turnId,
    { timeout: 10_000 }
  )

  const { deltas, turns } = await appWindow.evaluate(() => ({
    deltas: window.__aiDeltas,
    turns: window.__aiTurns
  }))

  // Every delta belongs to this turn — no cross-talk from another turnId.
  expect(deltas.length).toBeGreaterThan(0)
  for (const delta of deltas) expect(delta.turnId).toBe(sendResult.turnId)
  const fullText = deltas.map(d => d.text).join('')
  expect(fullText.length).toBeGreaterThan(0)

  const doneTurn = turns.find(t => t.state === 'done' && t.turnId === sendResult.turnId)
  expect(doneTurn).toBeTruthy()

  await app.close()
})

test('ai:send "FAKE:error auth" ends in a terminal ai:turn "error" state with error.type "auth"', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })

  await appWindow.evaluate(() => {
    window.__aiTurns = []
    window.grapestrap.ai.onTurn(p => window.__aiTurns.push(p))
  })

  const sendResult = await appWindow.evaluate(() => window.grapestrap.ai.send('FAKE:error auth'))
  expect(sendResult.ok).toBe(true)

  await appWindow.waitForFunction(
    turnId => window.__aiTurns?.some(t => t.turnId === turnId && t.state === 'error'),
    sendResult.turnId,
    { timeout: 10_000 }
  )

  const errorTurn = await appWindow.evaluate(
    turnId => window.__aiTurns.find(t => t.turnId === turnId && t.state === 'error'),
    sendResult.turnId
  )
  expect(errorTurn?.error?.type).toBe('auth')

  await app.close()
})

test('ai:send "FAKE:refusal" ends in a "done" turn with stopReason "refusal" and no meaningful text', async () => {
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })

  // A refusal is a completed turn, not an error — it must never surface
  // through the 'error' state.
  await appWindow.evaluate(() => {
    window.__aiDeltas = []
    window.__aiTurns = []
    window.grapestrap.ai.onDelta(p => window.__aiDeltas.push(p))
    window.grapestrap.ai.onTurn(p => window.__aiTurns.push(p))
  })

  const sendResult = await appWindow.evaluate(() => window.grapestrap.ai.send('FAKE:refusal'))
  expect(sendResult.ok).toBe(true)

  await appWindow.waitForFunction(
    turnId => window.__aiTurns?.some(t => t.turnId === turnId && t.state === 'done'),
    sendResult.turnId,
    { timeout: 10_000 }
  )

  const { deltas, turns } = await appWindow.evaluate(() => ({
    deltas: window.__aiDeltas,
    turns: window.__aiTurns
  }))

  const doneTurn = turns.find(t => t.state === 'done' && t.turnId === sendResult.turnId)
  expect(doneTurn).toBeTruthy()
  expect(doneTurn.error).toBeFalsy()
  expect(doneTurn.stopReason).toBe('refusal')

  // No assertion on history here on purpose — a zero-text terminal popping
  // the user message back out of history is agent-session.js's concern,
  // not this IPC-wiring spec's.
  const refusalText = deltas.filter(d => d.turnId === sendResult.turnId).map(d => d.text).join('').trim()
  expect(refusalText.length).toBe(0)

  await app.close()
})

test('ai:send while a turn is streaming rejects the second call as busy', async () => {
  // Deterministic, not racy: both invokes are queued in the same renderer
  // tick (Promise.all fires them before either awaits), and sendTurn claims
  // its single-flight slot synchronously on entry — the second call always
  // lands while the first still holds it.
  const { app, appWindow } = await launch({ GSTRAP_AI_FAKE: '1' })

  await appWindow.evaluate(() => {
    window.__aiTurns = []
    window.grapestrap.ai.onTurn(p => window.__aiTurns.push(p))
  })

  const [first, second] = await appWindow.evaluate(() =>
    Promise.all([
      window.grapestrap.ai.send('FAKE:stream'),
      window.grapestrap.ai.send('FAKE:stream')
    ])
  )

  expect(first.ok).toBe(true)
  expect(second.ok).toBe(false)
  expect(second.error?.type).toBe('busy')

  // Drain the first turn to completion before closing, so the app doesn't
  // shut down mid-stream.
  await appWindow.waitForFunction(
    turnId => window.__aiTurns?.some(t => t.turnId === turnId && (t.state === 'done' || t.state === 'error')),
    first.turnId,
    { timeout: 10_000 }
  )

  await app.close()
})
