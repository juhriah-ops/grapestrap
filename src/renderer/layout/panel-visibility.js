/**
 * GrapeStrap — GL panel visibility (tab hide + auto-collapse stack)
 *
 * After the 2026-05-05 right-side consolidation (DOM / Properties / Custom CSS
 * — joined by Bootstrap on 2026-08-18 and AI on 2026-08-30 — are tabs in a
 * single right-side stack, same pattern as Project / Library / Assets on the
 * left), per-panel
 * visibility is just hiding a tab in its stack. Two pieces:
 *
 *   1. Each panel's "hide" state is a body class. CSS rules in
 *      golden-layout-overrides.css turn off both the .lm_tab in the strip and
 *      the .lm_content host for that panel's componentType. The stack stays
 *      visible for the remaining tabs; no layout gap.
 *
 *   2. If EVERY right-side tab is hidden, the entire right stack would
 *      otherwise sit there as an empty 26%-wide column with just a tab strip
 *      and nothing inside. So we additionally collapse the stack itself via
 *      the size-redistribute trick from alpha.10: zero its `size`, boost
 *      visible siblings (the canvas), then `requestFullRelayout()`. Restoring
 *      any one of the panels reverses the stack collapse.
 *
 * Caller surface (used by view-toggles.js):
 *   - hideRightTab(componentType)        — hide one tab; auto-collapse stack if needed
 *   - showRightTab(componentType)        — show one tab; auto-restore stack if needed
 *   - applyInitialRightTabVisibility(map) — apply persisted prefs at boot
 *
 * Plus one stack-agnostic helper (used by menu-router for Insert → Library):
 *   - focusPanelTab(componentType)       — bring any GL tab to the front
 *
 * The right-stack functions above are hide/show; focusPanelTab is pure
 * activation and works on the left stack too — it lives here because this is
 * where GL tab lookup and activation already live (findComponentByType +
 * setActiveContentItem), rather than adding a second copy elsewhere.
 *
 * Why not GL's own item.hide()? It only flips display:none inside
 * beginSizeInvalidation / endSizeInvalidation; setSize→calculateAbsoluteSizes
 * iterates ALL contentItems regardless of visibility and assigns each its
 * size-percent share, so the slot stays. We have to zero the size ourselves.
 */

import { getLayout, requestFullRelayout } from './golden-layout-config.js'

// Every right-stack panel and the body class that hides it. allRightTabsHidden
// and activateAnyVisibleTab derive from this map, so adding a panel here is
// all the stack-collapse logic needs — but the matching display:none rules in
// styles/golden-layout-overrides.css are NOT derived and must be added too.
const RIGHT_TAB_CLASSES = {
  'dom-tree':      { bodyClass: 'is-hide-dom-tree' },
  'properties':    { bodyClass: 'is-hide-properties' },
  'custom-css':    { bodyClass: 'is-hide-custom-css' },
  'bootstrap-css': { bodyClass: 'is-hide-bootstrap-css' },
  'ai':            { bodyClass: 'is-hide-ai' }
}

// Snapshot of sibling sizes when the right stack itself is collapsed. WeakMap
// keyed by ContentItem so the snapshot is collected if the layout is ever
// rebuilt.
const stackSnapshots = new WeakMap()

function findComponentByType(item, type) {
  if (!item) return null
  if (item.componentType === type) return item
  for (const child of item.contentItems || []) {
    const found = findComponentByType(child, type)
    if (found) return found
  }
  return null
}

function findRightStack() {
  const layout = getLayout()
  if (!layout || !layout.isInitialised) return null
  const root = layout.rootItem
  if (!root) return null
  const dom = findComponentByType(root, 'dom-tree')
  // The stack containing DOM (plus Properties, Custom CSS, Bootstrap, AI) is
  // dom.parent.
  return dom?.parent || null
}

function findTabComponent(panelKey) {
  const layout = getLayout()
  if (!layout || !layout.isInitialised) return null
  return findComponentByType(layout.rootItem, panelKey)
}

function activateAnyVisibleTab(stack) {
  if (!stack) return
  const isVisible = item => {
    const cls = RIGHT_TAB_CLASSES[item.componentType]?.bodyClass
    return !cls || !document.body.classList.contains(cls)
  }
  // Only switch when the CURRENT active tab is hidden. Unconditionally
  // jumping to the first visible tab clobbered (a) the user's active tab
  // when hiding a different one and (b) a workspace's saved activeItemIndex
  // right after apply (Wave 3 — applyVisibilityMap re-runs this path after
  // every loadLayout).
  const active = typeof stack.getActiveComponentItem === 'function'
    ? stack.getActiveComponentItem()
    : null
  if (active && isVisible(active)) return
  const visibleTab = (stack.contentItems || []).find(isVisible)
  if (visibleTab && typeof stack.setActiveContentItem === 'function') {
    try { stack.setActiveContentItem(visibleTab) } catch (_) { /* mid-transition */ }
  }
}

function allRightTabsHidden() {
  for (const def of Object.values(RIGHT_TAB_CLASSES)) {
    if (!document.body.classList.contains(def.bodyClass)) return false
  }
  return true
}

function hideStackItem(target) {
  if (!target || stackSnapshots.has(target)) return false
  const parent = target.parent
  if (!parent || !Array.isArray(parent.contentItems)) return false

  const sizes = parent.contentItems.map(c => ({ item: c, size: c.size }))
  stackSnapshots.set(target, sizes)

  const targetShare = target.size
  const others = parent.contentItems.filter(c => c !== target && c.size > 0)
  const totalOthers = others.reduce((s, c) => s + c.size, 0)
  if (totalOthers > 0 && targetShare > 0) {
    for (const c of others) {
      c.size = c.size + (c.size / totalOthers) * targetShare
    }
  }
  target.size = 0
  if (target.element) {
    target.element.style.display = 'none'
    target.element.classList.add('is-gstrap-hidden')
  }
  requestFullRelayout()
  return true
}

function showStackItem(target) {
  const sizes = stackSnapshots.get(target)
  if (!sizes) return false
  for (const { item, size } of sizes) {
    item.size = size
  }
  stackSnapshots.delete(target)
  if (target.element) {
    target.element.style.display = ''
    target.element.classList.remove('is-gstrap-hidden')
  }
  requestFullRelayout()
  return true
}

export function hideRightTab(componentType) {
  const def = RIGHT_TAB_CLASSES[componentType]
  if (!def) return false
  document.body.classList.add(def.bodyClass)

  // If we just hid the active tab, switch to a still-visible one.
  const stack = findRightStack()
  activateAnyVisibleTab(stack)

  // If everyone is hidden, collapse the whole stack so the canvas can grow.
  if (allRightTabsHidden() && stack && !stackSnapshots.has(stack)) {
    hideStackItem(stack)
  }
  return true
}

export function showRightTab(componentType) {
  const def = RIGHT_TAB_CLASSES[componentType]
  if (!def) return false
  document.body.classList.remove(def.bodyClass)

  // If the stack was collapsed and we now have at least one visible tab,
  // restore the stack first so the tab has a place to render.
  const stack = findRightStack()
  if (stack && stackSnapshots.has(stack)) {
    showStackItem(stack)
  }

  // Make the freshly-shown tab the active one so the user sees their click.
  const comp = findTabComponent(componentType)
  if (comp && stack && typeof stack.setActiveContentItem === 'function') {
    try { stack.setActiveContentItem(comp) } catch (_) { /* mid-transition */ }
  }
  return true
}

/**
 * Bring a GL tab to the front of whatever stack it sits in.
 *
 * Stack-agnostic on purpose: the Library and Assets panels live in the LEFT
 * stack, which has no hide/show story at all, so this is activation only — no
 * body classes, no size juggling.
 *
 * @param {string} componentType - A registered GL componentType, e.g.
 *        'library-items' (see golden-layout-config.js PANEL_FACTORIES)
 * @returns {boolean} true when the tab was activated; false when the layout
 *          isn't up yet, the panel isn't in the current arrangement (a saved
 *          workspace may omit it), or GL was mid-transition.
 */
export function focusPanelTab(componentType) {
  const component = findTabComponent(componentType)
  const stack = component?.parent
  if (!component || typeof stack?.setActiveContentItem !== 'function') return false
  try {
    stack.setActiveContentItem(component)
  } catch (_) {
    // Same guard as the other setActiveContentItem call sites: GL throws if
    // the item is being re-parented (maximize/restore, workspace apply).
    return false
  }
  return true
}

export function isRightTabHidden(componentType) {
  const def = RIGHT_TAB_CLASSES[componentType]
  if (!def) return false
  return document.body.classList.contains(def.bodyClass)
}

/**
 * Wave 3 (workspace capture, F6): when the right stack is collapsed via the
 * size-0 trick, the live GL geometry lies about the user's intended sizes.
 * Returns the root row's child sizes with the pre-collapse snapshot swapped
 * back in (percent numbers, root-row child order), or null when the stack
 * isn't collapsed. Workspaces store expanded sizes only — collapse state is
 * derived from `visibility` at apply time, never persisted as size-0 geometry.
 */
export function getRightStackRestoreSizes() {
  const stack = findRightStack()
  if (!stack) return null
  const snapshot = stackSnapshots.get(stack)
  if (!snapshot) return null
  const parent = stack.parent
  if (!parent || !Array.isArray(parent.contentItems)) return null
  return parent.contentItems.map(item => {
    const entry = snapshot.find(s => s.item === item)
    return entry ? entry.size : item.size
  })
}

/**
 * Apply boot-time visibility (from prefs) once the layout is initialised.
 * Called from wireViewToggles.
 */
export function applyInitialRightTabVisibility(map) {
  // First, set body classes for any tabs that should start hidden. Don't
  // collapse the stack yet — we want a single relayout at the end, not one
  // per tab.
  for (const [panelKey, def] of Object.entries(RIGHT_TAB_CLASSES)) {
    const visible = map[panelKey]
    document.body.classList.toggle(def.bodyClass, visible === false)
  }
  // Switch active tab away from any hidden one.
  const stack = findRightStack()
  activateAnyVisibleTab(stack)
  // Collapse the whole stack only if every tab ended up hidden.
  if (allRightTabsHidden() && stack && !stackSnapshots.has(stack)) {
    hideStackItem(stack)
  }
}
