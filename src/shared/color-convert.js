/**
 * GrapeStrap — Colour space conversion helpers (shared, dependency-free)
 *
 * PATH: src/shared/color-convert.js
 * ROLE: The arithmetic behind the visual colour selector in
 *       panels/color-picker/index.js — hex ⇄ RGB ⇄ HSV, plus a forgiving
 *       parser for the colour strings that arrive from a project stylesheet.
 *       Kept as a pure module with no DOM access so `npm run test:unit` can
 *       exercise the round-trip (see tests/unit/color-convert.test.js) without
 *       Electron or Playwright.
 * DEPENDS: nothing (plain JS — importable from main/, renderer/, and tests)
 * CREATED: 2026-08-17
 *
 * Conventions this module commits to:
 *   - RGB channels are integers 0–255. HSV is `{ h: 0–360, s: 0–1, v: 0–1 }`.
 *   - Hex output is always lowercase `#rrggbb`, never shorthand — the picker
 *     writes this string straight into a CSS declaration, so one canonical
 *     shape keeps the stylesheet diff-stable.
 *   - Nothing throws. Unparseable input returns `null` so the caller can
 *     decide what "no colour yet" looks like; garbage numbers clamp rather
 *     than producing NaN, because a NaN would reach the stylesheet as the
 *     literal text "NaN" and silently break the rule.
 *
 * Deliberately NOT handled: named CSS colours (`red`, `rebeccapurple`) and
 * `var(--bs-primary)`. Both need either a 148-entry lookup table or a live
 * document to resolve against, and the picker's contract for anything it
 * cannot parse is to leave the spectrum where it is and blank the numeric
 * fields — so `null` is the honest answer for them. `hsl()` is likewise out
 * of scope until something in the app writes it.
 *
 * Alpha is parsed-and-discarded rather than rejected: `rgba(0,0,0,.5)` in an
 * existing rule should still put the spectrum thumb on black instead of
 * reading as unparseable. The picker is an opaque-colour surface; the alpha
 * channel is a later milestone.
 */

const HEX_PATTERN = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

// rgb()/rgba() in either legacy comma syntax or CSS Color 4 space syntax:
//   rgb(255, 0, 102)   rgba(255,0,102,.5)   rgb(255 0 102)   rgb(255 0 102 / 50%)
// Components are captured loosely and validated below — a regex strict enough
// to reject every malformed form would be unreadable, and `null` on a
// nonsense component is the same outcome as no match at all.
const RGB_FUNCTION_PATTERN = /^rgba?\(([^)]*)\)$/i

/**
 * Clamp a value to a whole RGB channel, 0–255.
 *
 * @param {number|string} value - Channel value; anything non-numeric → 0.
 * @returns {number} Integer in 0–255.
 */
export function clampChannel(value) {
  const n = Number(value)
  // Number('') is 0 and Number(undefined) is NaN — both mean "no channel
  // here", and 0 is the only safe stand-in for a colour component.
  if (!Number.isFinite(n)) return 0
  return Math.min(255, Math.max(0, Math.round(n)))
}

/**
 * Clamp a value to the 0–1 range HSV uses for saturation and value.
 *
 * @param {number} value - Ratio; non-numeric → 0.
 * @returns {number} Float in 0–1.
 */
export function clampUnit(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/**
 * Normalise a hue onto 0–360, wrapping negatives (−30 → 330).
 *
 * @param {number} value - Hue in degrees; non-numeric → 0.
 * @returns {number} Float in [0, 360).
 */
export function normalizeHue(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return ((n % 360) + 360) % 360
}

/**
 * True when the string is a hex colour literal (3, 4, 6 or 8 digits).
 *
 * @param {string} value - Candidate string.
 * @returns {boolean} Whether hexToRgb() will succeed on it.
 */
export function isHexColor(value) {
  return HEX_PATTERN.test(String(value ?? '').trim())
}

/**
 * Parse a hex colour literal into RGB channels. Shorthand is expanded
 * (`#0af` → `#00aaff`) and any alpha digits are dropped.
 *
 * @param {string} hex - Hex literal, with or without surrounding whitespace.
 * @returns {{r: number, g: number, b: number}|null} Channels, or null if the
 *          string is not a hex literal.
 */
export function hexToRgb(hex) {
  const raw = String(hex ?? '').trim()
  if (!HEX_PATTERN.test(raw)) return null

  let digits = raw.slice(1)
  // #rgb / #rgba → double every digit before reading pairs.
  if (digits.length === 3 || digits.length === 4) {
    digits = digits.split('').map(d => d + d).join('')
  }
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16)
  }
}

/**
 * Render RGB channels as a canonical lowercase `#rrggbb` string.
 *
 * @param {{r: number, g: number, b: number}} rgb - Channels; each clamped.
 * @returns {string} Six-digit lowercase hex literal.
 */
export function rgbToHex(rgb) {
  const { r, g, b } = rgb || {}
  const pair = channel => clampChannel(channel).toString(16).padStart(2, '0')
  return `#${pair(r)}${pair(g)}${pair(b)}`
}

/**
 * Convert RGB channels to HSV.
 *
 * Degenerate inputs are reported honestly rather than guessed at: greys and
 * black have no meaningful hue, so hue comes back 0. Callers that keep a
 * spectrum thumb on screen should preserve their previous hue when `s === 0`,
 * otherwise dragging a colour down to black would snap the hue strip to red.
 *
 * @param {{r: number, g: number, b: number}} rgb - Channels 0–255.
 * @returns {{h: number, s: number, v: number}} Hue 0–360, sat/value 0–1.
 */
export function rgbToHsv(rgb) {
  const r = clampChannel(rgb?.r) / 255
  const g = clampChannel(rgb?.g) / 255
  const b = clampChannel(rgb?.b) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === r)      h = 60 * (((g - b) / delta) % 6)
    else if (max === g) h = 60 * (((b - r) / delta) + 2)
    else                h = 60 * (((r - g) / delta) + 4)
  }

  return {
    h: normalizeHue(h),
    s: max === 0 ? 0 : delta / max,
    v: max
  }
}

/**
 * Convert HSV to RGB channels.
 *
 * @param {{h: number, s: number, v: number}} hsv - Hue 0–360, sat/value 0–1.
 *        Out-of-range hue wraps; out-of-range sat/value clamp.
 * @returns {{r: number, g: number, b: number}} Integer channels 0–255.
 */
export function hsvToRgb(hsv) {
  const h = normalizeHue(hsv?.h)
  const s = clampUnit(hsv?.s)
  const v = clampUnit(hsv?.v)

  const chroma = v * s
  const sector = h / 60
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const floor  = v - chroma

  let r = 0, g = 0, b = 0
  if      (sector < 1) { r = chroma; g = second; b = 0 }
  else if (sector < 2) { r = second; g = chroma; b = 0 }
  else if (sector < 3) { r = 0;      g = chroma; b = second }
  else if (sector < 4) { r = 0;      g = second; b = chroma }
  else if (sector < 5) { r = second; g = 0;      b = chroma }
  else                 { r = chroma; g = 0;      b = second }

  return {
    r: Math.round((r + floor) * 255),
    g: Math.round((g + floor) * 255),
    b: Math.round((b + floor) * 255)
  }
}

/**
 * Resolve an arbitrary CSS colour string to RGB channels, as far as this
 * module can without a document. Hex literals and `rgb()`/`rgba()` in either
 * syntax resolve; everything else (`var(--bs-primary)`, `transparent`, named
 * colours, `hsl()`, empty) returns null — see the file header for why.
 *
 * @param {string} value - Colour string from a stylesheet or an input field.
 * @returns {{r: number, g: number, b: number}|null} Channels, or null when
 *          the value is not resolvable here.
 */
export function parseColorToRgb(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (HEX_PATTERN.test(raw)) return hexToRgb(raw)

  const body = raw.match(RGB_FUNCTION_PATTERN)?.[1]
  if (body === undefined) return null

  // Both syntaxes reduce to "split off any alpha at the slash, then read the
  // first three numbers". Commas and whitespace are interchangeable separators
  // once the alpha is gone, which is why one split handles both forms.
  const components = body.split('/')[0].split(/[\s,]+/).filter(Boolean)
  if (components.length < 3) return null

  const channels = components.slice(0, 3).map(component => {
    const numeric = parseFloat(component)
    if (!Number.isFinite(numeric)) return null
    // Percentages are legal in rgb() and scale off 255, not 100.
    return component.endsWith('%') ? (numeric / 100) * 255 : numeric
  })
  if (channels.some(channel => channel === null)) return null

  return {
    r: clampChannel(channels[0]),
    g: clampChannel(channels[1]),
    b: clampChannel(channels[2])
  }
}
