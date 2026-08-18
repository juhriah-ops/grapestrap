/**
 * GrapeStrap — Unit: element field matrix (panels/element-fields.js)
 *
 * PATH: tests/unit/element-fields.test.js
 * ROLE: Pins the three things the two rendering surfaces (the bottom property
 *       strip and the Properties panel's Attributes section) trust blindly:
 *       first-match-wins matcher precedence (`a.btn` MUST beat plain `a`, and
 *       its field set must stay a superset so a button-styled link never
 *       loses target/rel), the empty-string-deletes attribute idiom that
 *       keeps `href=""` out of saved pages, and applyField()'s commit
 *       contract — locked components are inert, a retag's replacement gets
 *       selected, and exactly ONE canvas:content-changed leaves per gesture.
 * DEPENDS: node:test, node:assert,
 *          ../../src/renderer/panels/element-fields.js,
 *          ../../src/renderer/state/event-bus.js,
 *          ../../src/renderer/plugin-host/registry.js
 * CREATED: 2026-08-18
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getFieldsFor, applyField, setAttr, toggleClass } from '../../src/renderer/panels/element-fields.js'
import { eventBus } from '../../src/renderer/state/event-bus.js'
import { pluginRegistry } from '../../src/renderer/plugin-host/registry.js'

// ─── Backbone-shaped stubs ──────────────────────────────────────────────────
// Only the surface element-fields.js actually touches, with every mutation
// recorded in `calls` so the tests can assert HOW a change was made, not just
// that the end state looks right.

function makeCollection(models = []) {
  const list = [...models]
  return {
    models: list,
    get length() { return list.length },
    at: i => list[i],
    indexOf: model => list.indexOf(model),
    add(def, opts = {}) {
      const at = Number.isInteger(opts.at) ? opts.at : list.length
      list.splice(at, 0, def)
      return def
    },
    remove(model) {
      const idx = list.indexOf(model)
      if (idx >= 0) list.splice(idx, 1)
    }
  }
}

function makeComponent({ tagName = 'div', type = null, attributes = {}, classes = [], children = [], props = {} } = {}) {
  const attrs = { ...attributes }
  let classList = [...classes]
  const collection = makeCollection(children)
  const component = {
    calls: [],
    replacement: null,
    parentRef: null,
    get: key => {
      if (key === 'tagName') return tagName
      if (key === 'type') return type
      return props[key]
    },
    getAttributes: () => ({ ...attrs }),
    setAttributes(next) {
      component.calls.push(['setAttributes', { ...next }])
      for (const key of Object.keys(attrs)) delete attrs[key]
      Object.assign(attrs, next)
    },
    addAttributes(next) {
      component.calls.push(['addAttributes', { ...next }])
      Object.assign(attrs, next)
    },
    getClasses: () => [...classList],
    setClass(next) {
      component.calls.push(['setClass', [...next]])
      classList = [...next]
    },
    components(value) {
      if (value === undefined) return collection
      component.calls.push(['components', value])
      collection.models.length = 0
      for (const item of [].concat(value)) collection.models.push(item)
      return collection
    },
    parent: () => component.parentRef,
    replaceWith(html) {
      component.calls.push(['replaceWith', html])
      return component.replacement
    },
    remove() { component.calls.push(['remove']) }
  }
  for (const child of children) child.parentRef = component
  return component
}

const textNode = content => makeComponent({ type: 'textnode', props: { content } })

/** Run `fn` while counting canvas:content-changed emissions. */
function countingEvents(fn) {
  const payloads = []
  const off = eventBus.on('canvas:content-changed', payload => payloads.push(payload))
  try { return { result: fn(), payloads } } finally { off() }
}

// ─── Matcher precedence ─────────────────────────────────────────────────────

test('getFieldsFor: a.btn matches the button entry BEFORE the plain link entry', () => {
  const buttonLink = makeComponent({ tagName: 'a', classes: ['btn', 'btn-primary'] })
  const plainLink = makeComponent({ tagName: 'a' })
  assert.equal(getFieldsFor(buttonLink).id, 'link-button')
  assert.equal(getFieldsFor(plainLink).id, 'link')
})

test('getFieldsFor: the a.btn field set is a SUPERSET of the plain link set', () => {
  // The property strip renders whatever the matched entry offers. Before this
  // matrix existed it showed href + target for EVERY <a>, button-styled or
  // not — so an a.btn entry missing either would be a user-visible regression.
  const linkKeys = getFieldsFor(makeComponent({ tagName: 'a' })).fields.map(f => f.key)
  const buttonKeys = getFieldsFor(makeComponent({ tagName: 'a', classes: ['btn'] })).fields.map(f => f.key)
  for (const key of linkKeys) assert.ok(buttonKeys.includes(key), `a.btn is missing "${key}"`)
  assert.ok(buttonKeys.includes('label'))
})

test('getFieldsFor: the rest of the tag matrix, and null for anything unmatched', () => {
  const cases = [
    [{ tagName: 'button' }, 'button'],
    [{ tagName: 'img' }, 'image'],
    [{ tagName: 'h1' }, 'heading'],
    [{ tagName: 'h6' }, 'heading'],
    [{ tagName: 'table' }, 'table'],
    [{ tagName: 'div', classes: ['table'] }, 'table'],
    [{ tagName: 'ul' }, 'list'],
    [{ tagName: 'ol' }, 'list'],
    [{ tagName: 'iframe' }, 'iframe']
  ]
  for (const [spec, expectedId] of cases) {
    assert.equal(getFieldsFor(makeComponent(spec))?.id, expectedId,
      `${spec.tagName}${(spec.classes || []).map(c => '.' + c).join('')}`)
  }
  assert.equal(getFieldsFor(makeComponent({ tagName: 'div' })), null)
  assert.equal(getFieldsFor(makeComponent({ tagName: 'p' })), null)
  assert.equal(getFieldsFor(null), null)
})

// ─── setAttr ────────────────────────────────────────────────────────────────

test('setAttr: an empty value DELETES the key instead of writing attr=""', () => {
  const link = makeComponent({ tagName: 'a', attributes: { href: '/old', target: '_blank' } })
  setAttr(link, 'href', '')
  // setAttributes with the remaining keys — never addAttributes({href: ''}),
  // which would persist href="" into every saved page.
  assert.deepEqual(link.calls, [['setAttributes', { target: '_blank' }]])
  assert.deepEqual(link.getAttributes(), { target: '_blank' })
})

test('setAttr: a non-empty value adds the single key and leaves the rest alone', () => {
  const link = makeComponent({ tagName: 'a', attributes: { target: '_blank' } })
  setAttr(link, 'href', '/docs')
  assert.deepEqual(link.calls, [['addAttributes', { href: '/docs' }]])
  assert.deepEqual(link.getAttributes(), { target: '_blank', href: '/docs' })
})

test('setAttr: null/undefined behave like an empty string, and a missing key is a no-op', () => {
  const link = makeComponent({ tagName: 'a', attributes: { href: '/x' } })
  setAttr(link, 'href', null)
  assert.deepEqual(link.getAttributes(), {})
  setAttr(link, '', 'value')
  setAttr(null, 'href', 'value')
  assert.equal(link.calls.length, 1)
})

// ─── toggleClass ────────────────────────────────────────────────────────────

test('toggleClass: adds and removes exactly one class through a single setClass write', () => {
  const table = makeComponent({ tagName: 'table', classes: ['table', 'table-sm'] })
  toggleClass(table, 'table-striped', true)
  assert.deepEqual(table.getClasses(), ['table', 'table-sm', 'table-striped'])
  toggleClass(table, 'table-sm', false)
  assert.deepEqual(table.getClasses(), ['table', 'table-striped'])
  // One write per toggle — the "class group write = ONE undo entry" contract.
  assert.equal(table.calls.filter(([name]) => name === 'setClass').length, 2)
})

test('toggleClass: a no-op toggle writes nothing (no hollow undo entry)', () => {
  const table = makeComponent({ tagName: 'table', classes: ['table'] })
  toggleClass(table, 'table', true)        // already on
  toggleClass(table, 'table-hover', false) // already off
  assert.deepEqual(table.calls, [])
})

// ─── The label field ────────────────────────────────────────────────────────

test('label field: reads the sole textnode child, and disables itself on any other shape', () => {
  const simple = makeComponent({ tagName: 'button', type: 'text', children: [textNode('Send')] })
  const labelField = getFieldsFor(simple).fields.find(f => f.key === 'label')
  assert.equal(labelField.get(simple), 'Send')
  assert.equal(labelField.disabled(simple), false)

  // An icon + text button would be destroyed by rewriting the children.
  const compound = makeComponent({
    tagName: 'button',
    children: [makeComponent({ tagName: 'i' }), textNode('Send')]
  })
  assert.equal(labelField.disabled(compound), true)
  assert.equal(labelField.get(compound), '')
})

test('label field: commits as a textnode DEFINITION, never as an HTML string', () => {
  // User label text must not be re-parsed as markup — "<b>hi" would otherwise
  // become live tags (or get silently dropped, per the parser contract in
  // shortcuts/table-actions.js).
  const button = makeComponent({ tagName: 'button', type: 'text', children: [textNode('Old')] })
  const labelField = getFieldsFor(button).fields.find(f => f.key === 'label')
  labelField.set(button, '<b>New')
  assert.deepEqual(button.calls, [['components', [{ type: 'textnode', content: '<b>New' }]]])
})

// ─── applyField ─────────────────────────────────────────────────────────────

test('applyField: a locked component is inert — no mutation, no event', () => {
  const link = makeComponent({ tagName: 'a', attributes: { href: '/x' }, props: { editable: false } })
  const hrefField = getFieldsFor(link).fields.find(f => f.key === 'href')
  const { result, payloads } = countingEvents(() => applyField(link, hrefField, '/hijacked'))
  assert.equal(result, null)
  assert.deepEqual(link.calls, [])
  assert.deepEqual(payloads, [])
  assert.deepEqual(link.getAttributes(), { href: '/x' })
})

test('applyField: one commit emits canvas:content-changed EXACTLY once, carrying the component', () => {
  const image = makeComponent({ tagName: 'img', attributes: { src: 'a.png' } })
  const srcField = getFieldsFor(image).fields.find(f => f.key === 'src')
  const { payloads } = countingEvents(() => applyField(image, srcField, 'b.png'))
  assert.equal(payloads.length, 1)
  assert.equal(payloads[0], image)
  assert.deepEqual(image.getAttributes(), { src: 'b.png' })
})

test('applyField: a retag selects the replacement component and reports it back', () => {
  const heading = makeComponent({ tagName: 'h2', classes: ['display-4'], attributes: { id: 'lead' } })
  heading.getInnerHTML = () => 'Title'
  const replacement = makeComponent({ tagName: 'h3' })
  heading.replacement = replacement

  const selected = []
  const previousEditor = pluginRegistry.bound.editor
  pluginRegistry.setBound('editor', { select: component => selected.push(component) })
  try {
    const levelField = getFieldsFor(heading).fields.find(f => f.key === 'heading-level')
    const { result, payloads } = countingEvents(() => applyField(heading, levelField, 'h3'))
    assert.equal(result, replacement)
    assert.deepEqual(selected, [replacement])
    assert.equal(payloads.length, 1)
    assert.equal(payloads[0], replacement)
    // Classes and attributes ride along into the new tag — losing them is the
    // classic retag bug.
    const [[, html]] = heading.calls.filter(([name]) => name === 'replaceWith')
    assert.ok(html.startsWith('<h3 '), html)
    assert.ok(html.includes('id="lead"'), html)
    assert.ok(html.includes('class="display-4"'), html)
    assert.ok(html.endsWith('>Title</h3>'), html)
  } finally {
    pluginRegistry.setBound('editor', previousEditor)
  }
})

test('applyField: an unknown heading level mutates nothing but still repaints', () => {
  const heading = makeComponent({ tagName: 'h2' })
  heading.getInnerHTML = () => ''
  const levelField = getFieldsFor(heading).fields.find(f => f.key === 'heading-level')
  const { payloads } = countingEvents(() => applyField(heading, levelField, 'h7'))
  assert.deepEqual(heading.calls, [])
  // The gesture still reports "nothing changed" to the surfaces so they
  // repaint back to the real tag rather than showing the rejected pick.
  assert.equal(payloads.length, 1)
})

test('applyField: list actions append an <li> and drop the last one, disabling at empty', () => {
  const itemOne = makeComponent({ tagName: 'li', children: [textNode('One')] })
  const itemTwo = makeComponent({ tagName: 'li', children: [textNode('Two')] })
  const list = makeComponent({ tagName: 'ul', children: [itemOne, itemTwo] })
  const fields = Object.fromEntries(getFieldsFor(list).fields.map(f => [f.key, f]))

  applyField(list, fields['list-add-item'], null)
  // <li> is one of the few tags that survives HTML fragment parsing, so the
  // string form is deliberate here — and keeps the item text-editable.
  assert.equal(list.components().models.at(-1), '<li>Item</li>')

  applyField(list, fields['list-remove-item'], null)
  assert.deepEqual(itemTwo.calls, [['remove']])

  const emptyList = makeComponent({ tagName: 'ul' })
  const emptyFields = Object.fromEntries(getFieldsFor(emptyList).fields.map(f => [f.key, f]))
  assert.equal(emptyFields['list-remove-item'].disabled(emptyList), true)
  assert.equal(emptyFields['list-remove-item'].disabled(list), false)
})

test('applyField: a checkbox field toggles the class it owns', () => {
  const table = makeComponent({ tagName: 'table', classes: ['table'] })
  const striped = getFieldsFor(table).fields.find(f => f.key === 'table-striped')
  assert.equal(striped.kind, 'checkbox')
  assert.equal(striped.get(table), false)
  applyField(table, striped, true)
  assert.deepEqual(table.getClasses(), ['table', 'table-striped'])
  assert.equal(striped.get(table), true)
})
