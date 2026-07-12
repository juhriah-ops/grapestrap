// =============================================================
// PATH: tests/e2e/plugin-robustness.spec.js
// ROLE: Wave 0 coverage-hole spec — plugin discovery is hostile-input-safe:
//       an incompatible grapestrapVersion is skipped (semver gate), malformed
//       manifest JSON / missing fields / missing entry never crash discovery,
//       bundled plugins still activate, and a VALID user plugin dropped into
//       $XDG_CONFIG_HOME/GrapeStrap/plugins/ activates end-to-end. Also the
//       regression net for landmine #1 (version bump vs plugin ranges).
// DEPENDS: ./helpers.js (launch, openSeedProject, EXPECTED_PLUGIN_COUNT);
//          relies on launch(extraEnv) spreading extraEnv AFTER its own XDG
//          vars so callers can pre-seed the plugins dir.
// CREATED: 2026-07-12
// =============================================================
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { launch, openSeedProject, EXPECTED_PLUGIN_COUNT } from './helpers.js'

// Build an isolated XDG root whose config half is pre-seeded before launch.
// Returned env overrides ALL four XDG vars so plugins, prefs, and the
// main.log all land where this spec can see them.
async function makeXdgRoot() {
  const root = await fsp.mkdtemp(join(tmpdir(), 'gstrap-plugrob-'))
  const env = {
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_CACHE_HOME:  join(root, 'cache'),
    XDG_DATA_HOME:   join(root, 'data'),
    XDG_STATE_HOME:  join(root, 'state')
  }
  const pluginsDir = join(env.XDG_CONFIG_HOME, 'GrapeStrap', 'plugins')
  const logPath = join(env.XDG_DATA_HOME, 'GrapeStrap', 'logs', 'main.log')
  await fsp.mkdir(pluginsDir, { recursive: true })
  return { root, env, pluginsDir, logPath }
}

async function seedPlugin(pluginsDir, dirName, manifest, entrySource) {
  const dir = join(pluginsDir, dirName)
  await fsp.mkdir(dir, { recursive: true })
  const manifestText = typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2)
  await fsp.writeFile(join(dir, 'grapestrap.json'), manifestText, 'utf8')
  if (entrySource != null) await fsp.writeFile(join(dir, 'index.js'), entrySource, 'utf8')
  return dir
}

// electron-log flushes async — poll the main log until every needle appears
// (or timeout; the final expect()s then report exactly which line is missing).
async function readLogUntil(logPath, needles, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  let text = ''
  for (;;) {
    text = await fsp.readFile(logPath, 'utf8').catch(() => '')
    if (needles.every(n => text.includes(n)) || Date.now() > deadline) return text
    await new Promise(r => setTimeout(r, 250))
  }
}

test('Plugin robustness: broken user plugins are skipped, app boots, bundled plugins activate', async () => {
  const { root, env, pluginsDir, logPath } = await makeXdgRoot()
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-plugrob-proj-'))
  const projectPath = join(projectDir, 'plugrob.gstrap')

  // (a) Valid manifest, incompatible semver range. '>=9.0.0' stays
  // incompatible across the Wave 0 bump too: the loader compares
  // stripPre(appVersion) — 0.0.2 today, 0.1.0 after the bump — both < 9.0.0.
  await seedPlugin(pluginsDir, 'e2e-incompat', {
    name: 'gstrap-e2e-incompat', version: '1.0.0', type: 'command',
    main: 'index.js', grapestrapVersion: '>=9.0.0'
  }, 'export default function () {}\n')

  // (b) Malformed manifest JSON. (c) Valid JSON missing the required `main`.
  // (d) Valid manifest whose entry file does not exist.
  await seedPlugin(pluginsDir, 'e2e-badjson', '{ "name": "gstrap-e2e-badjson",', null)
  await seedPlugin(pluginsDir, 'e2e-nofield', {
    name: 'gstrap-e2e-nofield', version: '1.0.0', type: 'command',
    grapestrapVersion: '>=0.0.1'
  }, null)
  await seedPlugin(pluginsDir, 'e2e-noentry', {
    name: 'gstrap-e2e-noentry', version: '1.0.0', type: 'command',
    main: 'index.js', grapestrapVersion: '>=0.0.1'
  }, null)

  const { app, appWindow } = await launch(env)

  // Exactly the bundled set activates — none of the junk, no crash.
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 }
  )
  const listed = await appWindow.evaluate(async () =>
    (await window.grapestrap.plugins.list()).map(p => p.name))
  expect(listed).toHaveLength(EXPECTED_PLUGIN_COUNT)
  expect(listed.filter(n => n.startsWith('gstrap-e2e'))).toEqual([])

  // Every skip reason logged by the loader shows up in main.log.
  const logText = await readLogUntil(logPath, [
    'gstrap-e2e-incompat requires grapestrapVersion',
    'invalid JSON',
    'missing required field: main',
    'entry not found'
  ])
  expect(logText).toContain('gstrap-e2e-incompat requires grapestrapVersion')
  expect(logText).toContain('invalid JSON')
  expect(logText).toContain('missing required field: main')
  expect(logText).toContain('entry not found')

  // And the app is genuinely usable afterwards — full project create + canvas.
  await openSeedProject(appWindow, projectPath)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
  await fsp.rm(root, { recursive: true, force: true })
})

test('Plugin robustness: a valid user plugin from the XDG plugins dir activates alongside the bundled set', async () => {
  const { root, env, pluginsDir } = await makeXdgRoot()

  const manifest = {
    name: 'gstrap-e2e-probe', version: '1.0.0', type: 'command',
    displayName: 'E2E Probe', main: 'index.js',
    // Open-ended range so this survives the Wave 0 version bump (and proves
    // landmine #1's fix: compatible plugins keep activating on 0.1.0-rc.x).
    grapestrapVersion: '>=0.0.1'
  }
  const dir = await seedPlugin(pluginsDir, 'e2e-probe', manifest,
    "export default function (api) { api.registerCommand({ id: 'e2e:probe', label: 'E2E probe', handler: () => {} }) }\n")

  // Neutralize the first-run trust prompt deterministically: pre-record the
  // trust fingerprint in preferences.json. MUST mirror trust-prompt.js
  // fingerprintManifest(): sha256 of JSON.stringify({name, version, type,
  // entry}) where entry is the ABSOLUTE entry path from the discovery
  // summary. If the fingerprint recipe changes, update this in lockstep.
  const fingerprint = createHash('sha256').update(JSON.stringify({
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    entry: join(dir, 'index.js')
  })).digest('hex')
  await fsp.writeFile(
    join(env.XDG_CONFIG_HOME, 'GrapeStrap', 'preferences.json'),
    JSON.stringify({
      general: { welcomeShown: true },
      plugins: { trustedHashes: { [manifest.name]: fingerprint } }
    }, null, 2),
    'utf8'
  )

  const { app, appWindow } = await launch(env)

  // Bundled set + our probe.
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT + 1, { timeout: 15_000 }
  )

  // Discovered with source 'user', activated, and its contribution landed.
  const probe = await appWindow.evaluate(() => {
    const reg = window.__gstrap.pluginRegistry
    const avail = reg.available.find(p => p.name === 'gstrap-e2e-probe')
    return {
      source: avail?.source,
      activated: reg.activated.some(a => a.summary.name === 'gstrap-e2e-probe'),
      commandRegistered: reg.commands.has('e2e:probe'),
      failed: reg.failed.map(f => f.summary?.name)
    }
  })
  expect(probe.source).toBe('user')
  expect(probe.activated).toBe(true)
  expect(probe.commandRegistered).toBe(true)
  expect(probe.failed).toEqual([])

  await app.close()
  await fsp.rm(root, { recursive: true, force: true })
})
