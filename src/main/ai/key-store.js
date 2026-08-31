// =============================================================
// PATH: src/main/ai/key-store.js
// ROLE: safeStorage-encrypted per-provider API key storage for the AI agent panel
// DEPENDS: electron (safeStorage — lazy-required, never touched before app-ready), platform/xdg.js, logger.js
// CREATED: 2026-08-30
// UPDATED: 2026-08-30 (review pass) — atomic write (tmp file + rename, so a
// crash mid-write can no longer truncate ai-keys.json into a total key
// loss); decrypted-key cache per providerId (safeStorage.decryptString is a
// sync native keyring call — agent-session.js calls getKey() once per
// turn); config dir created mode 0700 instead of the fs default 0755.
// =============================================================
//
// Keys are encrypted with Electron's OS-keychain-backed safeStorage and
// persisted as base64 strings in `<XDG config dir>/ai-keys.json`
// (mode 0600), shape { [providerId]: "<base64>" }. NEVER log key material —
// every catch below logs only the providerId or a generic failure, never
// the plaintext key or the ciphertext.
//
// safeStorage.isEncryptionAvailable() / encryptString() / decryptString()
// throw if called before Electron's 'ready' event. Rather than a top-level
// `import ... from 'electron'` (which every other main-process module in
// this codebase uses safely, because those modules are only ever loaded
// after app.whenReady()), this file require()s 'electron' lazily, inside
// each function, via createRequire. Two reasons:
//   1. It guarantees nothing here can touch safeStorage before a caller
//      actually invokes one of these functions — ipc-handlers.js only
//      calls them from handlers registered inside app.whenReady().then().
//   2. Outside the Electron runtime (e.g. a future unit test run under
//      plain `node --test`), the 'electron' npm package resolves to a
//      path string, not the API surface — a top-level import would break
//      merely by importing this file. Lazy require defers that failure to
//      an actual call, and only when safeStorage is genuinely needed.

import { createRequire } from 'node:module'
import { promises as fsp } from 'node:fs'
import { dirname, join } from 'node:path'
import { xdg } from '../platform/xdg.js'
import { log } from '../logger.js'

const require = createRequire(import.meta.url)

const KEYS_FILE = join(xdg.config, 'ai-keys.json')
const FILE_MODE = 0o600
const DIR_MODE = 0o700

// providerId → decrypted plaintext key. Populated lazily by getKey() (the
// only expensive step is the sync native safeStorage.decryptString() call,
// not the tiny file read), and invalidated by setKey/clearKey — those are
// the only two ways a stored key can change, so there is no other
// invalidation path to wire up.
const decryptedKeyCache = new Map()

/**
 * Is OS-backed key encryption available in this session?
 * @returns {boolean} true when Electron's safeStorage can encrypt/decrypt
 */
export function encryptionAvailable() {
  return require('electron').safeStorage.isEncryptionAvailable()
}

/**
 * Does the store hold a non-empty key for this provider?
 * @param {string} providerId - e.g. 'anthropic'
 * @returns {Promise<boolean>}
 */
export async function hasStoredKey(providerId) {
  if (!providerId) return false
  const keys = await readKeysFile()
  return typeof keys[providerId] === 'string' && keys[providerId].length > 0
}

/**
 * Encrypt and persist an API key for a provider.
 * @param {string} providerId - e.g. 'anthropic'
 * @param {string} key - Plaintext API key, as typed by the user
 * @returns {Promise<void>}
 * @throws {Error} 'encryption-unavailable' when safeStorage can't encrypt
 *         on this system; a generic Error for a missing providerId/key or
 *         an I/O failure writing the store — never one that echoes `key`.
 */
export async function setKey(providerId, key) {
  if (!providerId) throw new Error('setKey: providerId is required')
  if (!key) throw new Error('setKey: key is required')
  if (!encryptionAvailable()) {
    throw new Error('encryption-unavailable')
  }
  const encrypted = require('electron').safeStorage.encryptString(key)
  const keys = await readKeysFile()
  keys[providerId] = encrypted.toString('base64')
  await writeKeysFile(keys)
  // The on-disk ciphertext just changed — drop any cached plaintext for
  // this provider so the next getKey() re-derives it instead of serving a
  // stale value.
  decryptedKeyCache.delete(providerId)
}

/**
 * Remove a stored key for a provider. No-op if none is stored.
 * @param {string} providerId - e.g. 'anthropic'
 * @returns {Promise<void>}
 */
export async function clearKey(providerId) {
  if (!providerId) return
  decryptedKeyCache.delete(providerId)
  const keys = await readKeysFile()
  if (providerId in keys) {
    delete keys[providerId]
    await writeKeysFile(keys)
  }
}

/**
 * Decrypt and return the stored key for a provider.
 * @param {string} providerId - e.g. 'anthropic'
 * @returns {Promise<string|null>} the decrypted key, or null when none is
 *          stored, the store is unreadable, or the ciphertext can no
 *          longer be decrypted (e.g. the OS keychain changed)
 */
export async function getKey(providerId) {
  if (!providerId) return null
  if (decryptedKeyCache.has(providerId)) return decryptedKeyCache.get(providerId)
  const keys = await readKeysFile()
  const stored = keys[providerId]
  if (typeof stored !== 'string' || stored.length === 0) return null
  try {
    const ciphertext = Buffer.from(stored, 'base64')
    const decrypted = require('electron').safeStorage.decryptString(ciphertext)
    decryptedKeyCache.set(providerId, decrypted)
    return decrypted
  } catch (err) {
    // Corrupt/undecryptable ciphertext (OS keychain rotated, file
    // hand-edited, truncated base64) must never crash the AI panel — the
    // user just re-enters the key. Log the providerId only.
    log.warn(`ai/key-store: could not decrypt stored key for provider "${providerId}"`)
    return null
  }
}

// ─── Storage file ──────────────────────────────────────────────────────────

/**
 * Read and parse the keys file.
 * @returns {Promise<Object<string,string>>} providerId → base64 ciphertext
 *          map; an empty object for a missing, corrupt, or non-object file
 *          — an unreadable store must degrade to "no keys configured"
 *          rather than crash the app.
 */
async function readKeysFile() {
  try {
    const raw = await fsp.readFile(KEYS_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {}
  } catch (err) {
    if (err?.code !== 'ENOENT' && !(err instanceof SyntaxError)) {
      log.warn('ai/key-store: could not read ai-keys.json, treating as empty:', err?.message || err)
    }
    return {}
  }
}

/**
 * Write the keys file, creating its parent directory if needed.
 *
 * Writes to a `.tmp` sibling first, then `rename()`s it over the real
 * target — `rename` within the same directory is atomic on POSIX
 * filesystems, so a crash or power loss mid-write leaves either the old
 * complete file or the new complete file, never a truncated one. A plain
 * truncate-and-write would otherwise have a window where a crash turns
 * "every stored key" into "an empty/corrupt file that readKeysFile()
 * quietly treats as {}" — silent total key loss.
 *
 * @param {Object<string,string>} keys - providerId → base64 ciphertext map
 * @returns {Promise<void>}
 */
async function writeKeysFile(keys) {
  await fsp.mkdir(dirname(KEYS_FILE), { recursive: true, mode: DIR_MODE })
  const tmpFile = `${KEYS_FILE}.tmp`
  const payload = JSON.stringify(keys, null, 2)
  await fsp.writeFile(tmpFile, payload, { mode: FILE_MODE })
  // writeFile's `mode` option only applies when the file is newly created;
  // an explicit chmod guarantees 0600 even if a stale .tmp from a prior
  // crash already existed with looser permissions.
  await fsp.chmod(tmpFile, FILE_MODE)
  await fsp.rename(tmpFile, KEYS_FILE)
}
