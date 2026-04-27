/**
 * GrapeStrap — Plugin trust prompt
 *
 * Shown the first time a user-installed plugin is encountered. Bundled plugins
 * are trusted implicitly (they ship with the app). Project-pinned plugins are
 * trusted implicitly (the user committed them to their project repo).
 *
 * Decision is recorded under prefs.plugins.trustedHashes.<name>. We hash the
 * manifest so that if a plugin's identity changes (manifest contents change),
 * we re-prompt — this prevents a "trusted" plugin from silently becoming
 * something else.
 *
 * v0.0.1: simplified — accept-or-reject confirmation only. v0.0.2 expands with
 * a richer dialog (description, permissions list, source, version).
 */

import { log } from '../log.js'

export async function trustPrompt(summary) {
  const fingerprint = await fingerprintManifest(summary)
  const trustedKey = `plugins.trustedHashes.${summary.name}`
  const previously = await window.grapestrap.prefs.get(trustedKey)

  if (previously === fingerprint) return true

  // v0.0.1: native confirm via window.confirm() under our CSP. v0.0.2 swaps in a
  // proper modal dialog with manifest preview.
  const accepted = window.confirm(
    `Load plugin "${summary.displayName || summary.name}"?\n\n` +
    `Source: ${summary.source}\n` +
    `Version: ${summary.version}\n` +
    `Type: ${summary.type}\n` +
    `${summary.description || ''}\n\n` +
    `Plugins run with full editor access. Only load plugins you trust.`
  )

  if (accepted) {
    await window.grapestrap.prefs.set(trustedKey, fingerprint)
    log.info(`trusted plugin: ${summary.name}`)
    return true
  }
  return false
}

async function fingerprintManifest(summary) {
  const text = JSON.stringify({
    name: summary.name,
    version: summary.version,
    type: summary.type,
    entry: summary.entry
  })
  const buf = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}
