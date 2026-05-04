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
