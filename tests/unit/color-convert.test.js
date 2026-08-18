/**
 * GrapeStrap — Unit: colour space conversion helpers
 *
 * PATH: tests/unit/color-convert.test.js
 * ROLE: node:test coverage for src/shared/color-convert.js — the arithmetic
 *       under the visual colour selector. The load-bearing property is the
 *       RGB → HSV → RGB round-trip: the picker holds HSV as its live state
 *       and re-derives the hex on every drag step, so any channel that
 *       doesn't survive the trip would show up as a colour that drifts while
 *       the user drags. Degenerate cases (black, white, greys — no hue, no
 *       saturation) get their own coverage because that is where the naive
 *       formula divides by zero.
 * DEPENDS: node:test, node:assert, ../../src/shared/color-convert.js
 * CREATED: 2026-08-17
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampChannel,
  clampUnit,
  normalizeHue,
  isHexColor,
  hexToRgb,
  rgbToHex,
  rgbToHsv,
  hsvToRgb,
  parseColorToRgb
} from '../../src/shared/color-convert.js'

const rgb = (r, g, b) => ({ r, g, b })

// ─── clamps and normalisation ────────────────────────────────────────────────

test('clampChannel: clamps to 0–255, rounds, and never yields NaN', () => {
  assert.equal(clampChannel(128), 128)
  assert.equal(clampChannel('200'), 200)
  assert.equal(clampChannel(-40), 0)
  assert.equal(clampChannel(999), 255)
  assert.equal(clampChannel(12.6), 13)
  // The three shapes that would otherwise reach a stylesheet as "NaN".
  assert.equal(clampChannel(''), 0)
  assert.equal(clampChannel(undefined), 0)
  assert.equal(clampChannel('abc'), 0)
})

test('clampUnit: clamps ratios to 0–1', () => {
  assert.equal(clampUnit(0.5), 0.5)
  assert.equal(clampUnit(-1), 0)
  assert.equal(clampUnit(4), 1)
  assert.equal(clampUnit('nope'), 0)
})

test('normalizeHue: wraps onto [0, 360)', () => {
  assert.equal(normalizeHue(0), 0)
  assert.equal(normalizeHue(359), 359)
  assert.equal(normalizeHue(360), 0)
  assert.equal(normalizeHue(400), 40)
  assert.equal(normalizeHue(-30), 330)
  assert.equal(normalizeHue(NaN), 0)
})

// ─── hex ⇄ rgb ───────────────────────────────────────────────────────────────

test('isHexColor: accepts 3/4/6/8 digits, rejects everything else', () => {
  assert.equal(isHexColor('#0af'), true)
  assert.equal(isHexColor('#0AFF'), true)
  assert.equal(isHexColor('#00aaff'), true)
  assert.equal(isHexColor('#00aaff80'), true)
  assert.equal(isHexColor('  #00aaff  '), true)
  assert.equal(isHexColor('#00aaf'), false)
  assert.equal(isHexColor('00aaff'), false)
  assert.equal(isHexColor('#gggggg'), false)
  assert.equal(isHexColor('var(--bs-primary)'), false)
  assert.equal(isHexColor(''), false)
  assert.equal(isHexColor(null), false)
})

test('hexToRgb: expands shorthand, drops alpha, rejects non-hex', () => {
  assert.deepEqual(hexToRgb('#0af'), rgb(0, 170, 255))
  assert.deepEqual(hexToRgb('#0AF'), rgb(0, 170, 255))
  assert.deepEqual(hexToRgb('#0af8'), rgb(0, 170, 255))       // 4-digit: alpha dropped
  assert.deepEqual(hexToRgb('#123456'), rgb(18, 52, 86))
  assert.deepEqual(hexToRgb('#12345680'), rgb(18, 52, 86))    // 8-digit: alpha dropped
  assert.deepEqual(hexToRgb('  #ffffff '), rgb(255, 255, 255))
  assert.equal(hexToRgb('rgb(1,2,3)'), null)
  assert.equal(hexToRgb(''), null)
})

test('rgbToHex: always lowercase six-digit, pads and clamps', () => {
  assert.equal(rgbToHex(rgb(0, 0, 0)), '#000000')
  assert.equal(rgbToHex(rgb(255, 255, 255)), '#ffffff')
  assert.equal(rgbToHex(rgb(18, 52, 86)), '#123456')
  assert.equal(rgbToHex(rgb(0, 170, 255)), '#00aaff')
  assert.equal(rgbToHex(rgb(-10, 300, 12.4)), '#00ff0c')
  assert.equal(rgbToHex({}), '#000000')
})

// ─── rgb ⇄ hsv: named corners ────────────────────────────────────────────────

test('rgbToHsv: the six primary/secondary corners land on their exact hues', () => {
  const corners = [
    [rgb(255, 0, 0),     0],
    [rgb(255, 255, 0),  60],
    [rgb(0, 255, 0),   120],
    [rgb(0, 255, 255), 180],
    [rgb(0, 0, 255),   240],
    [rgb(255, 0, 255), 300]
  ]
  for (const [color, hue] of corners) {
    const hsv = rgbToHsv(color)
    assert.equal(hsv.h, hue, `hue for ${rgbToHex(color)}`)
    assert.equal(hsv.s, 1, `saturation for ${rgbToHex(color)}`)
    assert.equal(hsv.v, 1, `value for ${rgbToHex(color)}`)
  }
})

test('hsvToRgb: the six corners come back as the pure channels', () => {
  assert.deepEqual(hsvToRgb({ h: 0,   s: 1, v: 1 }), rgb(255, 0, 0))
  assert.deepEqual(hsvToRgb({ h: 60,  s: 1, v: 1 }), rgb(255, 255, 0))
  assert.deepEqual(hsvToRgb({ h: 120, s: 1, v: 1 }), rgb(0, 255, 0))
  assert.deepEqual(hsvToRgb({ h: 180, s: 1, v: 1 }), rgb(0, 255, 255))
  assert.deepEqual(hsvToRgb({ h: 240, s: 1, v: 1 }), rgb(0, 0, 255))
  assert.deepEqual(hsvToRgb({ h: 300, s: 1, v: 1 }), rgb(255, 0, 255))
  // 360 is 0 — the hue strip's right edge must not fall off the scale.
  assert.deepEqual(hsvToRgb({ h: 360, s: 1, v: 1 }), rgb(255, 0, 0))
})

test('hsvToRgb: out-of-range inputs clamp and wrap instead of producing NaN', () => {
  assert.deepEqual(hsvToRgb({ h: -120, s: 1, v: 1 }), rgb(0, 0, 255))   // -120 → 240
  assert.deepEqual(hsvToRgb({ h: 0, s: 5, v: 5 }),    rgb(255, 0, 0))
  assert.deepEqual(hsvToRgb({ h: 0, s: -1, v: -1 }),  rgb(0, 0, 0))
  assert.deepEqual(hsvToRgb({}),                      rgb(0, 0, 0))
  assert.deepEqual(hsvToRgb(undefined),               rgb(0, 0, 0))
})

// ─── rgb ⇄ hsv: degenerate cases (no hue and/or no saturation) ───────────────

test('rgbToHsv: black, white and greys report zero hue and zero saturation', () => {
  const black = rgbToHsv(rgb(0, 0, 0))
  assert.deepEqual(black, { h: 0, s: 0, v: 0 })

  const white = rgbToHsv(rgb(255, 255, 255))
  assert.deepEqual(white, { h: 0, s: 0, v: 1 })

  for (const level of [1, 17, 64, 128, 200, 254]) {
    const grey = rgbToHsv(rgb(level, level, level))
    assert.equal(grey.h, 0, `grey ${level} hue`)
    assert.equal(grey.s, 0, `grey ${level} saturation`)
    assert.equal(grey.v, level / 255, `grey ${level} value`)
  }
})

test('degenerate colours survive the round-trip exactly', () => {
  // The picker preserves the PREVIOUS hue when saturation is zero (so dimming
  // a blue to black doesn't swing the strip to red); this proves the hue it
  // carries over is irrelevant to the resulting colour, which is what makes
  // that preservation safe.
  for (const level of [0, 1, 17, 64, 128, 200, 254, 255]) {
    const grey = rgb(level, level, level)
    const hsv = rgbToHsv(grey)
    assert.deepEqual(hsvToRgb(hsv), grey, `grey ${level} round-trip`)
    for (const carriedHue of [0, 47, 180, 359]) {
      assert.deepEqual(hsvToRgb({ ...hsv, h: carriedHue }), grey,
        `grey ${level} is hue-independent at h=${carriedHue}`)
    }
  }
})

// ─── rgb ⇄ hsv: the round-trip property ──────────────────────────────────────

test('rgbToHsv → hsvToRgb is lossless across a 1000-colour sample', () => {
  // A full 16.7M sweep is not worth the runtime; this grid deliberately mixes
  // the boundaries (0, 255), the rounding hazards (1, 127, 128, 254) and a few
  // interior values, and covers every ordering of the three channels.
  const levels = [0, 1, 17, 63, 64, 127, 128, 200, 254, 255]
  let checked = 0
  for (const r of levels) {
    for (const g of levels) {
      for (const b of levels) {
        const original = rgb(r, g, b)
        assert.deepEqual(hsvToRgb(rgbToHsv(original)), original,
          `round-trip failed for ${rgbToHex(original)}`)
        checked++
      }
    }
  }
  assert.equal(checked, 1000)
})

test('hex → rgb → hsv → rgb → hex is stable for the Bootstrap theme palette', () => {
  // These are the exact strings the palette swatches commit, and the picker
  // re-seats its spectrum from them — a drifting round-trip here would mean
  // clicking a swatch and then nudging the spectrum jumps to a different color.
  const palette = [
    '#0d6efd', '#6c757d', '#198754', '#dc3545',
    '#ffc107', '#0dcaf0', '#f8f9fa', '#212529',
    '#ffffff', '#000000', '#3fb950'
  ]
  for (const hex of palette) {
    assert.equal(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(hex)))), hex)
  }
})

// ─── parseColorToRgb ─────────────────────────────────────────────────────────

test('parseColorToRgb: hex literals in every accepted width', () => {
  assert.deepEqual(parseColorToRgb('#123456'), rgb(18, 52, 86))
  assert.deepEqual(parseColorToRgb('#0af'), rgb(0, 170, 255))
  assert.deepEqual(parseColorToRgb('#12345680'), rgb(18, 52, 86))
})

test('parseColorToRgb: rgb()/rgba() in comma and space syntax', () => {
  assert.deepEqual(parseColorToRgb('rgb(255, 0, 102)'), rgb(255, 0, 102))
  assert.deepEqual(parseColorToRgb('rgb(255,0,102)'), rgb(255, 0, 102))
  assert.deepEqual(parseColorToRgb('RGB(255, 0, 102)'), rgb(255, 0, 102))
  assert.deepEqual(parseColorToRgb('  rgb( 255 , 0 , 102 )  '), rgb(255, 0, 102))
  // Alpha is parsed and discarded — an rgba() in an existing rule should still
  // seat the spectrum rather than reading as unparseable.
  assert.deepEqual(parseColorToRgb('rgba(255, 0, 102, 0.5)'), rgb(255, 0, 102))
  assert.deepEqual(parseColorToRgb('rgb(255 0 102)'), rgb(255, 0, 102))
  assert.deepEqual(parseColorToRgb('rgb(255 0 102 / 50%)'), rgb(255, 0, 102))
  // Percentage components scale off 255, not 100.
  assert.deepEqual(parseColorToRgb('rgb(100%, 0%, 40%)'), rgb(255, 0, 102))
  // Out-of-gamut components clamp, matching how a browser resolves them.
  assert.deepEqual(parseColorToRgb('rgb(300, -20, 102)'), rgb(255, 0, 102))
})

test('parseColorToRgb: returns null for everything it cannot resolve without a document', () => {
  // These are the values the picker must treat as "hold the spectrum, blank
  // the numeric fields" rather than guessing a colour for.
  for (const unresolvable of [
    'var(--bs-primary)', 'transparent', 'red', 'currentColor',
    'hsl(210, 100%, 50%)', 'rgb(1, 2)', 'rgb()', 'rgb(a, b, c)',
    '#12', 'nonsense', '', '   ', null, undefined
  ]) {
    assert.equal(parseColorToRgb(unresolvable), null, `expected null for ${JSON.stringify(unresolvable)}`)
  }
})
