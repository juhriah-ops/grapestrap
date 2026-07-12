/**
 * GrapeStrap — i18n runtime core
 *
 * PATH: src/renderer/i18n.js
 * ROLE: i18next wrapper — consumes message catalogs registered by language
 *       plugins (pluginRegistry.languages), resolves the saved locale pref,
 *       exposes t()/setLocale()/getLocale()/getAvailableLanguages()/isReady()
 * DEPENDS: i18next, state/event-bus.js, plugin-host/registry.js (read-only), log.js
 * CREATED: 2026-07-12
 *
 * Boot contract: initI18n() runs in main.js boot() AFTER activateAllPlugins()
 * (catalogs arrive via api.registerLanguage) and BEFORE any panel render.
 * t() is safe pre-init — it returns the key verbatim and never throws.
 *
 * Missing keys resolve current locale → English → the key itself. Catalog
 * keys are FLAT dotted strings ("menu.file.save"); interpolation is
 * single-brace ("{count}") to match plugins/lang-en/messages.json. t()
 * returns plain text — consumers MUST set it via textContent, never innerHTML
 * (escapeValue is off because nothing here is HTML).
 *
 * Late registrations (a language plugin activating after init) arrive via the
 * 'plugin:language-registered' bus event — plugin-host never imports this
 * module, so there is no import cycle. Main-process menu labels are Wave 4
 * (main reads the lang plugin's messages.json from disk; no renderer coupling).
 */

import i18next from 'i18next'
import { eventBus } from './state/event-bus.js'
import { pluginRegistry } from './plugin-host/registry.js'
import { log } from './log.js'

const FALLBACK_LOCALE = 'en'
const PREF_KEY = 'general.language'

let ready = false
let desiredLocale = FALLBACK_LOCALE

function isCatalog(messages) {
  return !!messages && typeof messages === 'object' && !Array.isArray(messages)
}

/** Feed one plugin-registered language def into i18next. False = rejected. */
function addCatalog(def) {
  const { code, name, messages } = def || {}
  if (typeof code !== 'string' || !code || !isCatalog(messages)) {
    log.warn(`i18n: skipping malformed catalog (code=${code}, name=${name})`)
    return false
  }
  i18next.addResourceBundle(code, 'translation', messages, true, true)
  return true
}

/** Late plugin registration (post-init): absorb the catalog; if it is the
 *  locale the user asked for but init couldn't honor, switch to it now. */
function onLanguageRegistered(payload) {
  const def = payload?.language
  if (!addCatalog(def)) return
  if (def.code === desiredLocale && i18next.resolvedLanguage !== desiredLocale) {
    i18next.changeLanguage(desiredLocale)
      .then(() => eventBus.emit('i18n:locale-changed', { locale: desiredLocale }))
      .catch(err => log.warn('i18n: deferred locale switch failed', err))
  }
}

/** Boot-time init: read locale pref, seed i18next from pluginRegistry
 *  .languages, then listen for late registrations. Never throws — every
 *  failure degrades to English or raw keys with a logged warning. */
export async function initI18n() {
  try {
    const saved = await window.grapestrap.prefs.get(PREF_KEY)
    if (typeof saved === 'string' && saved) desiredLocale = saved
  } catch (err) {
    log.warn('i18n: could not read language pref — defaulting to en', err)
  }

  await i18next.init({
    lng: desiredLocale,
    fallbackLng: FALLBACK_LOCALE,
    resources: {},                // bundles added below via addCatalog()
    initImmediate: false,         // no async backend — init resolves synchronously
    keySeparator: false,          // catalogs use flat dotted keys
    nsSeparator: false,
    returnEmptyString: false,
    interpolation: { prefix: '{', suffix: '}', escapeValue: false } // textContent-only output
  })

  let accepted = 0
  for (const def of pluginRegistry.languages.values()) {
    if (addCatalog(def)) accepted++
  }
  if (accepted === 0) {
    log.warn('i18n: no language catalogs registered — UI will show raw message keys')
  }
  if (desiredLocale !== FALLBACK_LOCALE && !i18next.hasResourceBundle(desiredLocale, 'translation')) {
    log.warn(`i18n: preferred locale "${desiredLocale}" has no catalog — falling back to English`)
  }

  eventBus.on('plugin:language-registered', onLanguageRegistered)
  ready = true
  log.info(`i18n ready — locale=${getLocale()}, catalogs=${accepted}`)
}

/** Translate a flat dotted key. Pre-init → the key verbatim (never throws);
 *  missing everywhere → the key (i18next default); bad key → ''. */
export function t(key, options) {
  if (typeof key !== 'string' || !key) return ''
  if (!ready) return key
  return i18next.t(key, options)
}

export function isReady() { return ready }

export function getLocale() {
  return ready ? (i18next.resolvedLanguage || desiredLocale) : desiredLocale
}

/** [{ code, name }] of every registered catalog — Wave 4 prefs picker reads this. */
export function getAvailableLanguages() {
  return [...pluginRegistry.languages.values()].map(({ code, name }) => ({ code, name }))
}

/** Switch locale and persist the pref. Unknown codes apply with a warning
 *  (everything falls back to English until that pack registers — and the
 *  late-registration listener finishes the switch if it ever does). */
export async function setLocale(code) {
  if (typeof code !== 'string' || !code) throw new Error('setLocale: code must be a non-empty string')
  if (!ready) throw new Error('setLocale: i18n not initialized — call initI18n() first')
  if (!i18next.hasResourceBundle(code, 'translation')) {
    log.warn(`i18n: setLocale("${code}") has no catalog yet — English fallback until one registers`)
  }
  desiredLocale = code
  await i18next.changeLanguage(code)
  try {
    await window.grapestrap.prefs.set(PREF_KEY, code)
  } catch (err) {
    log.warn('i18n: failed to persist language pref (locale still active this session)', err)
  }
  eventBus.emit('i18n:locale-changed', { locale: code })
}
