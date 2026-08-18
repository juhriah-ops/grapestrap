/**
 * GrapeStrap — Class-name suggestion source (F6 typeahead)
 *
 * PATH: src/renderer/panels/properties-side/class-suggestions.js
 * ROLE: Feeds the Properties panel's add-class input typeahead
 *       (dialogs/typeahead.js). Two pure, unit-testable functions do the
 *       actual matching; a thin stateful shell merges four candidate sources
 *       and layers in per-source caching so a keystroke doesn't re-parse the
 *       project's whole Bootstrap sheet.
 * DEPENDS: state/project-state.js, state/event-bus.js, editor/grapesjs-init.js
 *          (getEditor, for the in-use-classes wrapper walk),
 *          panels/style-manager/bs-classes.js (allEnumeratedClasses),
 *          shared/bs-docs.js (bsDocForClass, for suggestion hints), i18n.js
 * CREATED: 2026-08-18
 */

import { projectState } from '../../state/project-state.js'
import { eventBus } from '../../state/event-bus.js'
import { allEnumeratedClasses } from '../style-manager/bs-classes.js'
import { bsDocForClass } from '../../../shared/bs-docs.js'
import { t } from '../../i18n.js'

// editor/grapesjs-init.js is NOT a static import here on purpose: it pulls in
// the `grapesjs` package and a Vite-only CSS asset import (drag-resize.js's
// stylesheet) that only resolve under the Vite/Electron renderer — a static
// import would make this module (and therefore its unit tests, which cover
// the two pure functions below) fail to load under plain `node --test`. The
// dynamic import below only ever executes inside collectInUseClasses(),
// which the unit suite never calls.

// Matches a leading-letter-or-underscore class token: `.btn-primary`, `._x`.
// Excludes numeric-leading fragments a value can produce (`.75rem` inside a
// declaration never matches — no digit is a valid FIRST character here).
// Known accepted noise: a selector-shaped substring INSIDE a declaration
// value (rare, and only when it happens to start with a letter/underscore
// right after a literal dot) can in principle be picked up too — string
// surgery over a real CSS sheet, same house rule as css-rule-utils.js. Not
// worth a parser for a suggestion list. Escaped selectors (`.foo\:bar`) are
// not unescaped — Bootstrap 5.3's own sheet has none, so this is a
// documented non-goal rather than an oversight.
const CLASS_SELECTOR_PATTERN = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g

const MAX_SUGGESTIONS = 12

/**
 * Every class selector written in a stylesheet, comment-stripped first so a
 * class name mentioned only in a comment never becomes a suggestion.
 *
 * @param {string} cssText - Full stylesheet source
 * @returns {Set<string>} Class names, without the leading dot, deduped
 */
export function extractClassSelectors(cssText) {
  const withoutComments = String(cssText || '').replace(/\/\*[\s\S]*?\*\//g, '')
  const classes = new Set()
  let match
  CLASS_SELECTOR_PATTERN.lastIndex = 0
  while ((match = CLASS_SELECTOR_PATTERN.exec(withoutComments)) !== null) {
    classes.add(match[1])
  }
  return classes
}

/**
 * Rank suggestion candidates against a query: prefix matches first (shortest
 * first, so `.btn` beats `.btn-primary`), then substring matches, both
 * case-insensitive. Deduped by exact value (two sources naming the same real
 * class is expected and not itself meaningful); classes already on the
 * element are dropped entirely rather than shown disabled — re-adding a
 * class that's already there isn't a choice worth offering.
 *
 * An empty query matches every candidate as a (trivial) prefix match, so
 * this doubles as "list everything" with no special-casing.
 *
 * @param {string} query - What the user has typed so far
 * @param {Array<{value: string, hint?: string}>} candidates - Unranked pool
 * @param {Array<string>} exclude - Classes already on the element
 * @returns {Array<{value: string, hint?: string}>} Ranked, deduped, capped
 *          by the CALLER (this function does not slice to a max length —
 *          getClassSuggestions and attachTypeahead's own maxItems both cap)
 */
export function rankSuggestions(query, candidates, exclude) {
  const queryLower = String(query || '').toLowerCase()
  const excluded = new Set(exclude || [])

  const seen = new Set()
  const prefixMatches = []
  const substringMatches = []

  for (const candidate of candidates || []) {
    const value = candidate?.value
    if (!value || seen.has(value) || excluded.has(value)) continue
    const valueLower = value.toLowerCase()
    if (!valueLower.includes(queryLower)) continue
    seen.add(value)
    if (valueLower.startsWith(queryLower)) prefixMatches.push(candidate)
    else substringMatches.push(candidate)
  }

  // Shorter-first within prefix matches (`.btn` before `.btn-primary`);
  // alphabetical is the tiebreaker for equal-length values in both buckets.
  prefixMatches.sort((a, b) => a.value.length - b.value.length || a.value.localeCompare(b.value))
  substringMatches.sort((a, b) => a.value.localeCompare(b.value))

  return [...prefixMatches, ...substringMatches]
}

// ─── Stateful shell: merge sources + per-source caching ─────────────────────

// Source 2 (bootstrapCSS) and source 3 (globalCSS) are re-parsed only when
// their sheet actually changes — a 280KB Bootstrap sheet re-scanned on every
// keystroke would make the popover feel laggy. `null` means "not computed
// yet for the currently-open project"; computed lazily on first use.
let bootstrapClassCache = null
let globalClassCache = null

function getBootstrapClasses() {
  if (bootstrapClassCache === null) {
    bootstrapClassCache = extractClassSelectors(projectState.current?.bootstrapCSS || '')
  }
  return bootstrapClassCache
}

function getGlobalClasses() {
  if (globalClassCache === null) {
    globalClassCache = extractClassSelectors(projectState.current?.globalCSS || '')
  }
  return globalClassCache
}

eventBus.on('project:bootstrap-css-changed', () => { bootstrapClassCache = null })
eventBus.on('project:css-changed', () => { globalClassCache = null })
// A project switch invalidates BOTH sheet caches — each is scoped to
// whichever project is currently open, and neither of the two events above
// fires on open/close (only on an in-place edit to that sheet).
eventBus.on('project:opened', () => { bootstrapClassCache = null; globalClassCache = null })
eventBus.on('project:closed', () => { bootstrapClassCache = null; globalClassCache = null })

/**
 * Classes already applied ANYWHERE on the canvas, walked fresh on every call
 * (cheap at project scale; no cache invalidation to get wrong). A class in
 * active use elsewhere on the page is a strong "you probably want this too"
 * signal a static enumeration can't offer.
 *
 * @returns {Promise<Set<string>>} Classes in use, empty when there's no
 *          editor/wrapper yet (including: the dynamic import itself fails,
 *          which the unit suite never triggers — see the import note above)
 */
async function collectInUseClasses() {
  let wrapper
  try {
    const { getEditor } = await import('../../editor/grapesjs-init.js')
    wrapper = getEditor()?.getWrapper?.()
  } catch (err) {
    console.error('typeahead: could not reach the canvas editor for in-use classes', err)
    return new Set()
  }
  if (!wrapper) return new Set()

  const classes = new Set()
  const walk = component => {
    for (const cls of component.getClasses?.() || []) classes.add(cls)
    for (const child of component.components()) walk(child)
  }
  walk(wrapper)
  return classes
}

/**
 * Build the ranked suggestion list for the add-class typeahead: merges the
 * static Bootstrap enumeration, the project's own Bootstrap sheet, its
 * globalCSS, and classes already in use on the canvas, then ranks against
 * `query` and drops anything already on the element.
 *
 * Hints: a class the Bootstrap docs matcher recognizes gets its topic name
 * (`Buttons`, `Spacing`, …); a class that ISN'T recognized but does come
 * from one of the project's own sources (its Bootstrap sheet, its globalCSS,
 * or in-use elsewhere on the canvas) gets the generic "project class" hint
 * instead, so the user can tell "this is a real thing I can find a rule
 * for" apart from "this is just what you typed."
 *
 * @param {string} query - Current add-class input value
 * @param {Array<string>} currentClasses - Classes already on the selected element
 * @returns {Promise<Array<{value: string, hint?: string}>>} Ranked
 *          suggestions, capped — async because collecting in-use classes
 *          reaches the GrapesJS editor via a dynamic import (see the note
 *          above collectInUseClasses); attachTypeahead's getItems option
 *          already accepts a Promise, so this needs no special handling
 *          at the call site
 */
export async function getClassSuggestions(query, currentClasses) {
  const enumerated = allEnumeratedClasses()
  const bootstrapSheetClasses = getBootstrapClasses()
  const globalSheetClasses = getGlobalClasses()
  const inUseClasses = await collectInUseClasses()

  const projectSourced = new Set([...bootstrapSheetClasses, ...globalSheetClasses, ...inUseClasses])
  const allValues = new Set([...enumerated, ...projectSourced])

  const candidates = [...allValues].map(value => {
    const doc = bsDocForClass(value)
    const hint = doc ? doc.topic : (projectSourced.has(value) ? t('typeahead.project-class') : undefined)
    return hint ? { value, hint } : { value }
  })

  return rankSuggestions(query, candidates, currentClasses).slice(0, MAX_SUGGESTIONS)
}
