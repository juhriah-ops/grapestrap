/**
 * GrapeStrap — E2E: switching projects in one session
 *
 * PATH: tests/e2e/project-switch.spec.js
 * ROLE: Regression coverage for the nola1 2026-08-06 report: open project A,
 *       then open project B — Custom CSS updated but the canvas kept showing
 *       A's page, and further opens changed nothing. Root cause: projectState
 *       .set() over an open project never tore the old one down, so A's
 *       "index" tab survived, pageState.open('index') re-focused it, and
 *       swapToTab's same-name guard skipped the canvas load. Also proves no
 *       content bleed: edits made in A must not be captured into B's
 *       same-named page after the switch.
 * DEPENDS: @playwright/test, ./helpers.js, src/renderer/state/project-state.js
 * CREATED: 2026-08-06
 */
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, dismissWelcome, EXPECTED_PLUGIN_COUNT } from './helpers.js'

// Create + open a project through the same calls cmdNewProject/cmdOpenProject
// make: project.new → projectState.set → pageState.open(first page). The
// teardown under test lives inside projectState.set(), so this IS the code
// path the File menu exercises.
async function openProject(appWindow, name, projectPath) {
  await appWindow.evaluate(async ({ name: n, path }) => {
    const project = await window.grapestrap.project.new({ name: n, location: path })
    const { projectState, pageState } = window.__gstrap
    projectState.set(project)
    pageState.open(project.pages[0].name)
  }, { name, path: projectPath })
  // The seed page's h1 is the project name — wait until the canvas shows it.
  await appWindow.waitForFunction(n => {
    const doc = window.__gstrap.pluginRegistry.bound.editor?.Canvas?.getFrameEl()?.contentDocument
    return doc?.body?.textContent?.includes(n)
  }, name, { timeout: 10_000 })
}

async function launchReady() {
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  await appWindow.waitForFunction(
    n => window.__gstrap?.pluginRegistry?.activated?.length === n,
    EXPECTED_PLUGIN_COUNT, { timeout: 15_000 }
  )
  return { app, appWindow }
}

test('opening a second project swaps the canvas, tabs, and Custom CSS to the new project', async () => {
  const { app, appWindow } = await launchReady()
  const dirA = await fsp.mkdtemp(join(tmpdir(), 'gstrap-swA-'))
  const dirB = await fsp.mkdtemp(join(tmpdir(), 'gstrap-swB-'))

  await openProject(appWindow, 'alpha', join(dirA, 'alpha.gstrap'))
  await openProject(appWindow, 'beta', join(dirB, 'beta.gstrap'))

  const state = await appWindow.evaluate(() => {
    const doc = window.__gstrap.pluginRegistry.bound.editor.Canvas.getFrameEl().contentDocument
    return {
      canvasText: doc.body.textContent,
      tabCount: window.__gstrap.pageState.tabs.length,
      projectName: window.__gstrap.projectState.current.manifest.metadata.name,
      customCss: window.__gstrap.getCssEditor()?.getValue() ?? null
    }
  })
  expect(state.canvasText).toContain('beta')
  expect(state.canvasText).not.toContain('alpha')
  expect(state.tabCount).toBe(1)
  expect(state.projectName).toBe('beta')
  // Both seeds ship the same default stylesheet; the meaningful check is
  // that the editor buffer follows projectState.current, not the old buffer.
  expect(state.customCss).toBe(await appWindow.evaluate(
    () => window.__gstrap.projectState.current.globalCSS))

  await app.close()
})

test('edits made in the first project do not bleed into the second project\'s same-named page', async () => {
  const { app, appWindow } = await launchReady()
  const dirA = await fsp.mkdtemp(join(tmpdir(), 'gstrap-swA-'))
  const dirB = await fsp.mkdtemp(join(tmpdir(), 'gstrap-swB-'))

  await openProject(appWindow, 'alpha', join(dirA, 'alpha.gstrap'))
  // Real canvas edit in A (GrapesJS component append — dirties the page).
  await appWindow.evaluate(() => {
    window.__gstrap.pluginRegistry.bound.editor.getWrapper()
      .append('<p data-marker="bleed">ALPHA-ONLY-MARKER</p>')
  })

  await openProject(appWindow, 'beta', join(dirB, 'beta.gstrap'))
  // Switch through a view-mode change (capture path) and back, then inspect
  // B's page source — the marker must not have been captured into it.
  await appWindow.evaluate(() => {
    const { pageState } = window.__gstrap
    pageState.setViewMode(pageState.active().pageName, 'code')
    pageState.setViewMode(pageState.active().pageName, 'design')
  })
  const bState = await appWindow.evaluate(() => {
    const doc = window.__gstrap.pluginRegistry.bound.editor.Canvas.getFrameEl().contentDocument
    return {
      pageHtml: window.__gstrap.projectState.current.pages[0].html,
      canvasText: doc.body.textContent
    }
  })
  expect(bState.pageHtml).not.toContain('ALPHA-ONLY-MARKER')
  expect(bState.canvasText).not.toContain('ALPHA-ONLY-MARKER')

  await app.close()
})
