/**
 * GrapeStrap — Manifest validator (renderer-side mirror)
 *
 * Main-process plugin-loader.js does the canonical validation. This is a thin
 * mirror used by the trust-prompt to surface the same fields to the user before
 * activation, and by tooling (a future "validate plugin" CLI subcommand).
 */

const REQUIRED = ['name', 'version', 'type', 'main', 'grapestrapVersion']
const VALID_TYPES = new Set([
  'block', 'section', 'panel', 'exporter', 'theme',
  'language', 'command', 'snippet-pack'
])

export function validateManifest(manifest) {
  const errors = []
  for (const f of REQUIRED) {
    if (!manifest[f]) errors.push(`missing field: ${f}`)
  }
  if (manifest.type && !VALID_TYPES.has(manifest.type)) {
    errors.push(`invalid type: ${manifest.type}`)
  }
  return { valid: errors.length === 0, errors }
}

export { REQUIRED, VALID_TYPES }
