// =============================================================
// PATH: src/main/ai/provider.js
// ROLE: AI provider registry + the single test seam (GSTRAP_AI_FAKE)
//       that swaps every provider for the deterministic fake one
// DEPENDS: anthropic-provider.js, fake-provider.js, logger.js
// CREATED: 2026-08-30
// =============================================================
//
// The descriptor shape every entry in PROVIDERS implements, and the two
// error vocabularies they speak, are documented in contract.js.
//
// This is also the ONLY module in the app that reads GSTRAP_AI_FAKE — one
// seam, one place, so no production code path carries a test-mode branch.

import { log } from '../logger.js'
import { anthropicProvider } from './anthropic-provider.js'
import { fakeProvider } from './fake-provider.js'
import { ollamaProvider } from './ollama-provider.js'

export const DEFAULT_PROVIDER_ID = 'anthropic'

const PROVIDERS = Object.freeze({
  anthropic: anthropicProvider,
  ollama: ollamaProvider
})

let unknownProviderWarned = false

/**
 * True when the app is running against the deterministic fake provider.
 * This is the ONLY test seam — fake mode reaches neither the key store nor
 * the network, so specs never need a real credential.
 * @returns {boolean}
 */
export function isFakeMode() {
  return process.env.GSTRAP_AI_FAKE === '1'
}

/**
 * Resolve a provider descriptor by id.
 *
 * An unknown id falls back to the default provider instead of throwing: the
 * id comes from a user-editable preferences file, and a corrupt value there
 * must degrade the AI panel, not crash the status handler that paints it.
 *
 * @param {string} id - provider id from prefs (ai.provider)
 * @returns {object} provider descriptor (never null)
 */
export function getProvider(id) {
  if (isFakeMode()) return fakeProvider

  const descriptor = PROVIDERS[id]
  if (descriptor) return descriptor

  if (!unknownProviderWarned) {
    unknownProviderWarned = true
    log.warn(`ai: unknown provider "${id}" in prefs — falling back to ${DEFAULT_PROVIDER_ID}`)
  }
  return PROVIDERS[DEFAULT_PROVIDER_ID]
}
