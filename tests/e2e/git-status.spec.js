/**
 * GrapeStrap — E2E: git status indicator
 *
 * PATH: tests/e2e/git-status.spec.js
 * ROLE: Wave 3 git-status specs — non-repo renders nothing, mid-session
 *       git init discovery, immediate-on-bind branch paint, watcher-debounce
 *       modified dots (staged folds in), commit clears dots, ahead/behind
 *       arrows only with an upstream, exact-root guard for nested projects
 * DEPENDS: @playwright/test, node:child_process (git plumbing), ./helpers.js
 * CREATED: 2026-07-12
 *
 * Git plumbing runs node-side via execFileSync: `git init -b main` pins the
 * branch name against machine init.defaultBranch; commits pass
 * -c user.email/user.name so no global config is assumed. Deterministic
 * specs drive window.grapestrap.git.refresh(); exactly one spec (4)
 * deliberately waits out the real chokidar → 750 ms debounce pipeline.
 */
import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject } from './helpers.js'

// All git plumbing goes through one helper so every commit works on a
// config-less machine and no spec depends on init.defaultBranch.
function git(cwd, ...args) {
  return execFileSync(
    'git',
    ['-c', 'user.email=e2e@gstrap', '-c', 'user.name=e2e', ...args],
    { cwd, encoding: 'utf8' }
  )
}

// Round-trip an explicit refresh through the preload bridge and hand back
// the resolved wire payload.
function refreshGit(appWindow) {
  return appWindow.evaluate(() => window.grapestrap.git.refresh())
}

// Renderer-side counts of every git-status render artifact.
function gitUiCounts(appWindow) {
  return appWindow.evaluate(() => ({
    cells: document.querySelectorAll('.gstrap-sb-git').length,
    dots: document.querySelectorAll('[data-git-state]').length
  }))
}

// Reopen the project the spec already seeded — project.open funnels through
// bindProjectWatcher, so the git service re-binds and pushes an immediate
// status with NO manual refresh anywhere.
async function reopenProject(appWindow, manifestPath) {
  await appWindow.evaluate(async path => {
    const project = await window.grapestrap.project.open(path)
    window.__gstrap.projectState.set(project)
  }, manifestPath)
}

// ─── Spec 1 — non-repo renders nothing ───────────────────────────────────────
test('non-repo project renders nothing: no git cell, no git dots', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-git-none-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'g.gstrap'))

  // Absence is asserted only AFTER a refresh round-trip so the spec can't
  // pass vacuously before the first status push ever lands.
  const payload = await refreshGit(appWindow)
  expect(payload).toEqual({ repo: false })

  const counts = await gitUiCounts(appWindow)
  expect(counts.cells).toBe(0)
  expect(counts.dots).toBe(0)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 2 — mid-session git init discovered on refresh ─────────────────────
test('git init mid-session: refresh shows unborn branch + untracked dots', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-git-init-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'g.gstrap'))

  // Terminal-side init fires zero watcher events (chokidar ignores dotdirs)
  // — the every-cycle re-probe behind git:refresh is what discovers it.
  git(projectDir, 'init', '-b', 'main')
  const payload = await refreshGit(appWindow)
  expect(payload.repo).toBe(true)
  // F5: unborn branch — "## No commits yet on main" parses to the name.
  expect(payload.branch).toBe('main')
  expect(payload.untracked).toContain('site/pages/index.html')

  await appWindow.waitForFunction(
    txt => document.querySelector('.gstrap-sb-git')?.textContent === txt,
    'main', { timeout: 5_000 })

  // The page ROW carries the dot — proves --untracked-files=all listing;
  // the default -unormal would collapse to one "site/" entry and never
  // match a row path.
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-fm-page][data-git-state="untracked"]').length > 0,
    null, { timeout: 5_000 })

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 3 — immediate-on-bind paint for a clean repo ───────────────────────
test('opening a project inside a clean repo paints branch immediately, zero dots, no arrows', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-git-clean-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'g.gstrap'))
  git(projectDir, 'init', '-b', 'main')
  git(projectDir, 'add', '-A')
  git(projectDir, 'commit', '-m', 'seed')

  // No manual refresh anywhere past this point — bindGitStatus's immediate
  // status is what must paint the cell.
  await reopenProject(appWindow, join(projectDir, 'g.gstrap'))

  await appWindow.waitForFunction(
    () => (document.querySelector('.gstrap-sb-git')?.textContent || '') !== '',
    null, { timeout: 5_000 })

  const state = await appWindow.evaluate(() => ({
    cellText: document.querySelector('.gstrap-sb-git')?.textContent || '',
    dots: document.querySelectorAll('[data-git-state]').length
  }))
  expect(state.cellText).toBe('main')          // no upstream → no arrows (V4)
  expect(state.cellText).not.toMatch(/[↑↓]/)
  expect(state.dots).toBe(0)                   // clean tree → zero dots

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 4 — external edit through the real watcher+debounce pipeline ───────
test('external edit → modified dot via watcher debounce; git add keeps it modified', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-git-ext-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'g.gstrap'))
  git(projectDir, 'init', '-b', 'main')
  git(projectDir, 'add', '-A')
  git(projectDir, 'commit', '-m', 'seed')
  await reopenProject(appWindow, join(projectDir, 'g.gstrap'))
  await appWindow.waitForFunction(
    txt => document.querySelector('.gstrap-sb-git')?.textContent === txt,
    'main', { timeout: 5_000 })

  // Real pipeline, NO manual refresh: chokidar (200 ms awaitWriteFinish) →
  // notifyChange (750 ms trailing debounce) → status → push → repaint.
  await fsp.appendFile(join(projectDir, 'site', 'pages', 'index.html'),
    '\n<!-- external edit probe -->\n')

  await appWindow.waitForFunction(
    () => document.querySelector('[data-fm-page]')?.dataset?.gitState === 'modified',
    null, { timeout: 10_000 })

  // V1: staged folds into modified — git add must not change the dot.
  git(projectDir, 'add', '-A')
  const payload = await refreshGit(appWindow)
  expect(payload.repo).toBe(true)
  expect(payload.changed).toContain('site/pages/index.html')
  expect(payload.untracked).not.toContain('site/pages/index.html')
  await appWindow.waitForFunction(
    () => document.querySelector('[data-fm-page]')?.dataset?.gitState === 'modified',
    null, { timeout: 5_000 })

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 5 — commit clears dots, branch cell survives ───────────────────────
test('commit clears dots; branch cell survives', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-git-commit-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'g.gstrap'))
  git(projectDir, 'init', '-b', 'main')
  git(projectDir, 'add', '-A')
  git(projectDir, 'commit', '-m', 'seed')

  // Dirty the tracked page, prove the dot via explicit refresh — this spec
  // documents the blind-spot recovery path: terminal-only git operations
  // are picked up by an explicit refresh (or the next save/focus).
  await fsp.appendFile(join(projectDir, 'site', 'pages', 'index.html'),
    '\n<!-- to be committed -->\n')
  const dirty = await refreshGit(appWindow)
  expect(dirty.changed).toContain('site/pages/index.html')
  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-git-state="modified"]').length > 0,
    null, { timeout: 5_000 })

  git(projectDir, 'commit', '-am', 'clears the dots')
  const clean = await refreshGit(appWindow)
  expect(clean.repo).toBe(true)
  expect(clean.changed).toEqual([])
  expect(clean.untracked).toEqual([])

  await appWindow.waitForFunction(
    () => document.querySelectorAll('[data-git-state]').length === 0,
    null, { timeout: 5_000 })
  const cellText = await appWindow.evaluate(
    () => document.querySelector('.gstrap-sb-git')?.textContent || '')
  expect(cellText).toBe('main')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 6 — ahead/behind arrows only with an upstream ──────────────────────
test('ahead/behind arrows render only with an upstream', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-git-arrows-'))
  const remoteDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-git-remote-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'g.gstrap'))
  git(projectDir, 'init', '-b', 'main')
  git(projectDir, 'add', '-A')
  git(projectDir, 'commit', '-m', 'seed')

  // Local bare remote — upstream exists and is in sync: zeros stay hidden.
  git(remoteDir, 'init', '--bare')
  git(projectDir, 'remote', 'add', 'origin', remoteDir)
  git(projectDir, 'push', '-u', 'origin', 'main')

  const inSync = await refreshGit(appWindow)
  expect(inSync.tracking).toBe('origin/main')
  expect(inSync.ahead).toBe(0)
  await appWindow.waitForFunction(
    txt => document.querySelector('.gstrap-sb-git')?.textContent === txt,
    'main', { timeout: 5_000 })

  // One local commit → ahead 1 → the ↑ arrow appears.
  await fsp.appendFile(join(projectDir, 'site', 'pages', 'index.html'),
    '\n<!-- ahead probe -->\n')
  git(projectDir, 'commit', '-am', 'ahead by one')

  const ahead = await refreshGit(appWindow)
  expect(ahead.ahead).toBe(1)
  await appWindow.waitForFunction(
    txt => document.querySelector('.gstrap-sb-git')?.textContent === txt,
    'main ↑1', { timeout: 5_000 })

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
  await fsp.rm(remoteDir, { recursive: true, force: true })
})

// ─── Spec 7 — exact-root guard: nested project renders nothing ───────────────
test('project nested in a parent repo renders nothing', async () => {
  const parentDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-git-parent-'))
  git(parentDir, 'init', '-b', 'main')
  const projectDir = join(parentDir, 'nested')
  await fsp.mkdir(projectDir)

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'g.gstrap'))

  // F6/F7: checkIsRepo('root') demands projectDir == repo toplevel — an
  // ancestor repo must NOT light up the indicator (also the perf guard
  // against running -uall status on a monster parent repo).
  const payload = await refreshGit(appWindow)
  expect(payload).toEqual({ repo: false })

  const counts = await gitUiCounts(appWindow)
  expect(counts.cells).toBe(0)
  expect(counts.dots).toBe(0)

  await app.close()
  await fsp.rm(parentDir, { recursive: true, force: true })
})
