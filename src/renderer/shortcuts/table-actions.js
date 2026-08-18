// =============================================================
// PATH: src/renderer/shortcuts/table-actions.js
// ROLE: Table surgery for the selected component — add/remove a row,
//       add/remove a column — plus the context-menu item set that exposes
//       them. Works from anywhere inside a table (a selected <td>, a <tr>,
//       or the <table> itself) by walking the parent chain and resolving the
//       row/column the user actually clicked on.
// DEPENDS: state/event-bus.js, editor/component-lock.js, i18n.js
// CREATED: 2026-08-18
// UPDATED: 2026-08-18 — the "is this table locked?" test moved to
//          editor/component-lock.js. It used to read `editable === false`,
//          which GrapesJS sets on EVERY table by factory default, so every
//          operation here bailed and the whole context-menu group rendered
//          disabled on ordinary tables (caught by tests/e2e/table-edit.spec.js).
//
// ── UNDO CONTRACT (read before adding an operation here) ──────────────────
// GrapesJS 0.21.13's UndoManager has NO group/transaction API (verified in
// node_modules/grapesjs/dist/grapes.mjs — the module exposes add/remove/
// start/stop/undo/redo and nothing else). What it DOES have is Backbone.Undo's
// "magic fusion": every tracked action created inside ONE synchronous call
// stack is stamped with the same magicFusionIndex (the counter is only
// released by an `_.defer`, i.e. after the stack unwinds), and
// `UndoManager.undo()` defaults to `all = true`, which undoes every action
// sharing that index. So N synchronous component mutations collapse into ONE
// undo entry for free. The rules that follow from that:
//
//   1. Prefer a single mutation per gesture (one .add(), one .remove()).
//   2. A multi-op gesture MUST run in one synchronous call stack — NO await,
//      no setTimeout, no promise between the first and the last mutation.
//      Gather every dialog/user input BEFORE touching the model.
//   3. NEVER use um.stop()/um.start() to "group" anything. Those UNTRACK
//      changes rather than fusing them: edits made while stopped become
//      permanently un-undoable, which breaks the one-gesture-one-entry
//      contract pinned by drag-resize.js's header and tests/e2e/undo-redo.js.
//   4. Exactly ONE eventBus.emit('canvas:content-changed') per gesture.
//
// tests/e2e/table-edit.spec.js pins rules 1/2/4 against a GrapesJS upgrade.
//
// ── PARSER CONTRACT (why cells are built as defs, not HTML strings) ───────
// GrapesJS builds components from an HTML string via DOMParser in text/html
// mode (BrowserParserHtml). The HTML fragment parsing rules DROP <tr>, <td>,
// <th> and <thead> start tags outside a table insertion context, so
// `row.components().add('<td>x</td>')` yields a bare text node and silently
// loses the cell (measured in a real Chromium: body.innerHTML === "x").
// Every row/cell here is therefore added as a component DEFINITION object,
// which bypasses the HTML parser entirely and is still one .add() call. The
// shape mirrors exactly what the parser produces for `<td>x</td>`: a `text`
// component with a single textnode child.
// =============================================================

import { eventBus } from '../state/event-bus.js'
import { isComponentLocked } from '../editor/component-lock.js'
import { t } from '../i18n.js'

/** Seed text for generated cells — an empty <td> has no textnode child and
 *  so cannot be typed into on the canvas. Same reasoning as the list
 *  "Item" placeholder in panels/element-fields.js. */
const CELL_PLACEHOLDER = 'Cell'
const HEADING_PLACEHOLDER = 'Heading'

/** Parent-chain walk cap — a malformed model can never hang the UI. */
const MAX_ANCESTOR_WALK = 100

/**
 * Resolve the table context for a component: the table itself plus which row
 * and column the user is "on", derived from the selection.
 *
 * @param {object} component - Any GrapesJS component (a cell, a row, the
 *        table, or something nested deeper inside a cell)
 * @returns {{table: object, row: object|null, cell: object|null,
 *            rowIndex: number|null, colIndex: number|null}|null}
 *          null when no <table> ancestor exists. `rowIndex` is the element
 *          index of the row within the table's BODY row container, and is
 *          null for a <thead>/<tfoot> row (header rows are not a valid
 *          target for row add/remove — those operate on the body). Missing
 *          indexes mean "no positional context", which every operation reads
 *          as "act at the end".
 */
export function closestTable(component) {
  let node = component || null
  let cell = null
  let row = null
  let table = null

  for (let steps = 0; node && steps < MAX_ANCESTOR_WALK; steps++) {
    const tag = tagOf(node)
    if (tag === 'table') { table = node; break }
    if (!cell && (tag === 'td' || tag === 'th')) cell = node
    if (!row && tag === 'tr') row = node
    node = node.parent?.() || null
  }
  if (!table) return null

  const bodyRows = rowsIn(rowContainer(table))
  const rowIndex = row ? indexOrNull(bodyRows, row) : null

  // The column index is the cell's ELEMENT index inside its row — GrapesJS
  // can keep meaningful whitespace textnodes between cells, and those would
  // skew a raw collection index.
  let colIndex = null
  if (cell) {
    const owningRow = cell.parent?.()
    if (owningRow) colIndex = indexOrNull(elementChildren(owningRow), cell)
  }

  return { table, row, cell, rowIndex, colIndex }
}

/**
 * Insert a row into the table's body.
 *
 * ONE `.add()` call with a fully-built row definition — rule 1 of the undo
 * contract, so this gesture is a single undo entry regardless of fusion.
 *
 * @param {object} table - The <table> component
 * @param {number|null} [atIdx] - Element index to insert AT (0 = before the
 *        first body row). Out of range / null / omitted appends at the end.
 * @returns {boolean} true when a row was inserted
 */
export function addTableRow(table, atIdx = null) {
  if (!isEditableTable(table)) return false
  const body = rowContainer(table)
  if (!body) return false

  const columns = Math.max(1, columnCount(table))
  const cells = []
  for (let i = 0; i < columns; i++) cells.push(cellDef('td', CELL_PLACEHOLDER))

  body.components().add({ tagName: 'tr', components: cells },
    { at: insertionIndex(body, rowsIn(body), atIdx) })
  eventBus.emit('canvas:content-changed', table)
  return true
}

/**
 * Remove one body row.
 *
 * @param {object} table - The <table> component
 * @param {number|null} [atIdx] - Element index of the row to drop; null /
 *        omitted removes the last body row.
 * @returns {boolean} false when the table is locked, when the row is locked
 *          (removable === false), or when it is the LAST body row — a table
 *          with zero rows is not something the user can click their way back
 *          out of, so the operation refuses instead.
 */
export function removeTableRow(table, atIdx = null) {
  if (!isEditableTable(table)) return false
  const rows = rowsIn(rowContainer(table))
  if (rows.length <= 1) return false

  const target = Number.isInteger(atIdx) ? rows[atIdx] : rows[rows.length - 1]
  if (!target) return false
  if (target.get?.('removable') === false) return false

  target.remove()
  eventBus.emit('canvas:content-changed', table)
  return true
}

/**
 * Insert a cell into every row of the table (head, body and foot).
 *
 * One synchronous loop, no awaits — rule 2 of the undo contract. Each row
 * contributes its own `add` action; they share a magicFusionIndex, so one
 * Ctrl+Z takes the whole column back out.
 *
 * @param {object} table - The <table> component
 * @param {number|null} [atIdx] - Element index to insert AT within each row;
 *        null / out of range appends to the end of each row.
 * @returns {boolean} true when at least one cell was inserted
 */
export function addTableColumn(table, atIdx = null) {
  if (!isEditableTable(table)) return false
  const rows = allRows(table)
  if (rows.length === 0) return false

  for (const row of rows) {
    const cells = elementChildren(row)
    const tag = cellTagFor(row, cells)
    row.components().add(
      cellDef(tag, tag === 'th' ? HEADING_PLACEHOLDER : CELL_PLACEHOLDER),
      { at: insertionIndex(row, cells, atIdx) }
    )
  }
  eventBus.emit('canvas:content-changed', table)
  return true
}

/**
 * Remove one cell from every row of the table.
 *
 * @param {object} table - The <table> component
 * @param {number|null} [atIdx] - Element index of the column to drop; null /
 *        omitted removes each row's last cell.
 * @returns {boolean} false when the table is locked or only one column is
 *          left (same reasoning as the last-row refusal). Individual locked
 *          cells (removable === false) are skipped, not fatal — the rest of
 *          the column still goes.
 */
export function removeTableColumn(table, atIdx = null) {
  if (!isEditableTable(table)) return false
  if (columnCount(table) <= 1) return false
  const rows = allRows(table)
  if (rows.length === 0) return false

  for (const row of rows) {
    const cells = elementChildren(row)
    const target = Number.isInteger(atIdx) ? cells[atIdx] : cells[cells.length - 1]
    if (!target) continue
    if (target.get?.('removable') === false) continue
    target.remove()
  }
  eventBus.emit('canvas:content-changed', table)
  return true
}

/**
 * Context-menu tail for a component that lives inside a table.
 *
 * @param {object} component - The right-clicked component
 * @returns {Array<object>} A separator plus four items, or an EMPTY ARRAY
 *          when there is no table in the parent chain — callers spread this
 *          unconditionally, so "not a table" must add no separator noise
 *          (same contract as bsDocsMenuItems).
 */
export function buildTableMenuItems(component) {
  const context = closestTable(component)
  if (!context) return []
  const { table, rowIndex, colIndex } = context
  const locked = isComponentLocked(table)
  // Add-after-the-clicked-row/column reads as "insert next to this one";
  // with no positional context both fall through to appending at the end.
  const rowAt = Number.isInteger(rowIndex) ? rowIndex + 1 : null
  const colAt = Number.isInteger(colIndex) ? colIndex + 1 : null

  return [
    { separator: true },
    {
      label: t('ctx.table.add-row'),
      action: () => addTableRow(table, rowAt),
      disabled: locked
    },
    {
      label: t('ctx.table.remove-row'),
      action: () => removeTableRow(table, rowIndex),
      disabled: locked || bodyRowCount(table) <= 1
    },
    {
      label: t('ctx.table.add-col'),
      action: () => addTableColumn(table, colAt),
      disabled: locked
    },
    {
      label: t('ctx.table.remove-col'),
      action: () => removeTableColumn(table, colIndex),
      disabled: locked || columnCount(table) <= 1
    }
  ]
}

/**
 * The table's <thead> component, or null. Exported for the Attributes
 * section's "header row" checkbox (panels/element-fields.js), which adds and
 * removes one.
 *
 * @param {object} table - The <table> component
 * @returns {object|null}
 */
export function findTableHead(table) {
  return headContainer(table)
}

/**
 * Number of BODY rows — what the remove-row guard and the Attributes
 * section's disabled state both key on (header rows are never a removal
 * target).
 *
 * @param {object} table - The <table> component
 * @returns {number}
 */
export function bodyRowCount(table) {
  return rowsIn(rowContainer(table)).length
}

/**
 * Number of columns in a table, read off the first body row and falling back
 * to the first header row (a head-only table still has a column count).
 *
 * @param {object} table - The <table> component
 * @returns {number} 0 when the table has no rows at all
 */
export function columnCount(table) {
  const row = rowsIn(rowContainer(table))[0] || rowsIn(headContainer(table))[0] || null
  return row ? elementChildren(row).length : 0
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * The component that owns the table's body rows: its <tbody> when one exists,
 * otherwise the table itself. A browser-parsed `<table><tr>…` always gains a
 * <tbody>, but hand-built models and XML-ish sources may not have one.
 */
function rowContainer(table) {
  return firstChildByTag(table, 'tbody') || table || null
}

function headContainer(table) {
  return firstChildByTag(table, 'thead')
}

/** Head rows, then body rows, then foot rows — de-duplicated, because
 *  rowContainer() falls back to the table itself and would otherwise re-list
 *  rows already collected from <thead>/<tfoot>. */
function allRows(table) {
  const rows = []
  for (const container of [headContainer(table), rowContainer(table), firstChildByTag(table, 'tfoot')]) {
    for (const row of rowsIn(container)) {
      if (!rows.includes(row)) rows.push(row)
    }
  }
  return rows
}

function rowsIn(container) {
  if (!container) return []
  return elementChildren(container).filter(child => tagOf(child) === 'tr')
}

/**
 * A component's child components minus GrapesJS textnodes. Whitespace between
 * cells can survive parsing as a textnode component, and counting those would
 * put every column index one or more places off.
 *
 * components() is a Backbone Collection — indexed access via `coll[i]` does
 * not work, it must be `.models` / `.at(i)` (documented at
 * src/renderer/editor/placement.js:210).
 */
function elementChildren(component) {
  const collection = component?.components?.()
  const models = collection?.models || (Array.isArray(collection) ? collection : [])
  return models.filter(child => child?.get?.('type') !== 'textnode')
}

/** First element child with the given tag, or null. */
function firstChildByTag(component, tag) {
  return elementChildren(component).find(child => tagOf(child) === tag) || null
}

/**
 * Translate an ELEMENT index into the raw collection index `.add({at})` wants.
 * Out-of-range / non-integer means "append", which is the collection length.
 */
function insertionIndex(parent, elements, elementIdx) {
  const collection = parent.components()
  if (!Number.isInteger(elementIdx) || elementIdx < 0 || elementIdx >= elements.length) {
    return collection.length
  }
  return collection.indexOf(elements[elementIdx])
}

/** Which tag a generated cell should use: match the row's existing cells,
 *  and fall back to the containing section when the row is empty. */
function cellTagFor(row, cells) {
  if (cells.length > 0) return tagOf(cells[0]) === 'th' ? 'th' : 'td'
  return tagOf(row.parent?.()) === 'thead' ? 'th' : 'td'
}

/**
 * Component definition for one cell, shaped exactly like the HTML parser's
 * output for `<td>text</td>` — a `text` component wrapping one textnode.
 * Exported for panels/element-fields.js, which builds a whole <thead> the
 * same way.
 */
export function cellDef(tag, text) {
  return {
    tagName: tag,
    type: 'text',
    ...(tag === 'th' ? { attributes: { scope: 'col' } } : {}),
    components: { type: 'textnode', content: text }
  }
}

/** Definition for a <thead> holding one heading row of `columns` cells. */
export function theadDef(columns) {
  const cells = []
  for (let i = 0; i < Math.max(1, columns); i++) cells.push(cellDef('th', HEADING_PLACEHOLDER))
  return { tagName: 'thead', components: [{ tagName: 'tr', components: cells }] }
}

function isEditableTable(table) {
  if (!table) return false
  return !isComponentLocked(table)
}

function indexOrNull(list, item) {
  const idx = list.indexOf(item)
  return idx === -1 ? null : idx
}

function tagOf(component) {
  return String(component?.get?.('tagName') || '').toLowerCase()
}
