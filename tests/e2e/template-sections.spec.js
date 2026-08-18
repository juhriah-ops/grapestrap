// =============================================================
// PATH: tests/e2e/template-sections.spec.js
// ROLE: End-to-end coverage for the bundled TEMPLATE sections — the Graphite
//       and Orbit page bands the stock blocks-sections plugin registers into
//       the Library panel. Covers the whole three-part payload (images → CSS
//       chunks → markup) through the real click path, plus the two properties
//       that make a bundled section different from a Library ITEM: it lands as
//       a FREE editable copy, and repeat inserts stack as siblings instead of
//       nesting.
// DEPENDS: ./helpers.js (launch, openSeedProject, dismissWelcome,
//          createBundledStarterProject, fileExists),
//          plugins/blocks-sections/{graphite,orbit}-sections.js (the data),
//          src/renderer/editor/{insert-section,css-chunks}.js (the path)
// CREATED: 2026-08-17
//
// Section DATA correctness (namespacing, declared assets, marker hygiene) is
// linted in tests/unit/template-sections-data.test.js — cheap and exhaustive
// there. This file only asserts the things that need a running app.
// =============================================================
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome, createBundledStarterProject, fileExists } from './helpers.js'

// Row counts per Library group. Bumped deliberately when a section is added —
// a silent change here means a section stopped registering.
const GRAPHITE_ROWS = 7
const ORBIT_ROWS = 8
const BUNDLED_ROWS = GRAPHITE_ROWS + ORBIT_ROWS

// The section every insert assertion below drives: it is the one bundled
// section carrying BOTH a CSS-referenced background image and a base chunk,
// so a single insert exercises all three payload legs at once.
const HERO = {
  id: 'orbit-hero-banner',
  rootClass: 'gs-orbit-hero',
  markers: ['orbit-base', 'orbit-hero'],
  image: 'hero.jpg'
}

const markerLine = marker => `/* gs-sec:${marker} */`

/**
 * Click a bundled row's insert button and wait for the markup to land.
 *
 * Counts COMPONENTS carrying the class rather than substring hits in
 * getHtml(): `gs-orbit-hero` is a prefix of `gs-orbit-hero-title`, so a
 * string count reads two hits per insert and never settles.
 *
 * @param {import('@playwright/test').Page} appWindow
 * @param {string} sectionId - Registered section id (the row's data attribute)
 * @param {string} rootClass - The section root's own class
 * @param {number} expectedCount - How many such sections the page should hold
 *        once this insert has landed
 */
async function insertBundled(appWindow, sectionId, rootClass, expectedCount) {
  await appWindow.evaluate(id => {
    document.querySelector(`[data-lib-bundled-insert="${id}"]`).click()
  }, sectionId)
  await appWindow.waitForFunction(
    ({ cls, n }) => window.__gstrap.countByClass(cls) === n,
    { cls: rootClass, n: expectedCount }, { timeout: 15_000 })
}

/**
 * Install a whole-tree class counter on the page under test.
 *
 * Lives on window rather than inline in each evaluate so the wait predicate
 * and the assertions cannot drift apart on what "one section" means.
 *
 * @param {import('@playwright/test').Page} appWindow
 */
async function installCounter(appWindow) {
  await appWindow.evaluate(() => {
    window.__gstrap.countByClass = className => {
      const walk = component => {
        let found = (component.getClasses?.() || []).includes(className) ? 1 : 0
        for (const child of component.components?.() || []) found += walk(child)
        return found
      }
      return walk(window.__gstrap.pluginRegistry.bound.editor.getWrapper())
    }
  })
}

/** How many times a chunk's marker line appears in the project stylesheet. */
async function markerCounts(appWindow, markers) {
  return appWindow.evaluate(list => {
    const css = window.__gstrap.projectState.current.globalCSS || ''
    return list.map(m => css.split(`/* gs-sec:${m} */`).length - 1)
  }, markers)
}

test('Library paints one read-only group per bundled template', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tsec-groups-'))
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await openSeedProject(appWindow, join(projectDir, 'groups.gstrap'))

  const panel = await appWindow.evaluate(() => ({
    groups: [...document.querySelectorAll('.gstrap-lib-group-header')].map(el => el.textContent.trim()),
    bundledRows: document.querySelectorAll('.gstrap-lib-bundled-item').length,
    insertButtons: document.querySelectorAll('[data-lib-bundled-insert]').length,
    previews: document.querySelectorAll('.gstrap-lib-bundled-media svg').length,
    // The project's OWN item selectors must stay empty in a fresh project —
    // bundled rows carry a different class precisely so the two never mix.
    projectRows: document.querySelectorAll('.gstrap-lib-item').length,
    projectInsertButtons: document.querySelectorAll('[data-lib-insert]').length,
    perGroup: [...document.querySelectorAll('.gstrap-lib-bundled-group')].map(group => ({
      name: group.querySelector('.gstrap-lib-group-header').textContent.trim(),
      rows: group.querySelectorAll('.gstrap-lib-bundled-item').length
    }))
  }))

  expect(panel.groups).toEqual(['Graphite', 'Orbit'])
  expect(panel.bundledRows).toBe(BUNDLED_ROWS)
  expect(panel.insertButtons).toBe(BUNDLED_ROWS)
  expect(panel.previews).toBe(BUNDLED_ROWS)   // every def ships its own wireframe
  expect(panel.projectRows).toBe(0)
  expect(panel.projectInsertButtons).toBe(0)
  expect(panel.perGroup).toEqual([
    { name: 'Graphite', rows: GRAPHITE_ROWS },
    { name: 'Orbit', rows: ORBIT_ROWS }
  ])

  // Every row is addressable by its registered id, and carries its description
  // as the hover title.
  const firstRow = await appWindow.evaluate(() => {
    const row = document.querySelector('.gstrap-lib-bundled-item')
    return { id: row.dataset.libBundledId, title: row.getAttribute('title'),
             label: row.querySelector('.gstrap-lib-name').textContent.trim() }
  })
  expect(firstRow.id).toBe('graphite-hero-carousel')
  expect(firstRow.label).toBe('Hero Carousel')
  expect(firstRow.title.length).toBeGreaterThan(0)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('inserting a bundled section lands markup, CSS chunks, and its images', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tsec-insert-'))
  const projectPath = join(projectDir, 'insert.gstrap')
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await openSeedProject(appWindow, projectPath)
  await installCounter(appWindow)

  await insertBundled(appWindow, HERO.id, HERO.rootClass, 1)

  const state = await appWindow.evaluate(cls => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    const html = editor.getHtml()
    return {
      hasGsSec: html.includes('gs-sec'),
      hasFamilyClass: html.includes('gs-orbit'),
      hasRootClass: html.includes(cls),
      // A free copy, not a linked Library instance.
      wrapped: html.includes('data-grpstr-library'),
      selectedTag: (editor.getSelected()?.get('tagName') || '').toLowerCase(),
      cssDirty: window.__gstrap.projectState.globalCssDirty
    }
  }, HERO.rootClass)

  expect(state.hasGsSec).toBe(true)
  expect(state.hasFamilyClass).toBe(true)
  expect(state.hasRootClass).toBe(true)
  expect(state.wrapped).toBe(false)
  expect(state.selectedTag).toBe('section')
  expect(state.cssDirty).toBe(true)

  // Base chunk AND section chunk, each exactly once, base first (order is what
  // keeps equal-specificity section rules winning over the base's).
  expect(await markerCounts(appWindow, HERO.markers)).toEqual([1, 1])
  const order = await appWindow.evaluate(lines => {
    const css = window.__gstrap.projectState.current.globalCSS
    return lines.map(line => css.indexOf(line))
  }, HERO.markers.map(markerLine))
  expect(order[0]).toBeGreaterThan(-1)
  expect(order[0]).toBeLessThan(order[1])

  // The CSS-referenced background image came along, under the starter's own
  // filename, in the project's assets/images/.
  expect(await fileExists(join(dirname(projectPath), 'site', 'assets', 'images', HERO.image))).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('a second insert stacks as a sibling band, and re-appends no CSS', async () => {
  // Regression pin for the nesting bug: the insert selects the section it just
  // dropped, and a <section> is a container — without insert-section.js's
  // sibling rule the second click buried its section inside the first.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tsec-sibling-'))
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await openSeedProject(appWindow, join(projectDir, 'sibling.gstrap'))
  await installCounter(appWindow)

  await insertBundled(appWindow, HERO.id, HERO.rootClass, 1)
  await insertBundled(appWindow, HERO.id, HERO.rootClass, 2)

  const tree = await appWindow.evaluate(cls => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    const wrapper = editor.getWrapper()
    const heroes = wrapper.components().models.filter(c => (c.getClasses?.() || []).includes(cls))
    // Descendants only — a hero's own root obviously carries the class, and so
    // does its `gs-orbit-hero-title` child if you match on substrings, which is
    // exactly the trap this walk avoids.
    const descendantsWithClass = component => {
      let found = 0
      for (const child of component.components?.() || []) {
        if ((child.getClasses?.() || []).includes(cls)) found++
        found += descendantsWithClass(child)
      }
      return found
    }
    return {
      topLevelHeroes: heroes.length,
      // Neither hero may contain the other at any depth.
      nested: heroes.some(hero => descendantsWithClass(hero) > 0),
      // …and they are adjacent, in insert order.
      indexes: heroes.map(hero => wrapper.components().indexOf(hero))
    }
  }, HERO.rootClass)

  expect(tree.topLevelHeroes).toBe(2)
  expect(tree.nested).toBe(false)
  expect(tree.indexes[1]).toBe(tree.indexes[0] + 1)

  // Second insert must not duplicate a single rule block.
  expect(await markerCounts(appWindow, HERO.markers)).toEqual([1, 1])

  // A THIRD insert lands beside them too, not inside — the rule holds when the
  // anchor is a sibling that already has a section after it.
  await insertBundled(appWindow, HERO.id, HERO.rootClass, 3)
  const third = await appWindow.evaluate(cls => {
    const wrapper = window.__gstrap.pluginRegistry.bound.editor.getWrapper()
    return wrapper.components().models.filter(c => (c.getClasses?.() || []).includes(cls)).length
  }, HERO.rootClass)
  expect(third).toBe(3)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('inserting into an Orbit-started project renders and leaves its image alone', async () => {
  // The awkward case the asset copy exists for: the host project ALREADY has
  // hero.jpg (its starter bundle put it there). The copy must skip it rather
  // than overwrite — a user who replaced the starter's photo keeps theirs.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tsec-orbit-'))
  const projectPath = join(projectDir, 'orbit.gstrap')
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await createBundledStarterProject(appWindow, projectPath, { starterId: 'orbit' })
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-cid]').length > 0, null, { timeout: 15_000 })
  await installCounter(appWindow)

  const heroPath = join(projectDir, 'site', 'assets', 'images', HERO.image)
  expect(await fileExists(heroPath)).toBe(true)
  // Stamp the file so an overwrite would be unmistakable.
  const sentinel = Buffer.from('not really a jpeg — skip-if-exists sentinel')
  await fsp.writeFile(heroPath, sentinel)

  await insertBundled(appWindow, HERO.id, HERO.rootClass, 1)

  expect(await fsp.readFile(heroPath)).toEqual(sentinel)

  // The chunks landed in the starter's OWN stylesheet (Orbit points globalCSS
  // at its theme.css), namespaced so they cannot collide with it.
  expect(await markerCounts(appWindow, HERO.markers)).toEqual([1, 1])
  const css = await appWindow.evaluate(() => window.__gstrap.projectState.current.globalCSS)
  expect(css).toContain('.hero-banner')        // the starter's own rules, untouched
  expect(css).toContain('.gs-orbit-hero {')    // and ours, beside them

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('an inserted section is a free copy — every child is selectable', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tsec-free-'))
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await openSeedProject(appWindow, join(projectDir, 'free.gstrap'))
  await installCounter(appWindow)

  await insertBundled(appWindow, HERO.id, HERO.rootClass, 1)

  const editable = await appWindow.evaluate(cls => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    const section = editor.getWrapper().components().models
      .find(c => (c.getClasses?.() || []).includes(cls))

    // Walk to the deepest ELEMENT component — the heading inside the
    // container — and select it the way a canvas click would. Textnode
    // components are skipped: GrapesJS never makes those selectable, in any
    // component, so reaching one would prove nothing about locking.
    let node = section
    for (;;) {
      const next = (node.components?.() || []).models?.find(c => c.get('type') !== 'textnode')
      if (!next) break
      node = next
    }

    editor.select(node)
    const selected = editor.getSelected()
    return {
      reachedDepth: node !== section,
      selectedIsChild: selected?.cid === node.cid,
      // lock.js sets these to false on Library-instance descendants.
      selectable: node.get('selectable') !== false,
      editable: node.get('editable') !== false,
      hoverable: node.get('hoverable') !== false,
      // Deleting a child works — nothing is guarding the subtree.
      removable: node.get('removable') !== false,
      wrapped: editor.getHtml().includes('data-grpstr-library')
    }
  }, HERO.rootClass)

  expect(editable.reachedDepth).toBe(true)
  expect(editable.selectedIsChild).toBe(true)
  expect(editable.selectable).toBe(true)
  expect(editable.editable).toBe(true)
  expect(editable.hoverable).toBe(true)
  expect(editable.removable).toBe(true)
  expect(editable.wrapped).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('undo removes the section markup; its CSS chunks deliberately stay', async () => {
  // The documented asymmetry (see insert-section.js's undo contract): globalCSS
  // lives outside the canvas undo stack, an orphaned namespaced chunk matches
  // nothing, and re-inserting is idempotent — so undo drops the markup only.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tsec-undo-'))
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await openSeedProject(appWindow, join(projectDir, 'undo.gstrap'))
  await installCounter(appWindow)

  await insertBundled(appWindow, HERO.id, HERO.rootClass, 1)
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'edit:undo'))
  await appWindow.waitForFunction(
    cls => window.__gstrap.countByClass(cls) === 0, HERO.rootClass, { timeout: 10_000 })

  expect(await markerCounts(appWindow, HERO.markers)).toEqual([1, 1])

  // Re-inserting after the undo restores the markup and still does not
  // duplicate the rules.
  await insertBundled(appWindow, HERO.id, HERO.rootClass, 1)
  expect(await markerCounts(appWindow, HERO.markers)).toEqual([1, 1])

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
