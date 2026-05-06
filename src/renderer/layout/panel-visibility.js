/**
 * GrapeStrap — GL panel visibility (tab hide + auto-collapse stack)
 *
 * After the 2026-05-05 right-side consolidation (DOM / Properties / Custom CSS
 * are now three tabs in a single right-side stack — same pattern as Project /
 * Library / Assets on the left), per-panel visibility is just hiding a tab in
 * its stack. Two pieces:
 *
 *   1. Each panel's "hide" state is a body class. CSS rules in
 *      golden-layout-overrides.css turn off both the .lm_tab in the strip and
 *      the .lm_content host for that panel's componentType. The stack stays
 *      visible for the remaining tabs; no layout gap.
 *
 *   2. If ALL three right-side tabs are hidden, the entire right stack would
 *      otherwise sit there as an empty 26%-wide column with just a tab strip
 *      and nothing inside. So we additionally collapse the stack itself via
 *      the size-redistribute trick from alpha.10: zero its `size`, boost
 *      visible siblings (the canvas), then `requestFullRelayout()`. Restoring
 *      any of the three panels reverses the stack collapse.
 *
 * Caller surface (used by view-toggles.js):
 *   - hideRightTab(componentType)        — hide one tab; auto-collapse stack if needed
 *   - showRightTab(componentType)        — show one tab; auto-restore stack if needed
 *   - applyInitialRightTabVisibility(map) — apply persisted prefs at boot
 *
 * Why not GL's own item.hide()? It only flips display:none inside
 * beginSizeInvalidation / endSizeInvalidation; setSize→calculateAbsoluteSizes
 * iterates ALL contentItems regardless of visibility and assigns each its
 * size-percent share, so the slot stays. We have to zero the size ourselves.
 */

import { getLayout, requestFullRelayout } from './golden-layout-config.js'

const RIGHT_TAB_CLASSES = {
  'dom-tree':   { bodyClass: 'is-hide-dom-tree' },
  'properties': { bodyClass: 'is-hide-properties' },
  'custom-css': { bodyClass: 'is-hide-custom-css' }
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
  // The stack containing DOM (and Properties + Custom CSS) is dom.parent.
  return dom?.parent || null
}

function findTabComponent(panelKey) {
  const layout = getLayout()
  if (!layout || !layout.isInitialised) return null
  return findComponentByType(layout.rootItem, panelKey)
}

function activateAnyVisibleTab(stack) {
  if (!stack) return
  const visibleTab = (stack.contentItems || []).find(item => {
    const cls = RIGHT_TAB_CLASSES[item.componentType]?.bodyClass
    return !cls || !document.body.classList.contains(cls)
  })
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

export function isRightTabHidden(componentType) {
  const def = RIGHT_TAB_CLASSES[componentType]
  if (!def) return false
  return document.body.classList.contains(def.bodyClass)
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
