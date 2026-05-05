# GrapeStrap — debug-session restart brief

Paste this into a fresh Claude session. Self-contained — assumes no memory of the prior session.

---

## Context

You are picking up a GrapeStrap debug session. The user runs the app on nola1 (Linux workstation) and reports bugs from real-project testing. Recent work pushed 5 patch releases (alpha.4 → alpha.8) all driven by user reports — three discrete bugs, then an architectural pivot, then closing the visibility gap, then restoring an earlier default.

State at session start:

- Repo: `/home/numb1/projects/grapestrap`
- Branch: `main` — clean working tree
- HEAD: `7a7f744` (or later)
- Tags: `v0.0.1-alpha`, `v0.0.2-alpha`, `v0.0.2-alpha.1` … `v0.0.2-alpha.8`
- Specs: 51/51 green via `xvfb-run -a npx playwright test`
- Origin: `github.com/juhriah-ops/grapestrap`
- Workstation: nola1 (`jsmith@192.168.0.192`) has a synced copy at `~/projects/grapestrap`. No git or rsync there — push via tar pipe (see ship recipe).

Read the auto-memory entry at `~/.claude/projects/-home-numb1/memory/session_2026_05_04_grapestrap_alpha4_8.md` for the full architecture context. The build plan is at `GRAPESTRAP_BUILD_PLAN_v4.md` in the repo.

## What landed in alpha.4 → alpha.8

### alpha.4 — three user-reported regressions
- Code-view save dropped Monaco edits. Two fixes: `pageState.setViewMode` now emits `prev` separately (was mutating before emit, so listeners read `prev === next`); `flushActiveTabIntoProject` now rebuilds canvas from code first when in code/split view.
- Insert-panel drag pasted block id as plain text. Two fixes: stop setting `text/plain` on dataTransfer (browser default-drop pastes it); stash block id on `window.__gstrapDragBlockId` since Electron strips custom MIME types crossing the iframe boundary; iframe drop handler reads via `window.parent` as fallback. Drop also `stopPropagation()` so contentEditable can't steal it.
- Images vanished on canvas-fullscreen (GL maximize). GL re-parents the iframe → reload → `<base>` lands AFTER images start fetching. Fix: reassign every relative `<img>` src after `<base>` updates. Also wired GL `stateChanged` → `canvas:gl-state-changed` → resync.

### alpha.5 — stylesheet broke when cycling devices in fullscreen
Workaround: BOOTSTRAP_CSS / ICONS_CSS / BOOTSTRAP_JS resolved to absolute renderer-base URLs at module load time. (Superseded by alpha.6.)

### alpha.6 — architectural pivot: framework assets in-project
Bootstrap + Bootstrap Icons + Font Awesome live inside each project's `site/assets/` from creation. `project-manager.js#copyFrameworkAssets(siteRoot)` writes them at create / import / load (idempotent backfill on load). Canvas loads via project-relative paths through `<base href>` — same paths in canvas + on a deployed server. `canvas.styles` / `canvas.scripts` is empty; `syncFrameworksIntoCanvas` injects after `<base>` lands.

Layout:
```
site/assets/
  css/  bootstrap.{css,min.css,...maps}, bootstrap-icons.{css,min.css},
        all.{css,min.css}, fonts/bootstrap-icons.{woff,woff2}, style.css
  js/   bootstrap.bundle.{js,min.js,...maps}
  webfonts/  fa-{solid,regular,brands,v4compatibility}-*.woff2
```

### alpha.7 — pages saved as full HTML
Each `site/pages/*.html` is now `<!doctype html>...</html>` with `<head>` (charset, viewport, title, description, favicon, framework links, project style.css) and `<body>` with the canvas-edited content + end-of-body `bootstrap.bundle.js`. Code editor shows the same composed full HTML; edits to head section round-trip back into manifest's `page.head` fields. Shared module `src/shared/page-html.js` exports `composeFullPageHtml` and `extractPageFromFullHtml`. GrapeStrap-managed tags get `data-grpstr-*` attributes for round-trip parsing.

### alpha.8 — un-min framework defaults
Restored alpha.3 default (`bootstrap.css` not `.min.css`) for browser-devtools quality. Both un-min + min ship.

## Your task: continue the debug

The user is testing on nola1 and may report more bugs. Your job:

1. **Baseline first.** `xvfb-run -a npx playwright test` should report 51/51 green. If specs fail, that's your starting bug (and likely a real regression, not a flake — the suite has been clean across all 5 patch ships today).
   - **Tmpfs gotcha**: each spec mkdtemps a project + copies ~50MB of frameworks. Cumulative across 51 specs can fill `/tmp` (3.9GB tmpfs on the sandbox) mid-run, surfacing as "32 passed" + "No space left on device". Run `find /tmp -maxdepth 1 -type d -name "gstrap-*" -mmin +5 -exec rm -rf {} +` before the suite if needed.

2. **Listen carefully.** User reports are short and high-context. Ask before acting on ambiguity. Reproduce the issue mentally before patching. Look at the code to find the root cause, don't just paper over the symptom.

3. **Spec every fix.** New regression spec for any non-trivial bug. The 51-spec baseline should grow with each patch, not stay flat.

4. **Stay within v0.0.2-alpha.x scope.** Bug fixes only. v0.0.3 features (Theme panel, GL `item.hide()` integration, drag-from-asset-tile, full `<head>` round-trip on import, drag-resize columns) are NOT for this session unless the user explicitly redirects.

## Constraints

- 51 specs MUST stay green. Bump the count, don't drop it.
- Don't break the v0.0.2-alpha.2 layout or the v0.0.2-alpha.6 framework-in-project layout.
- Push to nola1 + origin after each meaningful commit (see ship recipe).
- The user values short responses, no narrating internal deliberation. Status updates only at key moments.

## Ship recipe (use after each meaningful patch)

```bash
cd /home/numb1/projects/grapestrap
npm run build 2>&1 | tail -3
xvfb-run -a npx playwright test 2>&1 | tail -5      # expect 51 (or more) passed
# ...edit CHANGELOG.md "Unreleased" → new version section
# ...bump package.json version
git add -A && git commit -m "v0.0.2-alpha.X: <message>" -m "..." \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git tag -a v0.0.2-alpha.X -m "..."
git push origin main
git push origin v0.0.2-alpha.X
# Push to nola1 (no git/rsync there):
tar c --exclude=node_modules --exclude=test-results --exclude=playwright-report --exclude=.git . \
  | ssh jsmith@192.168.0.192 "cd /home/jsmith/projects/grapestrap && tar x"
ssh jsmith@192.168.0.192 "cd /home/jsmith/projects/grapestrap && grep version package.json"
```

## Known v0.0.3 backlog (NOT for this debug session)

- Theme panel for BS5 design tokens
- GL v2 `item.hide()/show()` integration so panel toggles fully relayout
- Drag-from-asset-tile onto canvas
- Full `<head>` round-trip on import (importer still hoists `<head>` content into body — alpha.7 fixed save/load round-trip but importer is separate)
- Drag-to-resize columns

If the user reports something from this list as broken, surface it; don't attempt a build unless they redirect.

## Useful greps

- Framework path constants: `src/shared/page-html.js` (FRAMEWORK_LINKS, FRAMEWORK_SCRIPTS), `src/renderer/editor/grapesjs-init.js` (FRAMEWORK_CSS, FRAMEWORK_JS)
- Asset copy: `src/main/project-manager.js` (`copyFrameworkAssets`)
- Save/load page wrap: `src/main/project-manager.js` (`saveProject`, `loadProject`, uses `composeFullPageHtml` / `extractPageFromFullHtml`)
- Code editor sync: `src/renderer/editor/canvas-sync.js` (`syncCanvasToCode`, `rebuildCanvasFromCode`)
- Canvas iframe head injection: `src/renderer/editor/grapesjs-init.js` (`syncBaseHrefIntoCanvas`, `syncFrameworksIntoCanvas`, `syncGlobalCssIntoCanvas`)
- Insert-panel drag: `src/renderer/panels/insert/index.js`
- GL maximize hook: `src/renderer/layout/golden-layout-config.js` (look for `stateChanged`)
