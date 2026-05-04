/**
 * GrapeStrap — Bootstrap 5 class enumerations
 *
 * Single source of truth for the Style Manager sub-panels. Each export is a
 * group of utility classes the user can choose from (one-of-many). The
 * sub-panels render these as button rows / dropdowns and the class-utils
 * helpers handle "remove all from this group, then apply the chosen one."
 *
 * Keeping the enumerations here (instead of inline in each sub-panel) means:
 *   - Cascade view, Bootstrap autocomplete (v0.0.2), and any plugin can read
 *     the same lists without copy-paste drift.
 *   - The 1.0 → 5.x version bump is one file.
 */

export const BREAKPOINTS = ['', 'sm', 'md', 'lg', 'xl', 'xxl']

// ── Grid / columns ───────────────────────────────────────────────────────────
// BS5 12-column grid. A column's width per breakpoint is `col-<bp>-<n>`
// where bp is one of BREAKPOINTS and n is 1..12 or 'auto'. Bare `col`
// (no number) means "fill remaining" — equal-width with siblings.
export const COL_SIZES = ['auto', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

export function colClass(size, bp = '') {
  // size '' or undefined → bare `col` (fill).
  // size === 'auto' → `col-auto` or `col-md-auto`.
  // numeric → `col-N` or `col-md-N`.
  if (!size) return bp ? `col-${bp}` : 'col'
  return bp ? `col-${bp}-${size}` : `col-${size}`
}

export function colPattern(bp = '') {
  // Matches col, col-N, col-auto for a specific breakpoint (or bare-bp if bp='').
  // For bp='' we match `col` and `col-N` and `col-auto` but NOT `col-md-...`.
  if (!bp) return /^col(?:-(?:auto|1[0-2]|[1-9]))?$/
  return new RegExp(`^col-${bp}(?:-(?:auto|1[0-2]|[1-9]))?$`)
}

// Quick-split presets. Each preset is { label, sizes: [n,n,...] } where the
// sizes array describes the columns left-to-right. Sums to 12 (or under, with
// auto fillers) — the BS grid wraps at >12 which we don't want from a preset.
export const COL_PRESETS = [
  { label: '12',         sizes: ['12'] },
  { label: '6 / 6',      sizes: ['6', '6'] },
  { label: '4 / 4 / 4',  sizes: ['4', '4', '4'] },
  { label: '3×4',        sizes: ['3', '3', '3', '3'] },
  { label: '8 / 4',      sizes: ['8', '4'] },
  { label: '4 / 8',      sizes: ['4', '8'] },
  { label: '3 / 9',      sizes: ['3', '9'] },
  { label: '9 / 3',      sizes: ['9', '3'] },
  { label: '5 / 7',      sizes: ['5', '7'] },
  { label: '7 / 5',      sizes: ['7', '5'] },
  { label: '2 / 8 / 2',  sizes: ['2', '8', '2'] }
]

// ── Spacing ──────────────────────────────────────────────────────────────────
// Returns class name for a given (property, side, scale, breakpoint).
//   property: 'm' | 'p'
//   side:     '' | 't' | 'r' | 'b' | 'l' | 'x' | 'y'
//   scale:    '0' | '1' | '2' | '3' | '4' | '5' | 'auto' | 'n1'..'n5' (margin only)
//   bp:       '' | 'sm' | 'md' | ...
// e.g. spacingClass('m', 't', '3', 'md') => 'mt-md-3'
export function spacingClass(property, side, scale, bp = '') {
  const prefix = property + side
  const mid = bp ? `-${bp}` : ''
  return `${prefix}${mid}-${scale}`
}

export const SPACING_SIDES = [
  { value: '',  label: 'All'    },
  { value: 't', label: 'Top'    },
  { value: 'r', label: 'End'    },
  { value: 'b', label: 'Bottom' },
  { value: 'l', label: 'Start'  },
  { value: 'x', label: 'X'      },
  { value: 'y', label: 'Y'      }
]

// 0..5 + auto. Negative scale (n1..n5) is margin-only.
export const SPACING_SCALES_PADDING = ['0', '1', '2', '3', '4', '5']
export const SPACING_SCALES_MARGIN  = ['0', '1', '2', '3', '4', '5', 'auto', 'n1', 'n2', 'n3', 'n4', 'n5']

// Regex used to *detect* and *strip* prior selections in the same group.
// Matches optional negative prefix and breakpoint segment.
// e.g. matches: m-3, mt-3, mt-md-3, m-n2, mx-auto, p-md-0
export function spacingPattern(property, side) {
  const sideRe = side ? side : '[trblxy]?'
  return new RegExp(`^${property}${sideRe}(?:-(?:sm|md|lg|xl|xxl))?-(?:auto|n?[0-5])$`)
}

// ── Display ─────────────────────────────────────────────────────────────────
export const DISPLAY_VALUES = [
  { value: 'none',         label: 'None'    },
  { value: 'inline',       label: 'Inline'  },
  { value: 'inline-block', label: 'Inline-block' },
  { value: 'block',        label: 'Block'   },
  { value: 'flex',         label: 'Flex'    },
  { value: 'inline-flex',  label: 'Inline-flex' },
  { value: 'grid',         label: 'Grid'    },
  { value: 'inline-grid',  label: 'Inline-grid' },
  { value: 'table',        label: 'Table'   }
]
export const VISIBILITY_VALUES = [
  { value: 'visible',   label: 'Visible'   },
  { value: 'invisible', label: 'Invisible' }
]
// e.g. d-md-flex, d-none. Bare class is `d-<value>`; bp variant is `d-<bp>-<value>`.
export function displayClass(value, bp = '') {
  return bp ? `d-${bp}-${value}` : `d-${value}`
}
export function displayPattern() {
  // d-none, d-block, d-flex, d-inline, d-grid, d-table, d-inline-flex, d-inline-block, d-inline-grid
  // and d-<bp>-<value>
  return /^d-(?:(?:sm|md|lg|xl|xxl)-)?(?:none|inline|inline-block|inline-flex|inline-grid|block|flex|grid|table)$/
}
export function visibilityPattern() {
  return /^(?:in)?visible$/
}

// ── Text ────────────────────────────────────────────────────────────────────
export const TEXT_ALIGN = [
  { value: 'start',   label: 'Start'   },
  { value: 'center',  label: 'Center'  },
  { value: 'end',     label: 'End'     }
]
export const TEXT_TRANSFORM = [
  { value: 'lowercase',  label: 'lowercase'  },
  { value: 'uppercase',  label: 'UPPERCASE'  },
  { value: 'capitalize', label: 'Capitalize' }
]
export const TEXT_WEIGHT = [
  { value: 'lighter', label: 'Lighter' },
  { value: 'light',   label: 'Light'   },
  { value: 'normal',  label: 'Normal'  },
  { value: 'medium',  label: 'Medium'  },
  { value: 'semibold',label: 'SemiBld' },
  { value: 'bold',    label: 'Bold'    },
  { value: 'bolder',  label: 'Bolder'  }
]
export const TEXT_STYLE = [
  { value: 'italic', label: 'Italic' }
]
export const TEXT_DECORATION = [
  { value: 'underline',     label: 'Underline'  },
  { value: 'line-through',  label: 'Strike'     },
  { value: 'none',          label: 'None'       }
]
// fs-1..6 (display sizes) + fs- equivalents 1..6 in BS5
export const TEXT_SIZE = ['1', '2', '3', '4', '5', '6']
// Bootstrap 5.3 theme color tokens that work on text.
export const TEXT_COLOR = [
  { value: 'primary',      swatch: '#0d6efd' },
  { value: 'secondary',    swatch: '#6c757d' },
  { value: 'success',      swatch: '#198754' },
  { value: 'danger',       swatch: '#dc3545' },
  { value: 'warning',      swatch: '#ffc107' },
  { value: 'info',         swatch: '#0dcaf0' },
  { value: 'light',        swatch: '#f8f9fa' },
  { value: 'dark',         swatch: '#212529' },
  { value: 'body',         swatch: '#212529' },
  { value: 'muted',        swatch: '#6c757d' },
  { value: 'white',        swatch: '#ffffff' },
  { value: 'black',        swatch: '#000000' },
  { value: 'body-emphasis',swatch: '#000000' }
]

export function textAlignClass(value, bp = '') {
  return bp ? `text-${bp}-${value}` : `text-${value}`
}
export function textAlignPattern() {
  return /^text-(?:(?:sm|md|lg|xl|xxl)-)?(?:start|center|end)$/
}
export function textTransformPattern() {
  return /^text-(?:lowercase|uppercase|capitalize)$/
}
export function textWeightPattern() {
  return /^fw-(?:light|lighter|normal|medium|semibold|bold|bolder)$/
}
export function textStylePattern() {
  return /^fst-italic$/
}
export function textDecorationPattern() {
  return /^text-decoration-(?:underline|line-through|none)$/
}
export function textSizePattern() {
  return /^fs-[1-6]$/
}
export function textColorPattern() {
  return /^text-(?:primary|secondary|success|danger|warning|info|light|dark|body|muted|white|black|body-emphasis)$/
}

// ── Flex (only meaningful when display includes d-flex) ─────────────────────
export const FLEX_DIRECTION = [
  { value: 'row',            label: 'Row'         },
  { value: 'row-reverse',    label: 'Row rev'     },
  { value: 'column',         label: 'Column'      },
  { value: 'column-reverse', label: 'Column rev'  }
]
export const FLEX_WRAP = [
  { value: 'wrap',         label: 'Wrap'     },
  { value: 'nowrap',       label: 'Nowrap'   },
  { value: 'wrap-reverse', label: 'Wrap rev' }
]
export const FLEX_JUSTIFY = [
  { value: 'start',   label: 'Start'   },
  { value: 'end',     label: 'End'     },
  { value: 'center',  label: 'Center'  },
  { value: 'between', label: 'Between' },
  { value: 'around',  label: 'Around'  },
  { value: 'evenly',  label: 'Evenly'  }
]
export const FLEX_ALIGN_ITEMS = [
  { value: 'start',    label: 'Start'    },
  { value: 'end',      label: 'End'      },
  { value: 'center',   label: 'Center'   },
  { value: 'baseline', label: 'Baseline' },
  { value: 'stretch',  label: 'Stretch'  }
]
export const FLEX_ALIGN_CONTENT = [
  { value: 'start',   label: 'Start'   },
  { value: 'end',     label: 'End'     },
  { value: 'center',  label: 'Center'  },
  { value: 'between', label: 'Between' },
  { value: 'around',  label: 'Around'  },
  { value: 'stretch', label: 'Stretch' }
]
export const FLEX_GAP = ['0', '1', '2', '3', '4', '5']

export function flexDirectionPattern() { return /^flex-(?:row|row-reverse|column|column-reverse)$/ }
export function flexWrapPattern()      { return /^flex-(?:wrap|nowrap|wrap-reverse)$/ }
export function justifyContentPattern(){ return /^justify-content-(?:start|end|center|between|around|evenly)$/ }
export function alignItemsPattern()    { return /^align-items-(?:start|end|center|baseline|stretch)$/ }
export function alignContentPattern()  { return /^align-content-(?:start|end|center|between|around|stretch)$/ }
export function gapPattern()           { return /^gap-[0-5]$/ }

// True if the component has any d-flex / d-inline-flex / d-<bp>-flex variant.
export function flexEnabledPattern() {
  return /^d-(?:(?:sm|md|lg|xl|xxl)-)?(?:inline-)?flex$/
}

// ── Background ──────────────────────────────────────────────────────────────
export const BG_COLOR = [
  { value: 'primary',     swatch: '#0d6efd' },
  { value: 'secondary',   swatch: '#6c757d' },
  { value: 'success',     swatch: '#198754' },
  { value: 'danger',      swatch: '#dc3545' },
  { value: 'warning',     swatch: '#ffc107' },
  { value: 'info',        swatch: '#0dcaf0' },
  { value: 'light',       swatch: '#f8f9fa' },
  { value: 'dark',        swatch: '#212529' },
  { value: 'body',        swatch: '#ffffff' },
  { value: 'body-secondary', swatch: '#e9ecef' },
  { value: 'body-tertiary',  swatch: '#f8f9fa' },
  { value: 'white',       swatch: '#ffffff' },
  { value: 'black',       swatch: '#000000' },
  { value: 'transparent', swatch: 'transparent' }
]
// Subtle variants from BS 5.3.
export const BG_SUBTLE = [
  'primary-subtle', 'secondary-subtle', 'success-subtle',
  'danger-subtle',  'warning-subtle',   'info-subtle',
  'light-subtle',   'dark-subtle'
]
export function bgColorPattern() {
  return /^bg-(?:primary|secondary|success|danger|warning|info|light|dark|body|body-secondary|body-tertiary|white|black|transparent|(?:primary|secondary|success|danger|warning|info|light|dark)-subtle)$/
}
export function bgGradientPattern() { return /^bg-gradient$/ }

// ── Border ──────────────────────────────────────────────────────────────────
export const BORDER_SIDES = [
  { value: '',       label: 'All'    }, // bare `border`
  { value: 'top',    label: 'Top'    },
  { value: 'end',    label: 'End'    },
  { value: 'bottom', label: 'Bottom' },
  { value: 'start',  label: 'Start'  }
]
export const BORDER_WIDTHS = ['1', '2', '3', '4', '5']
export const BORDER_COLOR = [
  { value: 'primary',   swatch: '#0d6efd' },
  { value: 'secondary', swatch: '#6c757d' },
  { value: 'success',   swatch: '#198754' },
  { value: 'danger',    swatch: '#dc3545' },
  { value: 'warning',   swatch: '#ffc107' },
  { value: 'info',      swatch: '#0dcaf0' },
  { value: 'light',     swatch: '#f8f9fa' },
  { value: 'dark',      swatch: '#212529' },
  { value: 'white',     swatch: '#ffffff' },
  { value: 'black',     swatch: '#000000' }
]
export const BORDER_RADIUS = [
  { value: '',         label: 'On'      }, // bare `rounded`
  { value: '0',        label: 'None'    },
  { value: '1',        label: '1'       },
  { value: '2',        label: '2'       },
  { value: '3',        label: '3'       },
  { value: '4',        label: '4'       },
  { value: '5',        label: '5'       },
  { value: 'circle',   label: 'Circle'  },
  { value: 'pill',     label: 'Pill'    }
]
export const SHADOW = [
  { value: 'none', label: 'None' },
  { value: 'sm',   label: 'Sm'   },
  { value: '',     label: 'On'   }, // bare `shadow`
  { value: 'lg',   label: 'Lg'   }
]

// border, border-top, border-end, border-bottom, border-start, and the
// `-0` removers.
export function borderSidePattern() {
  return /^border(?:-(?:top|end|bottom|start))?(?:-0)?$/
}
export function borderWidthPattern() { return /^border-[1-5]$/ }
export function borderColorPattern() {
  return /^border-(?:primary|secondary|success|danger|warning|info|light|dark|white|black)$/
}
// rounded, rounded-0..5, rounded-circle, rounded-pill (no per-corner in chunk B)
export function borderRadiusPattern() {
  return /^rounded(?:-(?:0|1|2|3|4|5|circle|pill))?$/
}
export function shadowPattern() {
  return /^shadow(?:-(?:none|sm|lg))?$/
}

// ── Sizing ──────────────────────────────────────────────────────────────────
export const SIZING_W = ['25', '50', '75', '100', 'auto']
export const SIZING_H = ['25', '50', '75', '100', 'auto']
export function widthPattern()    { return /^w-(?:25|50|75|100|auto)$/ }
export function heightPattern()   { return /^h-(?:25|50|75|100|auto)$/ }
export function maxWidthPattern() { return /^mw-100$/ }
export function maxHeightPattern(){ return /^mh-100$/ }
export function vwPattern()       { return /^vw-100$/ }
export function vhPattern()       { return /^vh-100$/ }
