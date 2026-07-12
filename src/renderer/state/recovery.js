/**
 * GrapeStrap — Crash recovery (renderer half)
 *
 * PATH: src/renderer/state/recovery.js
 * ROLE: Interval snapshot loop (prefs-driven, default 30s, dirty-only) that
 *       writes .gstrap.recovery next to the project manifest, plus the boot
 *       and per-open recovery offers and the restore/discard orchestration.
 *       Capture is NON-destructive (no rebuildCanvasFromCode — that resets
 *       canvas selection); restore lands in projectState only and touches
 *       no site/ files — the user keeps recovered work with a normal save.
 *       Clearing matrix: main clears on save (project-manager.js saveProject);
 *       this module clears on the dirty→clean transition, on user Discard,
 *       and on invalid/stale snapshots. Restore keeps the file until save.
 * DEPENDS: state/event-bus, state/project-state, state/page-state,
 *          editor/grapesjs-init (getCanvasHtml), editor/canvas-sync
 *          (getCodeEditorValue), shared/page-html, panels/library-items/
 *          propagate (updateHtml), dialogs/recovery, log,
 *          window.grapestrap.project.{readRecovery,writeRecovery,clearRecovery,open,recent,addRecent}
 * CREATED: 2026-07-12
 */

import { eventBus } from './event-bus.js'
import { projectState } from './project-state.js'
import { pageState } from './page-state.js'
import { getCanvasHtml } from '../editor/grapesjs-init.js'
import { getCodeEditorValue } from '../editor/canvas-sync.js'
import { isFullHtmlDocument, extractPageFromFullHtml } from '../../shared/page-html.js'
import { updateHtml } from '../panels/library-items/propagate.js'
import { extractRegions, composeFromTemplate } from '../panels/templates/propagate.js'
import { showRecoveryDialog } from '../dialogs/recovery.js'
import { log } from '../log.js'

// ─── User-facing strings ─────────────────────────────────────────────────────
// i18n NOTE (Wave 1 rule): every user-visible string in this module lives in
// this block so the Wave 4 t() extraction sweep can convert it mechanically.
// The i18n runtime (src/renderer/i18n.js) is being built in parallel and may
// land after this file — do not scatter literals below this block.
const UI_STRINGS = {
  restoredToast: when => `Recovered unsaved changes from ${when}. Save to keep them.`,
  staleToast: 'Recovery snapshot was older than the last save — discarded.',
  restoreFailedToast: msg => `Could not restore unsaved changes: ${msg}`,
  snapshotFailedToast: 'Crash-recovery snapshots are failing — check disk space. See the log for details.',
  unknownTime: 'an earlier session'
}

const SNAPSHOT_SCHEMA_VERSION = 1
const DEFAULT_INTERVAL_SECONDS = 30
const MIN_INTERVAL_SECONDS = 1
const MAX_INTERVAL_SECONDS = 3600

// Observable state — exposed on window.__gstrap (renderer/main.js) so the
// e2e specs can wait on deterministic flags instead of sleeping.
export const recoveryState = {
  bootCheckDone: false,   // checkRecoveryAtBoot() finished (dialog resolved or nothing to offer)
  running: false,         // snapshot loop armed for the open project
  lastWriteAt: null,      // ISO timestamp of the last successful snapshot write
  offeredFor: null        // manifestPath the dialog was last shown for
}

let timer = null
let activeManifestPath = null
let openSeq = 0             // guards the async gap in onProjectOpened against rapid open/close
let wasDirty = false        // last observed isDirty(), for transition detection
let writing = false         // a snapshot write is in flight (ticks skip, never queue)
let pendingWrite = Promise.resolve()  // resolves after the last write's IPC round-trip completed
let lastPayloadJson = null  // dedupe: skip writes when nothing changed since the last one
let restoring = false       // suppresses the per-open offer while restore re-opens the project
let warnedWriteFailure = false

/**
 * Register listeners. Call once at boot, before any project can open.
 * Failure modes: none — pure subscription.
 */
export function wireRecovery() {
  eventBus.on('project:opened', project => {
    onProjectOpened(project).catch(err => log.error('recovery: open handler failed:', err))
  })
  eventBus.on('project:closed', stopLoop)
  eventBus.on('project:dirty-changed', onDirtyChanged)
}

/**
 * Launch-time check: scan the recents list for a leftover recovery snapshot
 * and offer the most recent one. Call AFTER showWelcomeIfFirstRun() so the
 * two modals never stack. Never throws; always flips bootCheckDone.
 */
export async function checkRecoveryAtBoot() {
  try {
    if (projectState.current) return   // defensive: something already opened a project
    const recents = await window.grapestrap.project.recent()
    for (const entry of Array.isArray(recents) ? recents : []) {
      if (!entry?.path) continue
      // readRecovery returns null for missing, unreadable, or unparsable
      // files — a vanished project dir took its recovery file with it, so
      // that case lands here too and is silently skipped.
      const snapshot = await window.grapestrap.project.readRecovery(entry.path)
      if (!snapshot) continue
      if (!isValidSnapshot(snapshot)) {
        log.warn('recovery: invalid snapshot cleared:', entry.path)
        await window.grapestrap.project.clearRecovery(entry.path)
        continue
      }
      await offerSnapshot(entry.path, snapshot)
      break   // one offer per boot; other crashed projects surface on open
    }
  } catch (err) {
    log.error('recovery: boot check failed:', err)
  } finally {
    recoveryState.bootCheckDone = true
  }
}

// ─── Loop lifecycle ──────────────────────────────────────────────────────────

async function onProjectOpened(project) {
  stopLoop()
  const path = project?.manifestPath || projectState.current?.manifestPath || null
  if (!path) {
    log.warn('recovery: opened project has no manifestPath — snapshot loop not started')
    return
  }
  const seq = ++openSeq
  const seconds = await readIntervalSeconds()
  // The await above can straddle a close or another open — bail if superseded.
  if (seq !== openSeq || projectState.current?.manifestPath !== path) return
  activeManifestPath = path
  wasDirty = projectState.isDirty()
  lastPayloadJson = null
  warnedWriteFailure = false
  timer = setInterval(() => {
    tick().catch(err => log.error('recovery: tick failed:', err))
  }, seconds * 1000)
  recoveryState.running = true
  log.info(`recovery: snapshot loop armed (${seconds}s) for ${path}`)

  // Per-open offer: a crashed project that fell off the recents list (or was
  // opened while another boot offer was declined) still gets its prompt.
  // Suppressed during restore — restore re-opens the project itself.
  if (!restoring) {
    offerIfRecoveryExists(path).catch(err => log.error('recovery: on-open check failed:', err))
  }
}

function stopLoop() {
  if (timer) clearInterval(timer)
  timer = null
  activeManifestPath = null
  wasDirty = false
  lastPayloadJson = null
  recoveryState.running = false
}

/**
 * Dirty→clean without a project switch means the unsaved work is gone —
 * either saved (main already cleared the file) or reverted (undo back to
 * clean, code revert). Clear so the file never offers edits the user no
 * longer has. Reads isDirty() directly: one emitter passes no payload
 * (menu-router cmdNewPage), so the event arg can't be trusted.
 */
function onDirtyChanged() {
  const isDirtyNow = projectState.isDirty()
  if (wasDirty && !isDirtyNow && activeManifestPath) {
    const path = activeManifestPath
    const settled = pendingWrite
    ;(async () => {
      try {
        // Await the in-flight write first — its IPC resolves only after the
        // main-process handler completed, so the clear below provably runs
        // after any write that raced a save's own clear. Final state: no file.
        await settled
        await window.grapestrap.project.clearRecovery(path)
        lastPayloadJson = null
      } catch (err) {
        log.error('recovery: clear-on-clean failed:', err)
      }
    })()
  }
  wasDirty = isDirtyNow
}

// ─── Snapshot capture ────────────────────────────────────────────────────────

async function tick() {
  if (!activeManifestPath || !projectState.current) return
  if (!projectState.isDirty()) return
  if (writing) return   // slow disk: skip, don't queue — next tick retries
  const envelope = buildSnapshotEnvelope()
  if (!envelope) return
  // Dedupe BEFORE stamping the timestamp so an idle dirty project doesn't
  // rewrite an identical snapshot every tick.
  const payloadJson = JSON.stringify(envelope)
  if (payloadJson === lastPayloadJson) return
  envelope.savedAt = new Date().toISOString()
  const path = activeManifestPath
  writing = true
  pendingWrite = (async () => {
    try {
      await window.grapestrap.project.writeRecovery(path, envelope)
      lastPayloadJson = payloadJson
      recoveryState.lastWriteAt = envelope.savedAt
    } catch (err) {
      log.error('recovery: snapshot write failed:', err)
      if (!warnedWriteFailure) {
        warnedWriteFailure = true   // one toast per project session; log has the rest
        eventBus.emit('toast', { type: 'warning', message: UI_STRINGS.snapshotFailedToast })
      }
    } finally {
      writing = false
    }
  })()
  await pendingWrite
}

/**
 * Full project state as one plain object, with the active tab's live edits
 * overlaid non-destructively. Returns null when the state can't be cloned
 * (a plugin stuffed a live ref into the project) — skip the tick, never
 * write a corrupt snapshot.
 */
function buildSnapshotEnvelope() {
  let project
  try {
    project = structuredClone(projectState.current)
  } catch (err) {
    log.error('recovery: project state not cloneable — snapshot skipped:', err)
    return null
  }
  overlayActiveTab(project)
  return {
    version: SNAPSHOT_SCHEMA_VERSION,
    manifestPath: activeManifestPath,
    projectName: project.manifest?.metadata?.name || '',
    dirty: projectState.snapshot(),
    project
    // savedAt stamped by tick() after the dedupe compare
  }
}

/**
 * Canvas/Monaco hold the freshest content for the ACTIVE tab; projectState
 * only hears about it on tab-swap or save-flush. Mirror the save flush's
 * authority rule (menu-router flushActiveTabIntoProject: code AND split are
 * code-authoritative) but read buffers instead of rebuilding the canvas —
 * rebuildCanvasFromCode() resets selection, unacceptable on a timer.
 */
function overlayActiveTab(projectCopy) {
  const tab = pageState.active()
  if (!tab || !projectCopy) return

  if (tab.viewMode === 'code' || tab.viewMode === 'split') {
    const raw = getCodeEditorValue()
    if (raw == null) return   // Monaco not bound yet — keep last-flushed state
    if (tab.kind === 'library') {
      const item = (projectCopy.libraryItems || []).find(it => it.id === tab.pageName)
      if (item) item.html = raw
      return
    }
    if (tab.kind === 'template') {
      const tpl = (projectCopy.templates || []).find(tp => tp.name === tab.pageName)
      if (tpl) tpl.html = raw    // template tabs are body-only in Code view
      return
    }
    const page = (projectCopy.pages || []).find(p => p.name === tab.pageName)
    if (!page) return
    if (isFullHtmlDocument(raw)) {
      const { body, head } = extractPageFromFullHtml(raw)
      page.html = body
      page.head = { ...(page.head || {}), ...head }
    } else {
      page.html = raw
    }
    return
  }

  const captured = getCanvasHtml()   // read-only; '' before GrapesJS init
  if (!captured) return
  if (tab.kind === 'library') {
    const item = (projectCopy.libraryItems || []).find(it => it.id === tab.pageName)
    if (item) item.html = captured
  } else if (tab.kind === 'template') {
    const tpl = (projectCopy.templates || []).find(tp => tp.name === tab.pageName)
    if (tpl) tpl.html = captured
  } else {
    const page = (projectCopy.pages || []).find(p => p.name === tab.pageName)
    if (page) page.html = captured
  }
}

// ─── Offer / restore / discard ───────────────────────────────────────────────

async function offerIfRecoveryExists(manifestPath) {
  const snapshot = await window.grapestrap.project.readRecovery(manifestPath)
  if (!snapshot) return
  if (!isValidSnapshot(snapshot)) {
    log.warn('recovery: invalid snapshot cleared:', manifestPath)
    await window.grapestrap.project.clearRecovery(manifestPath)
    return
  }
  await offerSnapshot(manifestPath, snapshot)
}

async function offerSnapshot(manifestPath, snapshot) {
  recoveryState.offeredFor = manifestPath
  const choice = await showRecoveryDialog(snapshot)
  if (choice === 'restore') {
    await restoreSnapshot(manifestPath, snapshot)
  } else {
    await window.grapestrap.project.clearRecovery(manifestPath)
    log.info('recovery: snapshot discarded by user:', manifestPath)
  }
}

/**
 * Restore = reproduce the pre-crash IN-MEMORY state. Loads the project fresh
 * from disk, overlays the snapshot BEFORE the UI sees it (so every panel
 * paints restored content through the normal project:opened path), re-marks
 * the dirty sets, and replays library-item propagation the pre-crash
 * tab-swap/save would have done. Writes nothing to site/ — the recovery file
 * itself is kept until the user saves (a crash between restore and first
 * save must not lose the work twice).
 */
async function restoreSnapshot(manifestPath, snapshot) {
  restoring = true
  try {
    const fresh = await window.grapestrap.project.open(manifestPath)
    if (!fresh) throw new Error('project did not load')

    // Staleness fence: if the project was saved AFTER this snapshot was
    // taken, the save's clear must have failed — disk wins, never overlay
    // older edits on top of a newer save.
    const lastSavedAt = Date.parse(fresh.manifest?.metadata?.lastSavedAt || '')
    const snapAt = Date.parse(snapshot.savedAt || '')
    if (Number.isFinite(lastSavedAt) && Number.isFinite(snapAt) && lastSavedAt > snapAt) {
      log.warn('recovery: snapshot predates last save — discarded:', manifestPath)
      await window.grapestrap.project.clearRecovery(manifestPath)
      eventBus.emit('toast', { type: 'warning', message: UI_STRINGS.staleToast })
      openIntoUi(fresh, null)
      return
    }

    const touchedPages = overlaySnapshot(fresh, snapshot)
    openIntoUi(fresh, firstRestoredPageName(fresh, snapshot))
    remarkDirty(snapshot, touchedPages)

    const when = formatWhen(snapshot.savedAt)
    eventBus.emit('toast', { type: 'success', message: UI_STRINGS.restoredToast(when) })
    log.info('recovery: snapshot restored into project state:', manifestPath)
  } catch (err) {
    log.error('recovery: restore failed:', err)
    eventBus.emit('toast', {
      type: 'error',
      message: UI_STRINGS.restoreFailedToast(err?.message || String(err))
    })
    // Recovery file deliberately kept — the JSON is hand-salvageable.
  } finally {
    restoring = false
  }
}

/**
 * Merge snapshot content onto a fresh-from-disk project object (NOT yet in
 * projectState). Pages/templates by name, library items by id; items missing
 * on disk are re-added (an unsaved new page exists only in memory). Then
 * replay library propagation for dirty items using the pure updateHtml
 * helper. Returns the Set of page names propagation touched.
 */
function overlaySnapshot(fresh, snapshot) {
  const snap = snapshot.project

  for (const sp of snap.pages || []) {
    const page = (fresh.pages || []).find(p => p.name === sp.name)
    if (page) {
      page.html = sp.html
      page.head = sp.head ?? page.head
      page.file = sp.file || page.file
      page.templateName = sp.templateName ?? page.templateName
      page.regions = sp.regions ?? page.regions
    } else {
      fresh.pages.push(sp)
    }
  }
  for (const st of snap.templates || []) {
    const tpl = (fresh.templates || []).find(t => t.name === st.name)
    if (tpl) { tpl.html = st.html; tpl.file = st.file || tpl.file; tpl.regions = st.regions ?? tpl.regions }
    else (fresh.templates = fresh.templates || []).push(st)
  }
  for (const si of snap.libraryItems || []) {
    const item = (fresh.libraryItems || []).find(l => l.id === si.id)
    if (item) { item.html = si.html; item.file = si.file || item.file }
    else (fresh.libraryItems = fresh.libraryItems || []).push(si)
  }
  if (typeof snap.globalCSS === 'string') fresh.globalCSS = snap.globalCSS
  if (Array.isArray(snap.snippets)) fresh.snippets = snap.snippets
  // metadata only (name/favicon edits); structural manifest fields (pages[],
  // templates[]) are derived from the arrays above at save time.
  if (snap.manifest?.metadata) {
    fresh.manifest.metadata = { ...fresh.manifest.metadata, ...snap.manifest.metadata }
  }

  // Propagation replay: a library tab active at crash time never fanned out
  // (that happens on tab-swap/save). Do it on the fresh object BEFORE the
  // canvas paints, via the pure helper — no GrapesJS involvement.
  const touchedPages = new Set()
  for (const id of snapshot.dirty?.library || []) {
    const item = (fresh.libraryItems || []).find(l => l.id === id)
    if (!item) continue
    for (const page of fresh.pages || []) {
      const updated = updateHtml(page.html || '', id, item.html ?? '')
      if (updated !== page.html) {
        page.html = updated
        touchedPages.add(page.name)
      }
    }
  }
  // Same replay for templates: a template tab active at crash time never
  // fanned out. Pure recomposition on the fresh object — no GrapesJS, and
  // deliberately NOT propagateTemplate (that mutates projectState, which
  // isn't set yet at this point in restore); mirror the library replay's
  // pure-helper pattern.
  for (const name of snapshot.dirty?.templates || []) {
    const tpl = (fresh.templates || []).find(t => t.name === name)
    if (!tpl) continue
    for (const page of fresh.pages || []) {
      if (page.templateName !== name) continue
      const { regions } = extractRegions(page.html || '')
      const updated = composeFromTemplate(tpl.html ?? '', regions)
      if (updated !== page.html) {
        page.html = updated
        touchedPages.add(page.name)
      }
    }
  }
  return touchedPages
}

/** Route the restored project through the normal open path — no special repaint. */
function openIntoUi(fresh, pageName) {
  pageState.closeAll()
  projectState.set(fresh)   // emits project:opened → loop re-arms, panels paint
  const name = pageName || fresh.pages?.[0]?.name
  if (name) pageState.open(name)
  window.grapestrap.project
    .addRecent(fresh.manifestPath, fresh.manifest?.metadata?.name || '')
    .catch(err => log.warn('recovery: addRecent failed:', err?.message || err))
}

/**
 * Re-mark the dirty sets through the mark* methods (never by poking the Sets
 * directly — subscribers must hear project:dirty-changed; see the bypass-class
 * warning in project-state.js markAllClean).
 */
function remarkDirty(snapshot, touchedPages) {
  const dirty = snapshot.dirty || {}
  for (const name of new Set([...(dirty.pages || []), ...touchedPages])) {
    projectState.markPageDirty(name)
  }
  for (const name of dirty.templates || []) projectState.markTemplateDirty(name)
  for (const id of dirty.library || []) projectState.markLibraryDirty(id)
  for (const id of dirty.snippets || []) projectState.markSnippetsDirty(id)
  if (dirty.globalCss) projectState.markCssDirty()
  if (dirty.manifest) projectState.markManifestDirty()
}

// ─── Small helpers ───────────────────────────────────────────────────────────

function isValidSnapshot(s) {
  return !!s && typeof s === 'object' &&
    s.version === SNAPSHOT_SCHEMA_VERSION &&
    !!s.project && typeof s.project === 'object' &&
    Array.isArray(s.project.pages)
}

async function readIntervalSeconds() {
  let value = null
  try { value = await window.grapestrap.prefs.get('general.autosaveIntervalSeconds') }
  catch (err) { log.warn('recovery: prefs read failed, using default interval:', err?.message || err) }
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_SECONDS
  return Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, Math.round(n)))
}

function firstRestoredPageName(fresh, snapshot) {
  const candidate = snapshot.dirty?.pages?.[0]
  if (candidate && (fresh.pages || []).some(p => p.name === candidate)) return candidate
  return null
}

function formatWhen(iso) {
  const t = Date.parse(iso || '')
  return Number.isFinite(t) ? new Date(t).toLocaleString() : UI_STRINGS.unknownTime
}
