# GrapeStrap — debug-session restart brief

Paste this into a fresh Claude session. Self-contained — assumes no memory of the prior session.

---

## Context

You are picking up a GrapeStrap debug session. The user runs the app on nola1 (Linux workstation `jsmith@192.168.0.192`) and reports bugs from real-project testing. The most recent stretch shipped four patch releases — alpha.9 → alpha.12 — driven by a single evening of nola1 reports about the right-side panel column.

State at session start:

- Repo: `/home/numb1/projects/grapestrap`
- Branch: `main`, clean tree
- HEAD: `ba90aab` (or later)
- Tags: `v0.0.1-alpha`, `v0.0.2-alpha` … `v0.0.2-alpha.12`
- Specs: 53/53 green via `xvfb-run -a npx playwright test`
- Origin: `github.com/juhriah-ops/grapestrap`
- nola1: synced via tar pipe (no git/rsync there). Verify with `cat .git/refs/heads/main`.

Read the auto-memory entry at `~/.claude/projects/-home-numb1/memory/session_2026_05_05_grapestrap_alpha9_12.md` for the full architecture context. The build plan is at `GRAPESTRAP_BUILD_PLAN_v4.md` in the repo.

## What landed alpha.9 → alpha.12 (in priority of "things you'll touch when debugging")

### Layout (alpha.12 — current shape)

The shell is one row of three children, all stacks:

```
LEFT STACK (18%)              CENTER (56%)              RIGHT STACK (26%)
Project | Library | Asset     Canvas / Code / Split     DOM | Properties | Custom CSS
```

Properties is the default-active right tab. View → Toggle X for each of DOM / Properties / Custom CSS hides just that tab + content (body class hides `.lm_tab[title="X"]` + `.lm_content.gstrap-X-host`). If ALL THREE end up hidden, the whole right stack collapses via the alpha.10 size-redistribute trick so the canvas reclaims its 26%; toggling any one back on restores the stack.

### Panel hide/show — `src/renderer/layout/panel-visibility.js`

This module is the canonical "make GL re-layout when programmatic state changes" path. It snapshots the parent's children sizes, sets the target's `size = 0`, redistributes the freed share proportionally to visible siblings, then calls `requestFullRelayout()`. Restore is symmetric.

GL's own `item.hide()` does NOT work for our case: it flips `display:none` inside `beginSizeInvalidation` / `endSizeInvalidation`, but `setSize → calculateAbsoluteSizes` iterates ALL contentItems regardless of visibility and assigns each its `size`-percent share. Hidden items still get their slice. We have to zero `size` ourselves.

The orphaned splitter next to a hidden item is hidden via `.is-gstrap-hidden + .lm_splitter, .lm_splitter:has(+ .is-gstrap-hidden) { display: none }`.

### Why panels need `requestFullRelayout()` not just `layout.updateSize()`

Monaco runs with `automaticLayout: false` (intentional — see `monaco-init.js` comment: per-instance ROs raced with the host RO). It only re-lays-out when `relayoutAllMonaco()` pokes it. `layout.updateSize()` resizes GL boxes but doesn't poke Monaco; the editor freezes at old pixel dimensions until something else fires.

`requestFullRelayout()` is exported from `src/renderer/layout/golden-layout-config.js` and runs the same chain the host RO runs: `layout.updateSize()` + `relayoutAllMonaco()` + GrapesJS `refresh()`. **Use it after any programmatic GL change.** Don't call `layout.updateSize()` standalone.

### Panel hosts — DON'T position-absolute the .lm_content

`gstrap-fm-host`, `gstrap-props-host`, `gstrap-dom-host`, `gstrap-am-host`, `gstrap-lib-host` classes are added directly to `.lm_content` (panel render fns receive `container.element` which IS `.lm_content`). If you give them `position: absolute; inset: 0`, they escape GL's containing block — content renders at the header's Y, 2px wider than the column. Use `height: 100%; overflow-y: auto` instead. GL gives `.lm_content` a definite pixel height, so `height: 100%` resolves correctly and scroll works.

### Linux menu-bar lock (alpha.11)

Electron + GTK CSD on Linux can drop the application menu bar during rapid resize cycles. `createMainWindow` in `src/main/main.js` now does `setAutoHideMenuBar(false)` + `setMenuBarVisibility(true)` and re-asserts on `resize` / `maximize` / `unmaximize` / `leave-full-screen`. Don't remove these defenses.

## Open follow-ups (priority order)

1. **Properties↔Custom CSS source-of-truth sync** — User report (2026-05-05): "if I select a background image in the properties tool bar it doesnt save to the css but the css will have a backgroundimage saved as well its not clear which window overides which. same thing with background position, attachment etc." Properties writes to a separate CSS scope from `globalCSS`; the Custom CSS view shows `globalCSS` only. The two can show conflicting state for the same selector with no precedence indicator. Pick a model: Properties writes into `globalCSS` (Custom CSS reflects live), OR keep them separate but show precedence in UI. Tracked in alpha.12 CHANGELOG known-follow-ups. Likely first task this session.

2. **Splitter snap-then-lock + crash mid-drag** — alpha.9 known issue. User reported "snaps ~50px then sticks" plus one crash with `[ERROR:atom_cache.cc(229)] Add chromium/from-privileged to kAtomsToCache`. Headless splitter math is exact (vertical +80 / horizontal -100 px). Likely tied to canvas/Monaco RO firing during drag-stop's queued `updateSize`. Re-test on alpha.12 first — the layout consolidation removed the noisy splitter that was the worst offender. Might be a non-issue now.

3. **v0.0.3 backlog (NOT for this debug session unless user asks)**: Theme panel for BS5 design tokens; drag-from-asset-tile onto canvas; full `<head>` round-trip on import; drag-to-resize columns.

## Your task: continue the debug

The user is testing on nola1 and may report more bugs. Your job:

1. **Baseline first.** `xvfb-run -a npx playwright test` should report 53/53 green. If specs fail, that's your starting bug (and likely a real regression — the suite has been clean across all four patch ships in the last session).
   - **Tmpfs gotcha**: each spec mkdtemps a project + copies ~50MB of frameworks. Cumulative across 53 specs can fill `/tmp` (3.9GB on the sandbox) mid-run, surfacing as "32 passed" + "No space left on device". Run `find /tmp -maxdepth 1 -type d -name "gstrap-*" -mmin +5 -exec rm -rf {} +` before the suite if needed.

2. **Listen carefully.** User reports are short and high-context. Take them at face value the first time — don't ask the same question rephrased. Reproduce the issue mentally before patching. Look at the code to find the root cause; don't just paper over the symptom.

3. **Spec every fix.** New regression spec for any non-trivial bug. The 53-spec baseline should grow with each patch, not stay flat.

4. **Stay within v0.0.2-alpha.x scope.** Bug fixes + the open follow-ups above. v0.0.3 features are NOT for this session unless the user explicitly redirects.

## Constraints

- 53 specs MUST stay green. Bump the count, don't drop it.
- Don't break the v0.0.2-alpha.6 framework-in-project layout, the v0.0.2-alpha.7 full-HTML page format, or the v0.0.2-alpha.12 right-stack consolidation.
- Push to nola1 + origin after each meaningful commit (see ship recipe).
- The user values short responses, no narrating internal deliberation. Status updates only at key moments.

## Ship recipe (use after each meaningful patch)

```bash
cd /home/numb1/projects/grapestrap
npm run build 2>&1 | tail -3
xvfb-run -a npx playwright test 2>&1 | tail -5      # expect 53 (or more) passed
# ...edit CHANGELOG.md "Unreleased" → new version section
# ...bump package.json version
git add -A && git commit -m "v0.0.2-alpha.X: <message>" -m "..." \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git tag -a v0.0.2-alpha.X -m "..."
git push origin main
git push origin v0.0.2-alpha.X
# Push to nola1 (no git/rsync there). Clean stale dist bundles first
# or you'll accumulate ~18 hashed CSS files per build:
ssh -o StrictHostKeyChecking=no jsmith@192.168.0.192 \
  'cd /home/jsmith/projects/grapestrap && rm -rf dist test-results playwright-report .git'
tar c --exclude=node_modules --exclude=test-results --exclude=playwright-report . \
  | ssh jsmith@192.168.0.192 "cd /home/jsmith/projects/grapestrap && tar x"
ssh jsmith@192.168.0.192 \
  'cd /home/jsmith/projects/grapestrap && grep version package.json | head -1'
```

Note: nola1 has no `git` CLI installed. Verify state with `cat .git/refs/heads/main` and `cat .git/refs/tags/v0.0.2-alpha.X` over SSH.

## Useful greps

- Layout config + `requestFullRelayout()`: `src/renderer/layout/golden-layout-config.js`
- Panel hide/show + size redistribute: `src/renderer/layout/panel-visibility.js`
- Toggle wiring + body classes: `src/renderer/panels/view-toggles.js`
- CSS hide rules + splitter hairline: `src/renderer/styles/golden-layout-overrides.css`
- Panel host CSS (the do-not-absolute rule): `src/renderer/styles/panels.css` + `dom-tree.css` + `asset-manager.css` + `library-items.css`
- Linux menu-bar lock: `src/main/main.js` (`createMainWindow`)
- Custom CSS panel + globalCSS write: `src/renderer/panels/custom-css/index.js`
- Properties panel (the source-of-truth-sync work): `src/renderer/panels/properties-side/index.js` + `src/renderer/panels/style-manager/`
- Monaco RO + relayout: `src/renderer/editor/monaco-init.js`
