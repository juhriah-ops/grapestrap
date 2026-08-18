/**
 * GrapeStrap — Style Manager: CSS-rule helpers for project style.css
 *
 * The pseudo-class state bar (chunk C) writes pseudo-state styles to project
 * `style.css` (held in `projectState.current.globalCSS`), and the Background
 * sub-panel writes bare-state rules through the same surgery (readBareRule /
 * writeBareRule, here since 2026-08-03). These helpers do the minimal CSS
 * string surgery — read, upsert, remove — for a single whole-selector rule.
 * `mergeBareRuleProps` (2026-08-17) layers the read → merge → write discipline
 * on top for panels that own one prop group inside a shared rule (custom
 * colour chips, the opacity slider). `findSelectorRange` (2026-08-18) is the
 * read-only counterpart: it locates a selector for jump-to-rule instead of
 * editing it, and reuses the same anchoring so navigation can't land on a
 * rule the writers would refuse to touch.
 * We deliberately don't pull in a full CSS AST parser: round-tripping
 * comments and complex sheets risks lossy edits the user would notice. The
 * string operations only ever touch the one rule whose ENTIRE selector is
 * the target (boundary-anchored — see SELECTOR_BOUNDARY), leaving the rest
 * of the file byte-identical.
 *
 * Round-trip contract:
 *   - readRule(globalCSS, '.btn', 'hover') → { 'background-color': '#0d6efd' }
 *     when `.btn:hover { background-color: #0d6efd; }` is present.
 *   - writeRule(globalCSS, '.btn', 'hover', {color: 'red'}) inserts or replaces
 *     the rule. If `props` is empty, the rule is removed.
 *   - The output ends with a trailing newline if the input had one (or if the
 *     file was empty / non-existent).
 */

// A selector only counts as a match when it is the rule's WHOLE selector:
// the match must sit at the start of the sheet or right after a rule end
// (`}`), a statement end (`;`, e.g. @import), or a comment close. Unanchored,
// `.item` matched the TAIL of `.hero .item { … }` and the writers clobbered
// the compound rule in place — the v0.1.0 acceptance forensics found a
// Graphite theme rule rewritten this way (2026-08-03). `{` is deliberately
// NOT a boundary: the first rule inside an `@media { … }` block is
// breakpoint-scoped and must never be read or rewritten as the base rule
// (later rules inside the block still match after their sibling's `}` — the
// known cost of string surgery without a CSS AST, same as before).
const SELECTOR_BOUNDARY = '(^|[};]|\\*\\/)'

function escapeSelector(selector) {
  return selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// One rule per selector+pseudo. Groups: (1) boundary, (2) leading whitespace
// — both preserved by the writers — and (3) the rule body. Whitespace around
// `{` and inside the body is permissive.
function buildRuleRegex(selector, pseudo) {
  return new RegExp(
    `${SELECTOR_BOUNDARY}(\\s*)${escapeSelector(selector)}\\s*:${pseudo}\\s*\\{([^}]*)\\}\\s*`
  )
}

function propsToBody(props) {
  const lines = Object.entries(props)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `  ${k}: ${v};`)
  return lines.join('\n')
}

function bodyToProps(body) {
  const out = {}
  for (const decl of body.split(';')) {
    const idx = decl.indexOf(':')
    if (idx === -1) continue
    const k = decl.slice(0, idx).trim()
    const v = decl.slice(idx + 1).trim()
    if (k) out[k] = v
  }
  return out
}

export function readRule(globalCSS, selector, pseudo) {
  if (!globalCSS) return {}
  const match = buildRuleRegex(selector, pseudo).exec(globalCSS)
  if (!match) return {}
  return bodyToProps(match[3] || '')
}

/**
 * Insert or replace `selector:pseudo { ... }` in globalCSS.
 * If `props` is empty (no truthy values), the rule is removed.
 */
export function writeRule(globalCSS, selector, pseudo, props) {
  const body = propsToBody(props || {})
  const newRule = body ? `${selector}:${pseudo} {\n${body}\n}\n` : ''
  return upsertRule(globalCSS, buildRuleRegex(selector, pseudo), newRule)
}

// Shared writer core: replace the matched rule in place (keeping the boundary
// + leading whitespace the regex captured), remove it when newRule is empty,
// or append when nothing matched. Function replacements — a `$` inside a CSS
// value must never be interpreted as a replacement pattern.
function upsertRule(globalCSS, re, newRule) {
  const base = globalCSS || ''
  const hasMatch = re.test(base)

  if (!newRule) {
    if (!hasMatch) return base
    return base.replace(re, (m, b, lead) => b + lead).replace(/\n{3,}/g, '\n\n')
  }
  if (hasMatch) {
    return base.replace(re, (m, b, lead) => b + lead + newRule)
  }
  // Append. Add a leading newline if the file is non-empty and doesn't end in one.
  const sep = base.length === 0 ? '' : (base.endsWith('\n') ? '\n' : '\n\n')
  return base + sep + newRule
}

// ─── Bare-state (no-pseudo) rule surgery ─────────────────────────────────────
// Moved here from background.js (2026-08-03) so the anchoring fix and its
// unit tests cover both writers. Deliberately parallel to readRule/writeRule
// rather than a pseudo='' special case: the bare regex needs `(?!:)` so
// `.cls` never matches `.cls:hover { … }`, and folding that into the pseudo
// builder is exactly the finicky regex engineering the split avoids.

function buildBareRuleRegex(selector) {
  return new RegExp(
    `${SELECTOR_BOUNDARY}(\\s*)${escapeSelector(selector)}(?!:)\\s*\\{([^}]*)\\}\\s*`
  )
}

/** Read a bare-state `<selector> { ... }` rule (no pseudo). */
export function readBareRule(globalCSS, selector) {
  if (!globalCSS || !selector) return {}
  const match = buildBareRuleRegex(selector).exec(globalCSS)
  if (!match) return {}
  return bodyToProps(match[3] || '')
}

/**
 * Insert or replace the bare-state `<selector> { ... }` rule in globalCSS.
 * If `props` is empty (no truthy values), the rule is removed.
 */
export function writeBareRule(globalCSS, selector, props) {
  const body = propsToBody(props || {})
  const newRule = body ? `${selector} {\n${body}\n}\n` : ''
  return upsertRule(globalCSS, buildBareRuleRegex(selector), newRule)
}

/**
 * Merge one prop group into a selector's bare-state rule, leaving every other
 * declaration in that rule untouched.
 *
 * This is the "merge discipline" the Background sub-panel established, lifted
 * into a pure function so the Custom-colour chip and the Opacity slider don't
 * each re-implement read → strip → merge → write (and so it can be unit
 * tested without a project in memory).
 *
 * A prop whose value is '' / null / undefined is REMOVED from the rule — that
 * is how every "Clear" affordance erases just its own property. When the merge
 * empties the rule entirely, writeBareRule drops the whole block.
 *
 * @param {string} globalCSS - The project stylesheet source.
 * @param {string} selector  - Whole selector to target, e.g. '.cta-link'.
 * @param {object} props     - Prop group to merge, e.g. { opacity: '0.5' }.
 * @returns {string} The new stylesheet source (input unchanged if no selector).
 */
export function mergeBareRuleProps(globalCSS, selector, props) {
  const base = globalCSS || ''
  if (!selector) return base
  const merged = readBareRule(base, selector)
  for (const [key, value] of Object.entries(props || {})) {
    if (value === '' || value == null) delete merged[key]
    else merged[key] = String(value)
  }
  return writeBareRule(base, selector, merged)
}

// ─── Selector lookup (read-only, for jump-to-rule) ───────────────────────────
// Jump-to-rule (F3a) needs WHERE a selector is written, not what it declares:
// Cascade rows and class chips hand a selector to css-jump.js, which turns the
// offset range into a Monaco selection. It reuses the anchoring above rather
// than a fresh regex — a jump that put the caret on `.hero .item` when the user
// asked for `.item` would be the same tail-match lie the writers were fixed
// for, only rendered as a caret position instead of a clobbered rule.

// SELECTOR_BOUNDARY plus `,`: a selector that is one member of a comma group
// (`.a, .btn, .c { … }`) is a legitimate place to SEND someone, even though the
// writers refuse to touch it (they replace whole rules; navigation only reads).
// The same widening means a grouped selector nested in an @media block IS
// reachable, while a lone first-rule-in-block still isn't — see the caveat on
// SELECTOR_BOUNDARY. Both are honest for navigation: the offset returned is a
// real occurrence of the selector either way.
const SELECTOR_GROUP_BOUNDARY = '(^|[};,]|\\*\\/)'

/**
 * Locate a selector's own text inside a stylesheet.
 *
 * Two passes, best first:
 *   1. whole-selector rule — `selector` followed by `{` (the shape the writers
 *      own), boundary-anchored exactly as readBareRule is;
 *   2. comma-group member — `selector` followed by `,` or `{`, allowing a
 *      preceding comma as the boundary.
 * The pseudo/attribute/combinator spelling is passed through verbatim, so the
 * caller decides what it is asking for (`.btn`, `.btn:hover`, `a[href]`).
 *
 * @param {string} cssText - Full stylesheet source to search
 * @param {string} selector - Selector text, exactly as it should appear
 * @returns {{start: number, end: number}|null} Offsets of the SELECTOR
 *          occurrence (not the rule body), or null when it is not written in
 *          this sheet — callers render a disabled menu item or toast rather
 *          than jumping somewhere arbitrary.
 */
export function findSelectorRange(cssText, selector) {
  if (!cssText || !selector) return null
  const escaped = escapeSelector(selector)
  const wholeSelector = new RegExp(`${SELECTOR_BOUNDARY}(\\s*)${escaped}\\s*\\{`)
  const groupMember = new RegExp(`${SELECTOR_GROUP_BOUNDARY}(\\s*)${escaped}\\s*[,{]`)
  const match = wholeSelector.exec(cssText) || groupMember.exec(cssText)
  if (!match) return null
  // Groups 1 + 2 are the boundary char and the whitespace before the selector;
  // skipping both puts `start` on the selector's first character.
  const start = match.index + match[1].length + match[2].length
  return { start, end: start + selector.length }
}

/**
 * Pick a usable selector for the selected component. Prefers the first class
 * NOT in our BS-utility patterns (so `<a class="btn btn-primary cta-link">` →
 * `.cta-link`). Falls back to the element's id, then null.
 *
 * Returning null is a signal to the caller that pseudo-state styling can't
 * be applied without first adding a custom class — the bar should toast and
 * stay in normal state.
 */
export function pickSelector(component, isBsUtility) {
  if (!component) return null
  const classes = component.getClasses?.() || []
  for (const c of classes) {
    if (!isBsUtility(c)) return '.' + c
  }
  const id = component.getId?.()
  if (id && !id.startsWith('i')) return '#' + id  // GrapesJS auto-ids start with 'i' + hex
  return null
}

/**
 * Common BS-utility class shape detector. Conservative — if we don't recognise
 * the shape, treat as user-custom. Used by pickSelector.
 *
 * Patterns covered: spacing (m/p), display (d-x), flex utilities, text-x,
 * bg-x, border-x, rounded, shadow, w-x and h-x and mw/mh/vw/vh, gap-x,
 * align-x, justify-x, order-x, fs-x, fw-x, opacity-x, visible/invisible.
 */
export function isBsUtility(cls) {
  return BS_UTILITY_PATTERNS.some(re => re.test(cls))
}

const BS_UTILITY_PATTERNS = [
  /^[mp][trblxy]?(?:-(?:sm|md|lg|xl|xxl))?-(?:auto|n?[0-5])$/,
  /^d(?:-(?:sm|md|lg|xl|xxl))?-(?:none|inline|inline-block|block|flex|inline-flex|grid|inline-grid|table|table-row|table-cell)$/,
  /^(?:visible|invisible)$/,
  /^flex(?:-(?:sm|md|lg|xl|xxl))?-(?:row|row-reverse|column|column-reverse|wrap|wrap-reverse|nowrap|fill|grow-0|grow-1|shrink-0|shrink-1)$/,
  /^justify-content(?:-(?:sm|md|lg|xl|xxl))?-(?:start|end|center|between|around|evenly)$/,
  /^align-(?:items|self|content)(?:-(?:sm|md|lg|xl|xxl))?-(?:start|end|center|baseline|stretch|between|around)$/,
  /^order(?:-(?:sm|md|lg|xl|xxl))?-(?:first|last|[0-5])$/,
  /^gap(?:-[xy])?(?:-(?:sm|md|lg|xl|xxl))?-[0-5]$/,
  /^text-(?:start|end|center|justify|wrap|nowrap|truncate|lowercase|uppercase|capitalize|decoration-(?:underline|line-through|none)|primary|secondary|success|danger|warning|info|light|dark|body|muted|white|black|body-emphasis|body-secondary|body-tertiary|reset|opacity-(?:25|50|75|100))$/,
  /^text(?:-(?:sm|md|lg|xl|xxl))?-(?:start|end|center|justify)$/,
  /^fs-[1-6]$/,
  /^display-[1-6]$/,
  /^fw-(?:light|lighter|normal|bold|bolder|medium|semibold)$/,
  /^fst-(?:italic|normal)$/,
  /^lh-(?:1|sm|base|lg)$/,
  /^font-(?:monospace|sans-serif)$/,
  /^lead$/,
  /^small$/,
  /^mark$/,
  /^initialism$/,
  /^blockquote-footer$/,
  /^bg-(?:primary|secondary|success|danger|warning|info|light|dark|body|body-secondary|body-tertiary|white|black|transparent|(?:primary|secondary|success|danger|warning|info|light|dark)-subtle|gradient|opacity-(?:10|25|50|75|100))$/,
  /^border(?:-(?:top|end|bottom|start))?(?:-0)?$/,
  /^border-[1-5]$/,
  /^border-(?:primary|secondary|success|danger|warning|info|light|dark|white|black)(?:-subtle)?$/,
  /^rounded(?:-(?:top|end|bottom|start|circle|pill))?(?:-[0-5])?$/,
  /^shadow(?:-(?:sm|lg|none))?$/,
  /^opacity-(?:0|25|50|75|100)$/,
  /^[wh]-(?:25|50|75|100|auto)$/,
  /^m[wh]-100$/,
  /^v[wh]-100$/,
  /^container(?:-(?:fluid|sm|md|lg|xl|xxl))?$/,
  /^col(?:-(?:sm|md|lg|xl|xxl))?(?:-(?:auto|[0-9]|1[0-2]))?$/,
  /^row(?:-cols(?:-(?:sm|md|lg|xl|xxl))?-(?:auto|[1-6]))?$/,
  /^offset(?:-(?:sm|md|lg|xl|xxl))?-[0-9]+$/,
  /^position-(?:static|relative|absolute|fixed|sticky)$/,
  /^(?:top|end|bottom|start)-(?:0|50|100)$/,
  /^translate-middle(?:-[xy])?$/
]
