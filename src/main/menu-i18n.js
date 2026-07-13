// =============================================================
// PATH: src/main/menu-i18n.js
// ROLE: Native-menu label catalog. Main cannot use the renderer's i18next
//       instance, so menu labels resolve from the language plugin's
//       messages.json read straight from disk (Wave 4 plan: "main reads
//       lang-plugin messages.json from disk").
// DEPENDS: electron (app), prefs.js, logger.js, platform/xdg.js
// CREATED: 2026-07-12 (Wave 4 i18n sweep)
//
// Locale resolution mirrors the renderer: prefs general.language, fallback
// 'en'. Catalog lookup is by directory CONVENTION — a language pack that
// wants native-menu labels ships as plugins/lang-<code>/messages.json
// (user plugin dir wins over bundled, matching plugin-loader's later-wins
// order). Renderer-side translation works for any plugin regardless of
// directory name; only the native menus need this convention — documented
// in docs/translations/README.md.
//
// No live menu relabel on pref change (same later-renders posture as the
// renderer): refreshMenuCatalog() re-reads the pref at every buildMenu()
// call, so the menu picks up a new locale the next time it naturally
// rebuilds (boot, or any menu:set-workspaces push).
// =============================================================

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { getPref } from './prefs.js'
import { xdg } from './platform/xdg.js'
import { log } from './logger.js'

const FALLBACK_LOCALE = 'en'

let cachedLocale = null
let catalog = {}     // active-locale catalog ({} when the pack is missing)
let enCatalog = {}   // bundled-English fallback, loaded once

function isCatalog(obj) {
  return !!obj && typeof obj === 'object' && !Array.isArray(obj)
}

/** First readable lang-<code>/messages.json wins: user plugins dir, then
 *  bundled — the same later-source-wins order plugin-loader applies. */
function loadCatalog(code) {
  const candidates = [
    join(xdg.pluginsDir, `lang-${code}`, 'messages.json'),
    join(app.getAppPath(), 'plugins', `lang-${code}`, 'messages.json')
  ]
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      if (isCatalog(parsed)) return parsed
      log.warn(`menu-i18n: ${file} is not an object catalog — skipped`)
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        log.warn(`menu-i18n: could not read ${file}: ${err.message}`)
      }
    }
  }
  return null
}

/** Re-resolve the locale pref and (re)load catalogs when it changed.
 *  Called by buildMenu() on every rebuild — cheap no-op while the pref is
 *  stable. Never throws: any failure degrades to English, then raw keys. */
export function refreshMenuCatalog() {
  let locale = FALLBACK_LOCALE
  try {
    const saved = getPref('general.language')
    if (typeof saved === 'string' && saved) locale = saved
  } catch (err) {
    log.warn(`menu-i18n: could not read language pref — defaulting to en (${err.message})`)
  }
  if (locale === cachedLocale) return
  cachedLocale = locale

  if (Object.keys(enCatalog).length === 0) {
    enCatalog = loadCatalog(FALLBACK_LOCALE) || {}
    if (Object.keys(enCatalog).length === 0) {
      log.warn('menu-i18n: bundled lang-en catalog missing — menus will show raw keys')
    }
  }
  if (locale === FALLBACK_LOCALE) {
    catalog = enCatalog
  } else {
    catalog = loadCatalog(locale) || {}
    if (Object.keys(catalog).length === 0) {
      log.warn(`menu-i18n: no lang-${locale}/messages.json found — native menus fall back to English`)
    }
  }
  log.info(`menu-i18n: catalog loaded for locale=${locale}`)
}

/** Flat-key lookup: active locale → English → the key itself. */
export function tMenu(key) {
  if (typeof catalog[key] === 'string') return catalog[key]
  if (typeof enCatalog[key] === 'string') return enCatalog[key]
  return key
}
