/**
 * GrapeStrap — Unit: table surgery (shortcuts/table-actions.js)
 *
 * PATH: tests/unit/table-actions.test.js
 * ROLE: Pins the parts of the table operations that are pure model math and
 *       would otherwise only be caught by an e2e run: closestTable()'s
 *       parent-chain walk and the row/column indexes it derives from a
 *       selected <td>, <tr> or the <table> itself; the column count read off
 *       the first body row; the two refusals that keep a table usable (never
 *       remove the last body row, never remove the last column); the locked
 *       (editable:false) bail-out; and — the load-bearing one — the fact that
 *       a column operation touches every row inside ONE synchronous call
 *       stack. That last property is what makes Backbone.Undo's magic fusion
 *       collapse N inserts into a single undo entry, so the recording stubs
 *       assert the op ORDER, not just the end state. See the undo contract at
 *       the top of shortcuts/table-actions.js.
 * DEPENDS: node:test, node:assert,
 *          ../../src/renderer/shortcuts/table-actions.js,
 *          ../../src/renderer/state/event-bus.js
 * CREATED: 2026-08-18
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  closestTable, addTableRow, removeTableRow,
  addTableColumn, removeTableColumn, columnCount,
  findTableHead, buildTableMenuItems
} from '../../src/renderer/shortcuts/table-actions.js'
import { eventBus } from '../../src/renderer/state/event-bus.js'

// ─── Backbone-shaped stubs ──────────────────────────────────────────────────
// Every mutation appends to a SHARED ops log, so a test can assert the exact
// sequence of writes across several components — the only way to prove the
// per-row loop is one uninterrupted synchronous stack.

function makeTree() {
  const ops = []

  function makeComponent({ tagName = 'div', type = null, children = [], props = {} } = {}) {
    const kids = [...children]
    const collection = {
      models: kids,
      get length() { return kids.length },
      at: i => kids[i],
      indexOf: model => kids.indexOf(model),
      add(def, opts = {}) {
        const at = Number.isInteger(opts.at) ? opts.at : kids.length
        // Real GrapesJS turns a definition object into a live component
        // (nested `components` and all) before inserting it — the stub has to
        // do the same or the "was a whole row built in one add?" assertions
        // would pass against an empty shell.
        const added = defToComponent(def)
        kids.splice(at, 0, added)
        added.parentRef = component
        ops.push(`add ${def.tagName || '?'} -> ${component.label} @${at}`)
        return added
      },
      remove(model) {
        const idx = kids.indexOf(model)
        if (idx >= 0) kids.splice(idx, 1)
      }
    }
    const component = {
      label: tagName,
      parentRef: null,
      get: key => (key === 'tagName' ? tagName : key === 'type' ? type : props[key]),
      components: () => collection,
      parent: () => component.parentRef,
      remove() {
        ops.push(`remove ${tagName} from ${component.parentRef?.label ?? '?'}`)
        component.parentRef?.components().remove(component)
      }
    }
    for (const child of kids) child.parentRef = component
    return component
  }

  /** Component definition (GrapesJS shape) → stub component. Already-built
   *  stubs pass straight through, so tests can add either. */
  function defToComponent(def) {
    if (typeof def?.get === 'function') return def
    return makeComponent({
      tagName: def.tagName,
      type: def.type,
      props: { ...(def.attributes ? { attributes: def.attributes } : {}), content: def.content },
      children: [].concat(def.components || []).map(defToComponent)
    })
  }

  return { ops, makeComponent }
}

const cell = (make, tag = 'td', text = 'x') =>
  make({ tagName: tag, type: 'text', children: [make({ type: 'textnode', props: { content: text } })] })

/**
 * A Bootstrap-shaped table: <thead> with one heading row, <tbody> with
 * `bodyRows` rows, `columns` cells wide. Whitespace textnodes are seeded
 * between the sections because GrapesJS can keep them, and every index the
 * module computes has to ignore them.
 */
function buildTable({ columns = 2, bodyRows = 2, withHead = true, props = {} } = {}) {
  const { ops, makeComponent: make } = makeTree()
  const row = (tag, count) => make({
    tagName: 'tr',
    children: Array.from({ length: count }, () => cell(make, tag))
  })
  const head = withHead ? make({ tagName: 'thead', children: [row('th', columns)] }) : null
  const body = make({
    tagName: 'tbody',
    children: Array.from({ length: bodyRows }, () => row('td', columns))
  })
  const children = [
    ...(head ? [head, make({ type: 'textnode', props: { content: '\n' } })] : []),
    body
  ]
  const table = make({ tagName: 'table', children, props })
  return { table, head, body, ops, make }
}

/** Run `fn` while counting canvas:content-changed emissions. */
function countingEvents(fn) {
  const payloads = []
  const off = eventBus.on('canvas:content-changed', payload => payloads.push(payload))
  try { return { result: fn(), payloads } } finally { off() }
}

// ─── closestTable ───────────────────────────────────────────────────────────

test('closestTable: from a <td> it resolves the table, its row and its column', () => {
  const { table, body } = buildTable({ columns: 3, bodyRows: 2 })
  const secondRow = body.components().models[1]
  const thirdCell = secondRow.components().models[2]

  const context = closestTable(thirdCell)
  assert.equal(context.table, table)
  assert.equal(context.cell, thirdCell)
  assert.equal(context.row, secondRow)
  assert.equal(context.rowIndex, 1)
  assert.equal(context.colIndex, 2)
})

test('closestTable: from deep inside a cell it still finds the cell that owns it', () => {
  const { table, body, make } = buildTable({ columns: 2, bodyRows: 1 })
  const firstRow = body.components().models[0]
  const secondCell = firstRow.components().models[1]
  const nested = make({ tagName: 'span' })
  secondCell.components().add(nested)

  const context = closestTable(nested)
  assert.equal(context.table, table)
  assert.equal(context.colIndex, 1)
  assert.equal(context.rowIndex, 0)
})

test('closestTable: from a <tr> there is a row but no column', () => {
  const { table, body } = buildTable({ bodyRows: 3 })
  const context = closestTable(body.components().models[2])
  assert.equal(context.table, table)
  assert.equal(context.rowIndex, 2)
  assert.equal(context.colIndex, null)
  assert.equal(context.cell, null)
})

test('closestTable: a header row has no BODY row index — row ops act on the body', () => {
  const { table, head } = buildTable()
  const headingCell = head.components().models[0].components().models[0]
  const context = closestTable(headingCell)
  assert.equal(context.table, table)
  assert.equal(context.rowIndex, null)   // the <thead> row is not a body row
  assert.equal(context.colIndex, 0)      // …but its column still is one
})

test('closestTable: the table itself gives no positional context, and non-tables give null', () => {
  const { table, make } = buildTable()
  const context = closestTable(table)
  assert.equal(context.table, table)
  assert.equal(context.rowIndex, null)
  assert.equal(context.colIndex, null)
  assert.equal(closestTable(make({ tagName: 'div' })), null)
  assert.equal(closestTable(null), null)
})

// ─── columnCount ────────────────────────────────────────────────────────────

test('columnCount: counts the first body row, ignoring whitespace textnodes', () => {
  const { table, body, make } = buildTable({ columns: 4, bodyRows: 1 })
  body.components().models[0].components().add(make({ type: 'textnode', props: { content: ' ' } }))
  assert.equal(columnCount(table), 4)
})

test('columnCount: falls back to the header row when there are no body rows', () => {
  const { table } = buildTable({ columns: 3, bodyRows: 0 })
  assert.equal(columnCount(table), 3)
})

// ─── Rows ───────────────────────────────────────────────────────────────────

test('addTableRow: ONE add of a complete row definition, at the requested index', () => {
  const { table, body, ops } = buildTable({ columns: 3, bodyRows: 2 })
  const { result, payloads } = countingEvents(() => addTableRow(table, 1))
  assert.equal(result, true)
  // Exactly one write — a row is a single .add(), not a cell-by-cell loop.
  assert.deepEqual(ops, ['add tr -> tbody @1'])
  assert.equal(payloads.length, 1)
  assert.equal(payloads[0], table)

  const inserted = body.components().models[1]
  assert.equal(inserted.get('tagName'), 'tr')
  assert.equal(inserted.components().length, 3)
  assert.equal(inserted.components().models[0].get('tagName'), 'td')
})

test('addTableRow: no index (and an out-of-range one) appends at the end', () => {
  const { table, body } = buildTable({ bodyRows: 2 })
  addTableRow(table, null)
  addTableRow(table, 99)
  assert.equal(body.components().length, 4)
})

test('removeTableRow: drops the named row, or the last one when unspecified', () => {
  const { table, body, ops } = buildTable({ bodyRows: 3 })
  const first = body.components().models[0]
  assert.equal(removeTableRow(table, 0), true)
  assert.equal(body.components().models.includes(first), false)
  assert.deepEqual(ops, ['remove tr from tbody'])

  const last = body.components().models[1]
  assert.equal(removeTableRow(table), true)
  assert.equal(body.components().models.includes(last), false)
})

test('removeTableRow: REFUSES to remove the last body row', () => {
  const { table, body } = buildTable({ bodyRows: 1 })
  const { result, payloads } = countingEvents(() => removeTableRow(table, 0))
  assert.equal(result, false)
  assert.equal(body.components().length, 1)
  assert.deepEqual(payloads, [])
})

test('removeTableRow: a locked row (removable:false) is left alone', () => {
  const { table, body, make } = buildTable({ bodyRows: 1 })
  body.components().add(make({ tagName: 'tr', props: { removable: false } }))
  assert.equal(removeTableRow(table, 1), false)
  assert.equal(body.components().length, 2)
})

// ─── Columns ────────────────────────────────────────────────────────────────

test('addTableColumn: one synchronous pass over head + body, header cells stay <th>', () => {
  const { table, head, body, ops } = buildTable({ columns: 2, bodyRows: 2 })
  const { result, payloads } = countingEvents(() => addTableColumn(table, 1))

  assert.equal(result, true)
  // Three adds back-to-back with nothing between them: the magic-fusion
  // precondition. An await anywhere in this loop would split them across
  // call stacks and turn one Ctrl+Z into three.
  assert.deepEqual(ops, ['add th -> tr @1', 'add td -> tr @1', 'add td -> tr @1'])
  // …and ONE event for the whole gesture.
  assert.equal(payloads.length, 1)
  assert.equal(payloads[0], table)

  assert.equal(head.components().models[0].components().models[1].get('tagName'), 'th')
  for (const row of body.components().models) {
    assert.equal(row.components().length, 3)
    assert.equal(row.components().models[1].get('tagName'), 'td')
  }
})

test('addTableColumn: no index appends to the end of every row', () => {
  const { table, body, ops } = buildTable({ columns: 2, bodyRows: 1 })
  addTableColumn(table, null)
  assert.deepEqual(ops, ['add th -> tr @2', 'add td -> tr @2'])
  assert.equal(body.components().models[0].components().length, 3)
})

test('removeTableColumn: strips the same index from every row in one pass', () => {
  const { table, head, body, ops } = buildTable({ columns: 3, bodyRows: 2 })
  const { result, payloads } = countingEvents(() => removeTableColumn(table, 0))

  assert.equal(result, true)
  assert.deepEqual(ops, ['remove th from tr', 'remove td from tr', 'remove td from tr'])
  assert.equal(payloads.length, 1)
  assert.equal(head.components().models[0].components().length, 2)
  for (const row of body.components().models) assert.equal(row.components().length, 2)
})

test('removeTableColumn: REFUSES to remove the last column', () => {
  const { table, ops } = buildTable({ columns: 1, bodyRows: 2 })
  const { result, payloads } = countingEvents(() => removeTableColumn(table, 0))
  assert.equal(result, false)
  assert.deepEqual(ops, [])
  assert.deepEqual(payloads, [])
})

// ─── Locks ──────────────────────────────────────────────────────────────────

test('every operation bails on a locked table, mutating nothing and emitting nothing', () => {
  const { table, ops } = buildTable({ columns: 3, bodyRows: 3, props: { editable: false } })
  const { payloads } = countingEvents(() => {
    assert.equal(addTableRow(table, 0), false)
    assert.equal(removeTableRow(table, 0), false)
    assert.equal(addTableColumn(table, 0), false)
    assert.equal(removeTableColumn(table, 0), false)
  })
  assert.deepEqual(ops, [])
  assert.deepEqual(payloads, [])
})

// ─── findTableHead + menu items ─────────────────────────────────────────────

test('findTableHead: the <thead> when there is one, null otherwise', () => {
  assert.equal(findTableHead(buildTable({ withHead: true }).table)?.get('tagName'), 'thead')
  assert.equal(findTableHead(buildTable({ withHead: false }).table), null)
})

test('buildTableMenuItems: four items off a cell, and an EMPTY array off-table', () => {
  const { table, body, make } = buildTable({ columns: 2, bodyRows: 2 })
  const items = buildTableMenuItems(body.components().models[0].components().models[0])
  const labels = items.filter(item => !item.separator).map(item => item.label)
  assert.deepEqual(labels, [
    'ctx.table.add-row', 'ctx.table.remove-row', 'ctx.table.add-col', 'ctx.table.remove-col'
  ])
  assert.equal(items[0].separator, true)
  // Nothing to contribute means NO separator either — callers spread this
  // unconditionally (same contract as bsDocsMenuItems).
  assert.deepEqual(buildTableMenuItems(make({ tagName: 'section' })), [])
  assert.deepEqual(buildTableMenuItems(null), [])

  // Add-row/add-column land next to what was clicked, not at the end.
  items.find(item => item.label === 'ctx.table.add-row').action()
  assert.equal(body.components().length, 3)
  assert.equal(closestTable(body.components().models[1]).rowIndex, 1)
  assert.equal(table.components().models.length > 0, true)
})

test('buildTableMenuItems: the removals disable themselves at the last row/column', () => {
  const { table } = buildTable({ columns: 1, bodyRows: 1 })
  const byLabel = Object.fromEntries(
    buildTableMenuItems(table).filter(item => !item.separator).map(item => [item.label, item]))
  assert.equal(byLabel['ctx.table.remove-row'].disabled, true)
  assert.equal(byLabel['ctx.table.remove-col'].disabled, true)
  assert.equal(byLabel['ctx.table.add-row'].disabled, false)
  assert.equal(byLabel['ctx.table.add-col'].disabled, false)
})

test('buildTableMenuItems: everything is disabled on a locked table', () => {
  const { table } = buildTable({ columns: 3, bodyRows: 3, props: { editable: false } })
  const items = buildTableMenuItems(table).filter(item => !item.separator)
  assert.equal(items.length, 4)
  for (const item of items) assert.equal(item.disabled, true, item.label)
})
