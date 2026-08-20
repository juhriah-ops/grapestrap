/**
 * GrapeStrap — Unit: template-section data lint (plugins/blocks-sections)
 *
 * PATH: tests/unit/template-sections-data.test.js
 * ROLE: Lints the hand-authored template-section data modules
 *       (graphite-, orbit-, vista-sections.js) against the authoring rules
 *       they were written to. These are pure data — no runtime, nothing to
 *       exercise — so the thing worth testing is that a later edit cannot
 *       quietly break the contract the insert path assumes: no inline styles,
 *       no unnamespaced classes, no marker that would corrupt the project
 *       stylesheet, no image referenced without being declared, no asset path
 *       pointing at a file that is not on disk, no duplicate section id.
 * DEPENDS: node:test, node:assert, node:fs, both data modules,
 *          plugins/blocks-sections/index.js (read as text — see below)
 * CREATED: 2026-08-17
 * UPDATED: 2026-08-18 — BOOTSTRAP_EXACT/BOOTSTRAP_PATTERNS extended for the
 *          two harvested navbar defs (collapse/dropdown/offcanvas classes,
 *          navbar-expand-*).
 * UPDATED: 2026-08-19 — vista-sections.js added to MODULES; 'min-vh-100'
 *          allowlisted for its full-height photo bands; the declared-image
 *          check now compares the whole path under assets/images/ rather than
 *          just the filename, because Vista is the first module to ship
 *          images in a SUBDIRECTORY (assets/images/thumbs/). Filename-only
 *          matching would have called a thumbs/ declaration a match for a
 *          top-level reference and vice versa.
 *
 * The data modules import nothing, so `node --test` loads them directly with
 * no bundler in front (same reasoning as css-chunks.test.js). index.js is read
 * as TEXT rather than imported: its 12 generic defs are a module-private const
 * and exporting them purely for a test would change shipped code to suit the
 * test. Scanning the source for their ids is enough for the one thing this
 * file needs from them — that no template section reuses a generic id.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as graphite from '../../plugins/blocks-sections/graphite-sections.js'
import * as orbit from '../../plugins/blocks-sections/orbit-sections.js'
import * as vista from '../../plugins/blocks-sections/vista-sections.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const MODULES = [
  { name: 'graphite-sections.js', prefix: 'gs-graphite', ...graphite },
  { name: 'orbit-sections.js',    prefix: 'gs-orbit',    ...orbit },
  { name: 'vista-sections.js',    prefix: 'gs-vista',    ...vista }
]
const ALL_SECTIONS = MODULES.flatMap(m => m.SECTIONS.map(s => ({ ...s, _module: m.name })))

// ─── Bootstrap 5 class allowlist ────────────────────────────────────────────
// A class in section markup is legal only if it is (a) one of Bootstrap's own,
// (b) namespaced `gs-*`, or (c) a Font Awesome icon class. Anything else means
// a template class survived the harvest un-namespaced and will either fight
// the host project's CSS or silently render unstyled.

const BOOTSTRAP_EXACT = new Set([
  // Components used by these sections
  'card', 'card-body', 'card-img-top', 'card-title', 'card-text',
  'btn', 'btn-close',
  'carousel', 'carousel-inner', 'carousel-item', 'carousel-fade',
  'carousel-indicators', 'carousel-caption', 'slide', 'active',
  'form-control', 'form-select', 'form-check', 'form-check-input', 'form-check-label',
  'form-label', 'input-group', 'accordion', 'accordion-item', 'accordion-body',
  'navbar', 'navbar-brand', 'navbar-nav', 'nav-item', 'nav-link',
  'list-unstyled', 'list-inline', 'list-inline-item', 'list-group', 'list-group-item',
  'visually-hidden', 'ratio', 'img-fluid', 'rounded', 'rounded-circle', 'border',
  'row', 'container', 'container-fluid', 'clearfix',
  // Navbar sections (graphite-navbar, orbit-navbar, 2026-08-18)
  'navbar-toggler', 'navbar-toggler-icon', 'navbar-collapse', 'collapse',
  'dropdown', 'dropdown-toggle', 'dropdown-menu', 'dropdown-item',
  'sticky-top', 'fixed-top',
  'offcanvas', 'offcanvas-end', 'offcanvas-header', 'offcanvas-title', 'offcanvas-body',
  // Vista's full-height photo bands (2026-08-19)
  'min-vh-100'
])

const BREAKPOINT = '(sm|md|lg|xl|xxl)'
const BOOTSTRAP_PATTERNS = [
  new RegExp(`^navbar-expand(-${BREAKPOINT})?$`),
  new RegExp(`^container-${BREAKPOINT}$`),
  new RegExp(`^col(-${BREAKPOINT})?(-(auto|1[0-2]|[1-9]))?$`),
  new RegExp(`^offset(-${BREAKPOINT})?-(0|1[01]|[1-9])$`),
  new RegExp(`^row-cols(-${BREAKPOINT})?-(auto|[1-6])$`),
  new RegExp(`^g[xy]?-(${BREAKPOINT}-)?[0-5]$`),
  new RegExp(`^[mp][tbsexy]?-(${BREAKPOINT}-)?(auto|[0-5])$`),
  new RegExp(`^order(-${BREAKPOINT})?-(first|last|[0-5])$`),
  new RegExp(`^d-(${BREAKPOINT}-)?(none|inline|inline-block|block|grid|table|table-row|table-cell|flex|inline-flex)$`),
  new RegExp(`^flex-(${BREAKPOINT}-)?(row|row-reverse|column|column-reverse|wrap|wrap-reverse|nowrap|fill|grow-0|grow-1|shrink-0|shrink-1)$`),
  new RegExp(`^justify-content-(${BREAKPOINT}-)?(start|end|center|between|around|evenly)$`),
  new RegExp(`^align-(items|self|content)-(${BREAKPOINT}-)?(auto|start|end|center|baseline|stretch|between|around)$`),
  new RegExp(`^text-(${BREAKPOINT}-)?(start|end|center)$`),
  /^text-(white|black|body|muted|primary|secondary|success|danger|warning|info|light|dark|reset)(-50)?$/,
  /^bg-(white|body|transparent|primary|secondary|success|danger|warning|info|light|dark)(-subtle)?$/,
  /^(border|rounded)-(top|end|bottom|start|0|1|2|3|circle|pill)$/,
  /^[wh]-(25|50|75|100|auto)$/,
  /^(fw|fst|fs)-[a-z0-9]+$/,
  /^(display|lead|small)(-[1-6])?$/,
  /^(position|top|bottom|start|end)-[a-z0-9]+$/,
  /^(shadow|opacity|overflow|float|z)-[a-z0-9]+$/,
  /^text-(decoration|break|wrap|nowrap|truncate|uppercase|lowercase|capitalize)(-[a-z]+)?$/
]
const FONT_AWESOME = /^fa$|^fas$|^far$|^fab$|^fa-[a-z0-9-]+$/

/**
 * Is this class name allowed in bundled section markup?
 * @param {string} className - A single class token
 * @returns {boolean}
 */
function isAllowedClass(className) {
  if (className.startsWith('gs-')) return true
  if (FONT_AWESOME.test(className)) return true
  if (BOOTSTRAP_EXACT.has(className)) return true
  return BOOTSTRAP_PATTERNS.some(pattern => pattern.test(className))
}

/**
 * Every class token that appears in a `class="…"` attribute of some markup.
 * @param {string} html - Section content
 * @returns {string[]} Class tokens, duplicates included
 */
function classesIn(html) {
  const classes = []
  for (const match of html.matchAll(/\sclass="([^"]*)"/g)) {
    classes.push(...match[1].split(/\s+/).filter(Boolean))
  }
  return classes
}

/**
 * Image paths a section's markup asks for, relative to assets/images/.
 * A subdirectory is part of the path ('thumbs/tile.jpg'), not stripped —
 * see declaredImages().
 */
function imagesInMarkup(html) {
  return [...html.matchAll(/src="assets\/images\/([^"]+)"/g)].map(m => m[1])
}

/** Image paths a chunk asks for via url("../images/…"), same convention. */
function imagesInCss(css) {
  return [...css.matchAll(/url\(["']?\.\.\/images\/([^"')]+)["']?\)/g)].map(m => m[1])
}

/**
 * What a section declares, expressed the same way imagesInMarkup/imagesInCss
 * express what it asks for: the path under assets/images/.
 *
 * Not the bare filename — Vista ships gallery photos in assets/images/thumbs/,
 * and a filename-only comparison would happily match a `thumbs/tile.jpg`
 * declaration against a top-level `tile.jpg` reference (and the reverse),
 * which is precisely the broken-image case this lint exists to catch.
 *
 * @param {object} section - A def from a template's SECTIONS array
 * @returns {Set<string>} Declared paths relative to assets/images/
 */
function declaredImages(section) {
  return new Set((section.assets || [])
    .map(asset => asset.to.replace(/^assets\/images\//, '')))
}

// ─── Markup ────────────────────────────────────────────────────────────────

test('data-lint: no inline styles or inline handlers in any section content', () => {
  for (const section of ALL_SECTIONS) {
    assert.ok(!/\sstyle="/.test(section.content), `${section.id}: content carries a style="…" attribute`)
    assert.ok(!/\son[a-z]+="/.test(section.content), `${section.id}: content carries an inline event handler`)
    assert.ok(!/<script/i.test(section.content), `${section.id}: content carries a <script>`)
  }
})

test('data-lint: every class is Bootstrap-known, gs-namespaced, or Font Awesome', () => {
  const offenders = []
  for (const section of ALL_SECTIONS) {
    for (const className of classesIn(section.content)) {
      if (!isAllowedClass(className)) offenders.push(`${section.id}: "${className}"`)
    }
  }
  assert.deepEqual(offenders, [], `un-namespaced classes survived the harvest:\n${offenders.join('\n')}`)
})

test('data-lint: gs- classes carry their own template prefix', () => {
  // A `gs-orbit-*` class inside a Graphite section (or vice versa) would depend
  // on a chunk that section never brings with it.
  for (const module of MODULES) {
    for (const section of module.SECTIONS) {
      for (const className of classesIn(section.content)) {
        if (!className.startsWith('gs-') || className === 'gs-sec') continue
        assert.ok(
          className.startsWith(module.prefix),
          `${module.name} / ${section.id}: "${className}" is not prefixed "${module.prefix}"`)
      }
    }
  }
})

test('data-lint: every section root carries gs-sec plus its template class', () => {
  for (const module of MODULES) {
    const family = module.prefix   // 'gs-orbit' / 'gs-graphite'
    for (const section of module.SECTIONS) {
      const rootClasses = (section.content.match(/^<[a-z]+[^>]*\sclass="([^"]*)"/) || [])[1] || ''
      const tokens = rootClasses.split(/\s+/)
      assert.ok(tokens.includes('gs-sec'), `${section.id}: root element is missing the gs-sec marker class`)
      assert.ok(tokens.includes(family), `${section.id}: root element is missing the ${family} family class`)
    }
  }
})

// ─── CSS chunks ────────────────────────────────────────────────────────────

test('data-lint: every cssParts key resolves to a chunk in its own CSS_PARTS', () => {
  for (const module of MODULES) {
    for (const section of module.SECTIONS) {
      assert.ok(Array.isArray(section.cssParts) && section.cssParts.length > 0,
        `${section.id}: no cssParts (every template section needs at least its base chunk)`)
      for (const marker of section.cssParts) {
        assert.equal(typeof module.CSS_PARTS[marker], 'string',
          `${module.name} / ${section.id}: cssParts key "${marker}" has no entry in CSS_PARTS`)
      }
    }
  }
})

test('data-lint: the base chunk is listed first in every section', () => {
  // css-chunks.js appends in array order, and equal-specificity rules resolve
  // by order — a section chunk that landed BEFORE the base would silently lose.
  for (const module of MODULES) {
    const base = `${module.prefix.replace('gs-', '')}-base`
    for (const section of module.SECTIONS) {
      assert.equal(section.cssParts[0], base, `${section.id}: first cssParts entry should be "${base}"`)
    }
  }
})

test('data-lint: markers survive being written into a one-line CSS comment', () => {
  // The exact guard css-chunks.js applies at append time (isUsableMarker) —
  // pinned here so bad data fails the build instead of being silently skipped.
  for (const module of MODULES) {
    for (const marker of Object.keys(module.CSS_PARTS)) {
      assert.equal(marker.trim(), marker, `${module.name}: marker "${marker}" has surrounding whitespace`)
      assert.notEqual(marker, '', `${module.name}: empty marker`)
      assert.ok(!/[\r\n]/.test(marker), `${module.name}: marker "${marker}" spans lines`)
      assert.ok(!marker.includes('*/'), `${module.name}: marker "${marker}" would close its own comment`)
    }
  }
})

test('data-lint: no chunk is dead, and markers are unique across both modules', () => {
  const seen = new Set()
  for (const module of MODULES) {
    const used = new Set(module.SECTIONS.flatMap(s => s.cssParts))
    for (const marker of Object.keys(module.CSS_PARTS)) {
      assert.ok(used.has(marker), `${module.name}: CSS_PARTS["${marker}"] is never referenced by a section`)
      assert.ok(!seen.has(marker), `marker "${marker}" is defined in more than one module`)
      seen.add(marker)
    }
  }
})

test('data-lint: chunk url() references stay on the ../images/ convention', () => {
  // Chunks land in the project's global stylesheet (assets/css/), images in
  // assets/images/ — the same sibling pair the starters ship with. Any other
  // form resolves to nothing once the project is served.
  for (const module of MODULES) {
    for (const [marker, text] of Object.entries(module.CSS_PARTS)) {
      for (const url of text.match(/url\([^)]*\)/g) || []) {
        assert.match(url, /^url\("\.\.\/images\/[^"]+"\)$/,
          `${module.name} / ${marker}: ${url} is not url("../images/<file>")`)
      }
    }
  }
})

// ─── Assets ────────────────────────────────────────────────────────────────

test('data-lint: every declared asset resolves on disk and lands under assets/', () => {
  for (const section of ALL_SECTIONS) {
    for (const asset of section.assets || []) {
      assert.ok(asset.from.startsWith('starters/'),
        `${section.id}: asset.from "${asset.from}" must resolve under the app's starters/`)
      assert.ok(existsSync(join(repoRoot, asset.from)),
        `${section.id}: asset.from "${asset.from}" is not on disk`)
      assert.ok(asset.to.startsWith('assets/'),
        `${section.id}: asset.to "${asset.to}" must land under the project's assets/`)
      assert.ok(!asset.to.includes('..'), `${section.id}: asset.to "${asset.to}" walks upward`)
      // Keeping the starter's own filename is what makes the copy a no-op when
      // the host project was started from that same template.
      assert.equal(asset.to.split('/').pop(), asset.from.split('/').pop(),
        `${section.id}: asset renames "${asset.from}" on the way in`)
    }
  }
})

test('data-lint: every image a section renders is declared in its assets', () => {
  for (const module of MODULES) {
    for (const section of module.SECTIONS) {
      const declared = declaredImages(section)
      const referenced = [
        ...imagesInMarkup(section.content),
        ...section.cssParts.flatMap(marker => imagesInCss(module.CSS_PARTS[marker]))
      ]
      for (const file of referenced) {
        assert.ok(declared.has(file),
          `${section.id}: renders "${file}" but never declares it in assets — it would land as a broken image`)
      }
    }
  }
})

// ─── Registration surface ──────────────────────────────────────────────────

test('data-lint: every section has the fields registerSection and the panel read', () => {
  for (const section of ALL_SECTIONS) {
    assert.match(section.id, /^[a-z][a-z0-9-]*$/, `bad section id "${section.id}"`)
    assert.ok(section.label && section.label.length <= 24, `${section.id}: label missing or too long for the row`)
    assert.ok(section.description?.length > 0, `${section.id}: no description (it is the row's title attribute)`)
    assert.ok(section.content?.trim().startsWith('<'), `${section.id}: content is not markup`)
    assert.match(section.preview, /^<svg viewBox="0 0 22 16"[\s\S]*<\/svg>$/,
      `${section.id}: preview must be a bare 22x16 inline SVG`)
    assert.ok(!/\sstyle="/.test(section.preview), `${section.id}: preview SVG carries an inline style`)
  }
})

test('data-lint: section ids are unique across the generic and template families', () => {
  const generic = [...readFileSync(
    join(repoRoot, 'plugins', 'blocks-sections', 'index.js'), 'utf8')
    .matchAll(/^\s{4}id: '([a-z0-9-]+)',$/gm)].map(m => m[1])

  // Guards the regex itself: if the generic defs are ever reshaped, this count
  // fails loudly rather than the uniqueness check passing on an empty list.
  assert.equal(generic.length, 12, 'expected 12 generic section defs in index.js')

  const all = [...generic, ...ALL_SECTIONS.map(s => s.id)]
  const duplicates = all.filter((id, i) => all.indexOf(id) !== i)
  assert.deepEqual(duplicates, [], `duplicate section ids: ${duplicates.join(', ')}`)
})

test('data-lint: no chunk carries a blank line inside its rules', () => {
  // The Style Manager writers use a blank line as the end of a chunk's
  // territory (isInsideSectionChunk in css-rule-utils.js): css-chunks.js
  // appends `\n<marker>\n<text>\n`, so a blank line after the marker can only
  // mean "past this chunk" — which is where a user's own override rule lands.
  // A blank line INSIDE a chunk would make the writers treat its later rules
  // as the user's and edit them in place.
  for (const module of MODULES) {
    for (const [marker, text] of Object.entries(module.CSS_PARTS)) {
      assert.ok(!/\n[ \t]*\n/.test(text),
        `${module.name}: chunk "${marker}" contains a blank line`)
    }
  }
})
