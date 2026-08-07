/**
 * GrapeStrap — Bootstrap docs lookup
 *
 * Maps Bootstrap 5 class names to the getbootstrap.com docs page that
 * explains them, so right-click "More info" items (canvas context menu,
 * Properties-panel class chips) can deep-link the how-to — e.g. `col-md-6`
 * → the Columns page, `mt-3` → Spacing utilities.
 *
 * Pure data + matcher, no DOM: lives in shared/ so the unit suite covers
 * the table (tests/unit/bs-docs.test.js). Topic names are Bootstrap's own
 * page titles — product vocabulary, deliberately untranslated (same policy
 * as the Designer/Coder workspace names).
 *
 * First matching rule wins per class; results dedupe by URL and cap at
 * MAX_TOPICS so a utility-soup element doesn't produce a screen-long menu.
 */

const BASE = 'https://getbootstrap.com/docs/5.3/'

export const MAX_TOPICS = 3

// Ordered: specific components before broad utility prefixes.
const RULES = [
  [/^col(-|$)/,                         'Columns',        'layout/columns/'],
  [/^(row(-cols)?(-|$)|g[xy]?-)/,       'Grid',           'layout/grid/'],
  [/^container(-|$)/,                   'Containers',     'layout/containers/'],
  [/^btn-group/,                        'Button group',   'components/button-group/'],
  [/^btn(-|$)/,                         'Buttons',        'components/buttons/'],
  [/^card(-|$)/,                        'Cards',          'components/card/'],
  [/^navbar(-|$)/,                      'Navbar',         'components/navbar/'],
  [/^nav(-|$|s$)/,                      'Navs & tabs',    'components/navs-tabs/'],
  [/^badge$/,                           'Badges',         'components/badge/'],
  [/^alert(-|$)/,                       'Alerts',         'components/alerts/'],
  [/^modal(-|$)/,                       'Modal',          'components/modal/'],
  [/^carousel(-|$)/,                    'Carousel',       'components/carousel/'],
  [/^accordion(-|$)/,                   'Accordion',      'components/accordion/'],
  [/^dropdown(-|$)/,                    'Dropdowns',      'components/dropdowns/'],
  [/^list-group(-|$)/,                  'List group',     'components/list-group/'],
  [/^breadcrumb(-|$)/,                  'Breadcrumb',     'components/breadcrumb/'],
  [/^(pagination|page-(item|link))(-|$)/, 'Pagination',   'components/pagination/'],
  [/^progress(-|$)/,                    'Progress',       'components/progress/'],
  [/^spinner-/,                         'Spinners',       'components/spinners/'],
  [/^toast(-|$)/,                       'Toasts',         'components/toasts/'],
  [/^offcanvas(-|$)/,                   'Offcanvas',      'components/offcanvas/'],
  [/^tooltip/,                          'Tooltips',       'components/tooltips/'],
  [/^popover/,                          'Popovers',       'components/popovers/'],
  [/^table(-|$)/,                       'Tables',         'content/tables/'],
  [/^form-control(-|$)/,                'Form controls',  'forms/form-control/'],
  [/^form-select(-|$)/,                 'Select',         'forms/select/'],
  [/^form-(check|switch)(-|$)/,         'Checks & radios','forms/checks-radios/'],
  [/^(form-floating|form-label|form-text|input-group)(-|$)/, 'Forms', 'forms/overview/'],
  [/^(img-(fluid|thumbnail)|figure)(-|$)/, 'Images',      'content/images/'],
  [/^d-/,                               'Display',        'utilities/display/'],
  [/^(m|p)(t|b|s|e|x|y)?-(n?[0-5]|auto)$/, 'Spacing',     'utilities/spacing/'],
  [/^(flex-|justify-content-|align-(items|content|self)-|order-|gap-)/, 'Flex', 'utilities/flex/'],
  [/^bg-/,                              'Background',     'utilities/background/'],
  [/^(border|rounded)(-|$)/,            'Borders',        'utilities/borders/'],
  [/^(text-(start|center|end|wrap|nowrap|break|lowercase|uppercase|capitalize|truncate)$|fw-|fs-|fst-|lh-)/, 'Text', 'utilities/text/'],
  [/^text-/,                            'Colors',         'utilities/colors/'],
  [/^(w|h|mw|mh|vw|vh)-/,               'Sizing',         'utilities/sizing/'],
  [/^(position-|top-|bottom-|start-|end-|translate-middle)/, 'Position', 'utilities/position/'],
  [/^shadow(-|$)/,                      'Shadows',        'utilities/shadows/'],
  [/^float-/,                           'Float',          'utilities/float/'],
  [/^overflow-/,                        'Overflow',       'utilities/overflow/'],
  [/^visually-hidden/,                  'Visually hidden','utilities/visually-hidden/'],
  [/^align-(baseline|top|middle|bottom)/, 'Vertical align', 'utilities/vertical-align/']
]

/** Docs entry for one class name, or null when it isn't a Bootstrap class. */
export function bsDocForClass(cls) {
  const c = String(cls || '').trim()
  if (!c) return null
  for (const [re, topic, path] of RULES) {
    if (re.test(c)) return { topic, url: BASE + path }
  }
  return null
}

/**
 * Deduped docs entries for a class list, in class order, capped at
 * MAX_TOPICS. Unrecognized classes contribute nothing.
 */
export function bsDocsForClasses(classes) {
  const out = []
  const seen = new Set()
  for (const cls of classes || []) {
    const hit = bsDocForClass(cls)
    if (!hit || seen.has(hit.url)) continue
    seen.add(hit.url)
    out.push(hit)
    if (out.length >= MAX_TOPICS) break
  }
  return out
}
