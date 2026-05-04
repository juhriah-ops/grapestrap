/**
 * GrapeStrap — Style Manager: Columns sub-panel
 *
 * Activates when the selected component is a Bootstrap row (`.row` class).
 * Shows the row's direct .col-* children as a list with a per-column size
 * editor for the active breakpoint, plus quick-split presets that swap the
 * whole row to N columns of equal-or-typical sizes (50/50, 33/33/33,
 * 66/33, etc.) — same UX shape as Dreamweaver's BS grid editor.
 *
 * Per-breakpoint editing: the panel header carries a breakpoint strip
 * (xs / sm / md / lg / xl / xxl). Selecting a breakpoint scopes every
 * size edit to that breakpoint's `col-<bp>-<n>` class. The base column
 * class (`col-N`) is the xs target.
 *
 * Add column appends a fresh `<div class="col">column</div>` to the row.
 * Remove deletes the child. Both are GrapesJS-tree mutations so they
 * round-trip through the Code view + Save.
 */

import {
  BREAKPOINTS, COL_SIZES, COL_PRESETS,
  colClass, colPattern
} from './bs-classes.js'
import { applyGroup, readGroup } from './class-utils.js'
import { eventBus } from '../../state/event-bus.js'

let activeBp = ''  // '' = base / xs

export const id = 'columns'
export const label = 'Columns'

export function render(host, ctx) {
  const { component, requestRender } = ctx
  const isRow = (component.getClasses?.() || []).includes('row')
  if (!isRow) {
    host.innerHTML = `
      <div class="gstrap-sm-hint">
        Select a Bootstrap <code>.row</code> to edit its columns.
        <button class="gstrap-sm-pill" data-make-row>Make this a row</button>
      </div>
    `
    host.querySelector('[data-make-row]')?.addEventListener('click', () => {
      const cur = component.getClasses() || []
      component.setClass([...new Set([...cur, 'row'])])
      requestRender()
    })
    return
  }

  const cols = (component.components?.() || []).filter(c => isColumn(c))

  host.innerHTML = `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Breakpoint</label>
      <div class="gstrap-sm-segs" data-bp-strip>
        ${BREAKPOINTS.map(bp => `
          <button class="gstrap-sm-seg ${bp === activeBp ? 'is-active' : ''}" data-bp="${bp}">${bp || 'xs'}</button>
        `).join('')}
      </div>
    </div>

    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Quick splits</label>
      <div class="gstrap-sm-grid">
        ${COL_PRESETS.map(p => `
          <button class="gstrap-sm-pill" data-preset="${p.sizes.join(',')}" title="${p.sizes.length} columns">${p.label}</button>
        `).join('')}
      </div>
    </div>

    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">Columns (${cols.length})</label>
      <div class="gstrap-sm-cols-list">
        ${cols.map((col, i) => renderCol(col, i, activeBp)).join('')}
        <button class="gstrap-sm-pill" data-add-col>+ Add column</button>
      </div>
    </div>
  `

  host.querySelectorAll('[data-bp]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeBp = btn.dataset.bp
      requestRender()
    })
  })

  host.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sizes = btn.dataset.preset.split(',')
      applyPreset(component, sizes, activeBp)
      requestRender()
      eventBus.emit('canvas:content-changed')
    })
  })

  host.querySelector('[data-add-col]')?.addEventListener('click', () => {
    component.append('<div class="col">column</div>')
    requestRender()
    eventBus.emit('canvas:content-changed')
  })

  host.querySelectorAll('[data-col-size]').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = Number(sel.dataset.colIndex)
      const target = cols[idx]
      if (!target) return
      const value = sel.value  // '', 'auto', '1'..'12'
      applyGroup(target, colPattern(activeBp), colClass(value, activeBp))
      requestRender()
    })
  })

  host.querySelectorAll('[data-col-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.colRemove)
      const target = cols[idx]
      if (!target) return
      target.remove()
      requestRender()
      eventBus.emit('canvas:content-changed')
    })
  })
}

function renderCol(col, idx, bp) {
  const cur = readGroup(col, colPattern(bp)) || ''
  // Strip the prefix to get just the size component for the dropdown.
  const size = currentSize(cur, bp)
  return `
    <div class="gstrap-sm-cols-row">
      <span class="gstrap-sm-cols-idx">${idx + 1}.</span>
      <select data-col-size data-col-index="${idx}" class="gstrap-sm-pseudo-input">
        <option value="" ${size === '' ? 'selected' : ''}>fill</option>
        ${COL_SIZES.map(s => `
          <option value="${s}" ${s === size ? 'selected' : ''}>${s}</option>
        `).join('')}
      </select>
      <button class="gstrap-sm-mini-x" data-col-remove="${idx}" title="Remove column">×</button>
    </div>
  `
}

function currentSize(cls, bp) {
  if (!cls) return ''
  // bp='' covers `col` and `col-N` and `col-auto`.
  if (!bp) {
    if (cls === 'col') return ''
    const m = /^col-(auto|1[0-2]|[1-9])$/.exec(cls)
    return m ? m[1] : ''
  }
  if (cls === `col-${bp}`) return ''
  const m = new RegExp(`^col-${bp}-(auto|1[0-2]|[1-9])$`).exec(cls)
  return m ? m[1] : ''
}

function isColumn(component) {
  const classes = component.getClasses?.() || []
  return classes.some(c => /^col(?:-(?:sm|md|lg|xl|xxl))?(?:-(?:auto|1[0-2]|[1-9]))?$/.test(c))
}

function applyPreset(row, sizes, bp) {
  const existing = (row.components?.() || []).filter(c => isColumn(c))
  // Trim or pad children to the preset's column count.
  while (existing.length > sizes.length) existing.pop().remove()
  while (existing.length < sizes.length) {
    const added = row.append('<div class="col">column</div>')
    existing.push(Array.isArray(added) ? added[0] : added)
  }
  // Apply the size at the chosen breakpoint to each column.
  for (let i = 0; i < existing.length; i++) {
    applyGroup(existing[i], colPattern(bp), colClass(sizes[i], bp))
  }
}
