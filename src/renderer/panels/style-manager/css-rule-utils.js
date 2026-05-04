/**
 * GrapeStrap — Style Manager: CSS-rule helpers for project style.css
 *
 * The pseudo-class state bar (chunk C) writes pseudo-state styles to project
 * `style.css` (held in `projectState.current.globalCSS`). These helpers do the
 * minimal CSS string surgery — read, upsert, remove — for a single
 * `selector + pseudo-class` rule. We deliberately don't pull in a full CSS AST
 * parser: round-tripping comments and complex sheets risks lossy edits the
 * user would notice. The string operations only ever touch the one rule
 * matching `selector:pseudo`, leaving the rest of the file byte-identical.
 *
 * Round-trip contract:
 *   - readRule(globalCSS, '.btn', 'hover') → { 'background-color': '#0d6efd' }
 *     when `.btn:hover { background-color: #0d6efd; }` is present.
 *   - writeRule(globalCSS, '.btn', 'hover', {color: 'red'}) inserts or replaces
 *     the rule. If `props` is empty, the rule is removed.
 *   - The output ends with a trailing newline if the input had one (or if the
 *     file was empty / non-existent).
 */

// One rule per selector+pseudo. Captures the body. The selector is matched
// literally (escape regex chars in `selector` first); pseudo is appended after
// a `:`. Whitespace around `{` and inside the body is permissive.
function buildRuleRegex(selector, pseudo) {
  const escSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `${escSel}\\s*:${pseudo}\\s*\\{[^}]*\\}\\s*`,
    'm'
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
  const re = buildRuleRegex(selector, pseudo)
  const match = re.exec(globalCSS)
  if (!match) return {}
  const body = match[0].match(/\{([^}]*)\}/)?.[1] || ''
  return bodyToProps(body)
}

/**
 * Insert or replace `selector:pseudo { ... }` in globalCSS.
 * If `props` is empty (no truthy values), the rule is removed.
 */
export function writeRule(globalCSS, selector, pseudo, props) {
  const body = propsToBody(props || {})
  const re = buildRuleRegex(selector, pseudo)
  const hasMatch = re.test(globalCSS || '')

  if (!body) {
    // Remove rule.
    if (!hasMatch) return globalCSS || ''
    return (globalCSS || '').replace(re, '').replace(/\n{3,}/g, '\n\n')
  }

  const newRule = `${selector}:${pseudo} {\n${body}\n}\n`
  if (hasMatch) {
    return (globalCSS || '').replace(re, newRule)
  }
  // Append. Add a leading newline if the file is non-empty and doesn't end in one.
  const base = globalCSS || ''
  const sep = base.length === 0 ? '' : (base.endsWith('\n') ? '\n' : '\n\n')
  return base + sep + newRule
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
