/**
 * GrapeStrap — GL panel visibility (real hide/show with layout redistribution)
 *
 * v0.0.2-alpha.9 hid panels via a body class + CSS `display: none` on the
 * matching `.lm_item.lm_stack`. That hid the panel content but Golden Layout
 * still allocated the panel's percentage to its slot, so the surrounding
 * panes never grew to fill the gap. Reported on nola1 2026-05-05 with two
 * screenshots: "you can see how a gap is created when you close dom."
 *
 * This module replaces that mechanism with one that drives GL directly:
 *   - find the ContentItem for the panel
 *   - capture its parent's children sizes (snapshot for restore)
 *   - set the target's `size` to 0 and redistribute its share proportionally
 *     to its visible siblings
 *   - hide the element AND call `layout.updateSize()` so GL recomputes pixel
 *     widths/heights from the new percentage values
 *
 * Restore is the symmetric op: reapply the snapshot, show the element, update.
 *
 * Why not GL's own `item.hide()` (it exists)? It just toggles `display:none`
 * inside `beginSizeInvalidation`/`endSizeInvalidation`. The end-invalidation
 * runs `updateSizeFromContainer` → `setSize` on the root, but `setSize`'s
 * `calculateAbsoluteSizes` iterates ALL `contentItems` regardless of visibility
 * and assigns each its `size` percent of the available pixels. A hidden item
 * still gets its slice. Same gap. We have to zero the `size` ourselves.
 */

import { getLayout, requestFullRelayout } from './golden-layout-config.js'

// Per-target snapshot. Keyed by ContentItem so multiple distinct panels can
// each track their own restore data without collision.
const snapshots = new WeakMap()

function findComponentByType(item, type) {
  if (!item) return null
  if (item.componentType === type) return item
  for (const child of item.contentItems || []) {
    const found = findComponentByType(child, type)
    if (found) return found
  }
  return null
}

/**
 * Resolve a panel key to the ContentItem we actually want to hide.
 *
 * - 'dom-tree'   → the lm_column wrapping it (hide whole column so the row
 *                  redistributes width)
 * - 'properties' → the lm_stack containing it (hide just one stack so the
 *                  shared right column redistributes height between Props
 *                  and Custom CSS)
 * - 'custom-css' → ditto
 *
 * File manager is a tab inside a 3-tab stack; hiding it is handled by a CSS
 * body-class (the stack itself stays for Library + Assets), so it doesn't
 * route through here.
 */
function resolveTarget(panelKey) {
  const layout = getLayout()
  if (!layout || !layout.isInitialised) return null
  const root = layout.rootItem
  if (!root) return null

  const comp = findComponentByType(root, panelKey)
  if (!comp) return null

  if (panelKey === 'dom-tree') {
    // component → stack → column. Hide the column.
    return comp.parent?.parent || null
  }
  // properties / custom-css: hide the wrapping stack.
  return comp.parent || null
}

export function hidePanel(panelKey) {
  const target = resolveTarget(panelKey)
  if (!target) return false
  return hideItem(target)
}

export function showPanel(panelKey) {
  const target = resolveTarget(panelKey)
  if (!target) return false
  return showItem(target)
}

export function isPanelHidden(panelKey) {
  const target = resolveTarget(panelKey)
  if (!target) return false
  return snapshots.has(target)
}

function hideItem(target) {
  if (snapshots.has(target)) return false  // already hidden
  const parent = target.parent
  if (!parent || !Array.isArray(parent.contentItems)) return false

  // Snapshot every sibling's current size for exact restore.
  const sizes = parent.contentItems.map(c => ({ item: c, size: c.size }))
  snapshots.set(target, sizes)

  const targetShare = target.size
  const others = parent.contentItems.filter(c => c !== target && c.size > 0)
  const totalOthers = others.reduce((s, c) => s + c.size, 0)
  if (totalOthers > 0 && targetShare > 0) {
    // Distribute the freed share proportionally so existing relative
    // proportions among siblings are preserved.
    for (const c of others) {
      c.size = c.size + (c.size / totalOthers) * targetShare
    }
  }
  target.size = 0
  if (target.element) {
    target.element.style.display = 'none'
    // Mark the element so a CSS rule can hide its adjacent splitter (the
    // splitter between this item and the next one would otherwise stay as
    // a visible 5px hairline next to nothing).
    target.element.classList.add('is-gstrap-hidden')
  }

  // Drive the full relayout chain (GL setSize + every Monaco editor.layout()
  // + GrapesJS refresh). Just calling layout.updateSize() resizes the GL
  // boxes but Monaco editors run with automaticLayout: false — they only
  // resize when our relayoutAllMonaco() pokes them. Without this, hiding
  // Properties grew the Custom CSS slot but Monaco kept its old pixel
  // dimensions, so the editor looked frozen ("custom css ... doesnt resize"
  // — nola1 2026-05-05).
  requestFullRelayout()
  return true
}

function showItem(target) {
  const sizes = snapshots.get(target)
  if (!sizes) return false
  for (const { item, size } of sizes) {
    item.size = size
  }
  snapshots.delete(target)
  if (target.element) {
    target.element.style.display = ''
    target.element.classList.remove('is-gstrap-hidden')
  }

  // Drive the full relayout chain (GL setSize + every Monaco editor.layout()
  // + GrapesJS refresh). Just calling layout.updateSize() resizes the GL
  // boxes but Monaco editors run with automaticLayout: false — they only
  // resize when our relayoutAllMonaco() pokes them. Without this, hiding
  // Properties grew the Custom CSS slot but Monaco kept its old pixel
  // dimensions, so the editor looked frozen ("custom css ... doesnt resize"
  // — nola1 2026-05-05).
  requestFullRelayout()
  return true
}

/**
 * Apply boot-time visibility (from prefs) once the layout is initialised.
 * Call from wireViewToggles after the layout exists. Returns the count of
 * panels that needed to be hidden.
 */
export function applyInitialVisibility(prefVisibility) {
  let count = 0
  for (const [panelKey, visible] of Object.entries(prefVisibility)) {
    if (visible === false) {
      if (hidePanel(panelKey)) count++
    }
  }
  return count
}
