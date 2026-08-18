/**
 * GrapeStrap — Workspace layouts (renderer)
 *
 * PATH: src/renderer/layout/workspaces.js
 * ROLE: Capture/apply/save/delete/rename of named workspace layouts (Wave 3).
 *       A workspace = GL geometry + panel visibility (NOT view modes, devices
 *       or open tabs — those are session/tab state). Presets Designer/Coder/
 *       Compact are code-built clones of the LOCKED default config, never
 *       files. Owns the `__gstrap.workspaces` test surface and pushes the
 *       saved-name list to the native menu via menu:set-workspaces.
 * DEPENDS: layout/golden-layout-config.js (single owner of GL API calls),
 *          layout/panel-visibility.js, panels/view-toggles.js,
 *          dialogs/text-prompt.js, dialogs/workspace-manage.js, i18n.js,
 *          state/event-bus.js, preload bridge (grapestrap.workspaces/menu)
 * CREATED: 2026-07-12
 * UPDATED: 2026-08-18 — ensureCorePanels injects the Bootstrap panel into
 *          layouts saved before it existed
 *
 * Apply flow (PLAN.md §3.3): validate (fail open — F1/F2) → ensureCorePanels
 * (a saved layout predating a panel gains it, fail-open — 2026-08-18) →
 * normalizeFloors (floors are code-owned, re-derived ÷N per stack at apply
 * time — §3.4) → applyLayoutConfig → re-assert visibility through the existing
 * view-toggles surface (loadLayout orphans panel-visibility's WeakMap
 * snapshots — F6) → requestFullRelayout(). Boot behavior and the Reset Layout
 * contract (geometry only, visibility untouched) are unchanged; no boot
 * auto-restore.
 *
 * Name validation is duplicated here for inline dialog UX only — the
 * authoritative copy guards main-side I/O in src/main/workspace-store.js.
 */

import { eventBus } from '../state/event-bus.js'
import {
  getDefaultConfig, captureLayoutConfig, applyLayoutConfig,
  getRegisteredComponentTypes, getLayout, requestFullRelayout,
  resetLayout as glResetLayout, getPanelTitle, LAYOUT_FLOORS
} from './golden-layout-config.js'
import { getRightStackRestoreSizes } from './panel-visibility.js'
import { getVisibilityMap, applyVisibilityMap } from '../panels/view-toggles.js'
import { showTextPrompt } from '../dialogs/text-prompt.js'
import { showWorkspaceManageDialog } from '../dialogs/workspace-manage.js'
import { t } from '../i18n.js'
import { log } from '../log.js'

// Mirrors workspace-store.js (authoritative). ASCII-only for v0.1.0.
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,40}$/
const PRESET_NAMES = ['Designer', 'Coder', 'Compact']
const PRESET_SLUGS = new Set(PRESET_NAMES.map(n => n.toLowerCase()))

const ALL_VISIBLE = {
  tabsVisible: true, insertPanelVisible: true, propertyStripVisible: true,
  statusBarVisible: true, fileManagerVisible: true, domTreeVisible: true,
  propertiesPanelVisible: true, customCssVisible: true, bootstrapCssVisible: true
}

// Right-stack panels that must exist in EVERY applied layout, and the panels
// whose stack they belong beside. Saved workspaces predate later panels, and
// validateSpec only rejects UNKNOWN types — a config that simply lacks one is
// valid, so without ensureCorePanels a user with a saved layout would never
// see the new tab (and its View toggle would silently no-op). Order matters:
// the first anchor found wins.
const CORE_RIGHT_PANELS = ['bootstrap-css']
const RIGHT_STACK_ANCHORS = ['custom-css', 'properties', 'dom-tree']

// Saved-name cache: inline duplicate validation + native-menu pushes.
let savedNames = []
// The corrupt-file warning fires once per boot, not once per menu rebuild.
let skippedToastShown = false

const toast = (type, message) => eventBus.emit('toast', { type, message })

function slugFor(name) {
  return String(name).toLowerCase().replace(/ /g, '-')
}

// ─── Presets (§2.4 — built from the locked default, can never drift) ────────

function buildPreset(name) {
  const gl = getDefaultConfig()
  const visibility = { ...ALL_VISIBLE }
  const [left, center, right] = gl.root.content
  if (name === 'Coder') {
    left.width = 14
    center.width = 66
    right.width = 20
    right.activeItemIndex = 0            // DOM outline front-and-center
    visibility.insertPanelVisible = false
    visibility.propertyStripVisible = false
  } else if (name === 'Compact') {
    left.width = 12
    center.width = 76
    right.width = 12
    visibility.insertPanelVisible = false
    visibility.propertyStripVisible = false
    visibility.statusBarVisible = false
  }
  // Designer: default geometry as-is (identical to Reset Layout), all
  // panels re-asserted visible. Coder does NOT flip tabs into code view —
  // view mode is session state, not workspace shape (§2.3).
  return { formatVersion: 1, name, visibility, gl }
}

// ─── Capture ─────────────────────────────────────────────────────────────────

/** { gl, visibility } of the current arrangement, normalized to expanded
 *  stack sizes (F6) with maximize state stripped. Null before GL init. */
export function captureWorkspace() {
  const gl = captureLayoutConfig()
  if (!gl || !gl.root) return null
  stripMaximised(gl.root)
  // F6: a collapsed right stack captures as size-0 — swap the pre-collapse
  // sizes back in so apply never has to restore FROM a zero snapshot.
  // Collapse state travels in `visibility` instead and is re-derived on apply.
  const restore = getRightStackRestoreSizes()
  if (restore && gl.root.type === 'row'
      && Array.isArray(gl.root.content) && gl.root.content.length === restore.length) {
    gl.root.content.forEach((item, i) => { item.size = `${restore[i]}%` })
  }
  return { gl, visibility: getVisibilityMap() }
}

function stripMaximised(item) {
  if (!item || typeof item !== 'object') return
  if ('maximised' in item) item.maximised = false
  for (const child of item.content || []) stripMaximised(child)
}

// ─── Validate + floors ───────────────────────────────────────────────────────

/** Whole-config gate (F1/F2): shape + every componentType registered. Runs to
 *  completion BEFORE loadLayout so a bad spec never half-applies. */
function validateSpec(spec) {
  if (!spec || typeof spec !== 'object' || spec.formatVersion !== 1) return false
  const root = spec.gl?.root
  if (!root || typeof root !== 'object') return false
  const registered = new Set(getRegisteredComponentTypes())
  const walk = item => {
    if (!item || typeof item !== 'object') return false
    if (item.type === 'component') return registered.has(item.componentType)
    if (!['row', 'column', 'stack', 'ground'].includes(item.type)) return false
    return (item.content || []).every(walk)
  }
  return walk(root)
}

/**
 * Add any core right-stack panel a (possibly pre-feature) saved layout is
 * missing, into the stack that already holds one of its siblings.
 *
 * Runs before normalizeFloors so the injected tab gets the same re-derived
 * per-tab floor as the rest of its stack. FAIL-OPEN by contract: any anomaly
 * (no anchor stack in this layout, a malformed node, a throw) leaves the
 * config exactly as it came in — a workspace that renders without one panel is
 * strictly better than one that refuses to apply.
 *
 * @param {object} config - A cloned GL LayoutConfig ({ root })
 * @returns {object} The same object, mutated in place
 */
function ensureCorePanels(config) {
  try {
    for (const componentType of CORE_RIGHT_PANELS) {
      if (findComponentNode(config.root, componentType)) continue
      const stack = RIGHT_STACK_ANCHORS
        .map(anchor => findStackContaining(config.root, anchor))
        .find(Boolean)
      if (!stack) continue   // this layout has no right stack — nothing to join
      stack.content.push({
        type: 'component',
        componentType,
        // Title must match the rendered i18n string: the tab-hide CSS in
        // golden-layout-overrides.css selects on `.lm_tab[title="…"]`.
        title: getPanelTitle(componentType),
        isClosable: false
      })
    }
  } catch (err) {
    log.warn('workspaces: core-panel injection skipped:', err)
  }
  return config
}

/** First component node of `componentType` anywhere in the tree, else null. */
function findComponentNode(item, componentType) {
  if (!item || typeof item !== 'object') return null
  if (item.type === 'component' && item.componentType === componentType) return item
  for (const child of item.content || []) {
    const found = findComponentNode(child, componentType)
    if (found) return found
  }
  return null
}

/** The stack node whose direct content holds `componentType`, else null. */
function findStackContaining(item, componentType) {
  if (!item || typeof item !== 'object' || !Array.isArray(item.content)) return null
  if (item.type === 'stack' &&
      item.content.some(child => child?.componentType === componentType)) {
    return item
  }
  for (const child of item.content) {
    const found = findStackContaining(child, componentType)
    if (found) return found
  }
  return null
}

/** Floors are code-owned (§3.4): per-tab minSize re-derived as stack floor ÷ N
 *  at apply time; persisted floors (possibly stale, possibly wrong-N after a
 *  tab drag — reorderEnabled defaults on in GL 2.6) are discarded. Width
 *  floors only: GL resolves ONE per-item minSize and minWidth already took
 *  precedence over minHeight in the boot config, so this matches boot
 *  semantics exactly (default path: 180÷3=60px sides, 320px canvas). */
function normalizeFloors(config) {
  const walk = item => {
    if (!item || typeof item !== 'object') return
    if (item.type === 'stack' && Array.isArray(item.content) && item.content.length > 0) {
      const isCanvasStack = item.content.some(c => c?.componentType === 'canvas')
      const perTab = isCanvasStack
        ? LAYOUT_FLOORS.canvasMinW
        : Math.round(LAYOUT_FLOORS.stackMinW / item.content.length)
      for (const child of item.content) {
        child.minSize = `${perTab}px`
        delete child.minWidth
        delete child.minHeight
      }
      return
    }
    for (const child of item.content || []) walk(child)
  }
  walk(config.root)
  return config
}

// ─── Apply ───────────────────────────────────────────────────────────────────

/** Fail-open apply (§3.3). withVisibility=false is the Reset Layout path —
 *  geometry only, visibility untouched (today's exact contract). */
export function applyWorkspace(spec, { withVisibility = true } = {}) {
  if (!validateSpec(spec)) {
    toast('error', t('workspace.toast.corrupt'))
    return { ok: false, error: 'corrupt' }
  }
  const config = normalizeFloors(ensureCorePanels(structuredClone(spec.gl)))
  try {
    applyLayoutConfig(config)
  } catch (err) {
    // GL tears down old items before building new ones, so a mid-load throw
    // can't keep the old layout — fall back to the default shell (still
    // fail-open: never a half-applied tree).
    log.error('workspace apply threw mid-load — falling back to default layout:', err)
    try { glResetLayout() } catch (_) { /* layout unusable; nothing left to do */ }
    toast('error', t('workspace.toast.apply-failed'))
    return { ok: false, error: 'apply-failed' }
  }
  if (withVisibility && spec.visibility && typeof spec.visibility === 'object') {
    applyVisibilityMap(spec.visibility)
  }
  requestFullRelayout()
  return { ok: true }
}

/** View → Reset Layout: default geometry through the same validated/floor-
 *  normalized pipeline (numerically identical to the old direct load). */
export function resetToDefaultLayout() {
  return applyWorkspace(
    { formatVersion: 1, name: 'Default', gl: getDefaultConfig() },
    { withVisibility: false }
  )
}

/** Preset or saved-file apply by display name. */
export async function applyWorkspaceByName(name) {
  if (PRESET_NAMES.includes(name)) {
    return applyWorkspace(buildPreset(name))
  }
  const read = await window.grapestrap.workspaces.read(name)
  if (!read?.ok) {
    if (read?.error === 'not-found') {
      toast('warning', t('workspace.toast.not-found', { name }))
      refreshNames()   // menu list back to disk truth (F5)
    } else {
      toast('error', t('workspace.toast.corrupt'))
    }
    return { ok: false, error: read?.error || 'io' }
  }
  return applyWorkspace(read.workspace)
}

// ─── Save / delete / rename ──────────────────────────────────────────────────

/** null when acceptable, else { code, message } for inline dialog display.
 *  Main re-validates authoritatively on every write. */
function validateNameInline(name, { excludeName = null } = {}) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    return { code: 'bad-name', message: t('workspace.error.bad-name') }
  }
  const slug = slugFor(name)
  if (PRESET_SLUGS.has(slug)) {
    return { code: 'name-preset', message: t('workspace.error.name-preset') }
  }
  const excludeSlug = excludeName ? slugFor(excludeName) : null
  if (savedNames.some(n => slugFor(n) === slug && slugFor(n) !== excludeSlug)) {
    return { code: 'name-taken', message: t('workspace.error.name-taken') }
  }
  return null
}

export async function saveWorkspace(name) {
  const problem = validateNameInline(name)
  if (problem) return { ok: false, error: problem.code }
  const captured = captureWorkspace()
  if (!captured) return { ok: false, error: 'no-layout' }
  const res = await window.grapestrap.workspaces.save({ name, ...captured })
  if (!res?.ok) return { ok: false, error: res?.error || 'io' }
  await refreshNames()
  toast('success', t('workspace.toast.saved', { name }))
  return { ok: true }
}

export async function deleteWorkspaceByName(name) {
  const res = await window.grapestrap.workspaces.delete(name)
  await refreshNames()   // success or vanished-on-disk: back to truth either way
  if (!res?.ok) {
    toast('warning', t('workspace.toast.not-found', { name }))
    return { ok: false, error: res?.error || 'io' }
  }
  toast('success', t('workspace.toast.deleted', { name }))
  return { ok: true }
}

export async function renameWorkspaceByName(oldName, newName) {
  const problem = validateNameInline(newName, { excludeName: oldName })
  if (problem) return { ok: false, error: problem.code }
  const res = await window.grapestrap.workspaces.rename(oldName, newName)
  await refreshNames()
  if (!res?.ok) {
    toast('warning', res?.error === 'not-found'
      ? t('workspace.toast.not-found', { name: oldName })
      : t('workspace.error.name-taken'))
    return { ok: false, error: res?.error || 'io' }
  }
  toast('success', t('workspace.toast.renamed', { name: newName }))
  return { ok: true }
}

// ─── Name list / menu push ───────────────────────────────────────────────────

async function refreshNames() {
  try {
    const res = await window.grapestrap.workspaces.list()
    savedNames = Array.isArray(res?.names) ? res.names : []
    window.grapestrap.menu.setWorkspaces(savedNames)
    if (!skippedToastShown && res?.skipped?.length) {
      skippedToastShown = true
      toast('warning', t('workspace.toast.skipped', { files: res.skipped.join(', ') }))
    }
  } catch (err) {
    log.warn('workspaces: list failed:', err)
    savedNames = []
  }
  return savedNames
}

/** Boot hook (renderer main.js): seed the cache + native submenu. Fire-and-
 *  forget — the menu fills in as soon as the list round-trips. */
export function initWorkspaces() {
  refreshNames()
}

// ─── Interactive flows (native menu entries) ─────────────────────────────────

export async function saveWorkspaceAs() {
  const name = await showTextPrompt({
    title: t('workspace.dialog.save-title'),
    label: t('workspace.dialog.save-label'),
    initialValue: '',
    placeholder: t('workspace.dialog.save-placeholder'),
    okLabel: t('workspace.dialog.save-ok'),
    validate: value => validateNameInline(value)?.message || null
  })
  if (!name) return
  await saveWorkspace(name)
}

export async function openWorkspaceManager() {
  await showWorkspaceManageDialog({
    getNames: () => [...savedNames],
    onApply: name => applyWorkspaceByName(name),
    onDelete: name => deleteWorkspaceByName(name),
    onRename: async oldName => {
      const next = await showTextPrompt({
        title: t('workspace.dialog.rename-title'),
        label: t('workspace.dialog.rename-label'),
        initialValue: oldName,
        okLabel: t('workspace.dialog.rename-ok'),
        validate: value => value === oldName
          ? null
          : (validateNameInline(value, { excludeName: oldName })?.message || null)
      })
      if (!next || next === oldName) return null
      const res = await renameWorkspaceByName(oldName, next)
      return res.ok ? next : null
    }
  })
}

// ─── Test/devtools surface (__gstrap.workspaces — e2e never drives native
//     menus; specs go through this + the `command` bus, house pattern) ───────

export const workspacesTestSurface = {
  save:   name => saveWorkspace(name),
  apply:  name => applyWorkspaceByName(name),
  list:   () => refreshNames().then(names => [...names]),
  delete: name => deleteWorkspaceByName(name),
  rename: (oldName, newName) => renameWorkspaceByName(oldName, newName),
  presets: () => [...PRESET_NAMES],
  _layoutRootForTest: () => getLayout()?.rootItem,
  requestRelayout: () => requestFullRelayout()
}
