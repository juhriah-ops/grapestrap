# Changelog

All notable changes to GrapeStrap will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [SemVer](https://semver.org/).

## [Unreleased]

Working toward `v0.1.0`. See `GRAPESTRAP_BUILD_PLAN_v4.md` § Phase 3 for the next milestone (master templates, Linux polish, public launch).

## [v0.0.2-alpha.4] — 2026-05-04 (patch)

Three bugs reported by user during real-project testing on nola1.

### Fixed
- **Code-view save dropped Monaco edits.** Two compounding causes: (1) `flushActiveTabIntoProject` always read `getCanvasHtml()`, so Monaco text typed in Code view was never the source of truth on save; (2) `pageState.setViewMode` mutated `tab.viewMode` BEFORE emitting `viewmode:changed`, so the canvas-panel listener received `prev === next` and never called `rebuildCanvasFromCode` on a code → design switch. Fix: emit `prev` separately in the event payload, and rebuild canvas-from-code at flush time when the active tab is in code or split view. Save now persists Monaco edits without requiring a switch back to design first.
- **Insert-panel drag pasted block id as text instead of inserting the component.** Two causes: (1) dragstart was setting `text/plain` on the dataTransfer, which is what the browser's default drop action paste-targets when our handler doesn't claim the event; (2) the custom MIME `application/x-grapestrap-block` doesn't reliably cross the parent-doc → iframe boundary in Electron. Fix: stop setting `text/plain`, stash the in-flight block id on `window.__gstrapDragBlockId` (same-origin file:// makes it readable from the iframe via `window.parent`), and have the iframe drop handler fall back to the global when the dataTransfer types are missing the custom MIME. Drop also `stopPropagation()` so a contentEditable target can't steal the event after we claim it.
- **Images disappear when canvas panel is maximized to fullscreen.** GL re-parents the canvas DOM on stack maximize/restore, which reloads the iframe in Electron. Our `canvas:frame:load` handler re-injects `<base href>` + `<style data-grapestrap-globalcss>` on each load, but image src resolution had already raced ahead — when `<base>` finally landed, the relative `assets/images/...` paths had already failed against `about:blank`. Fix: when `syncBaseHrefIntoCanvas` creates the `<base>` tag or changes its `href`, walk every `<img>` with a relative src and reassign `src` to force a re-fetch under the now-correct base. Also wired GL's `stateChanged` event to a `canvas:gl-state-changed` resync signal so the path covers maximize/restore independent of whether GrapesJS sees a frame:load.

### Tests
45 → 48 specs green. New regression specs cover all three fixes (code-view save, insert-panel drag, base-href image refetch).

## [v0.0.2-alpha.3] — 2026-05-04 (patch)

Twelve-commit batch covering features the user reported during real static-site testing on nola1, plus an audit pass that surfaced latent bugs in dirty-state tracking + silent error paths.

### Added
- **Asset Manager: drag-and-drop multi-file upload.** Drop OS files onto the panel (or a specific section) and every file is routed to the right kind via extension. Reads via `File.arrayBuffer()` + writes through new `file:write-asset-buffer` IPC; main-side `writeFile` now detects `Buffer` / `Uint8Array` and writes raw bytes. Visual: dashed-accent outline on dragover.
- **Style Manager → Background image picker.** New "Image" row in the Background sub-panel: pick from `assets/images/` thumbnails, click → writes `<selector> { background-image: url(...); background-size: cover; background-position: center; background-repeat: no-repeat }` to project globalCSS. Same selector resolution as the pseudo-class editor (first non-BS class or id). Per-rule sub-controls (size / position / repeat) appear once an image is set. New `readBareRule()` helper for bare-state rule reads.
- **Style Manager → Columns sub-panel.** Activates when the selected component has the `.row` class. Breakpoint strip (xs/sm/md/lg/xl/xxl), quick splits (12, 6/6, 4/4/4, 3×4, 8/4, 4/8, 3/9, 9/3, 5/7, 7/5, 2/8/2), per-column dropdown (fill/auto/1..12), `+ Add Column` and × remove. `applyGroup` + `colPattern(bp)` so per-breakpoint edits stack without clobbering each other.
- **Breakpoint slider strip above canvas.** Width readout + active-BP label, native range slider (320..1920 px), snap buttons (375/576/768/992/1200/1400 + 100%). Drag = direct iframe inline-style width; iframe letterboxes inside the canvas pane (matches DW mobile preview). Second row: per-component `Hide at <bp>` / `Show at <bp>` toggles that auto-evict competing display classes for the active breakpoint.
- **File → Page Properties dialog.** Three tabs: General (title / description), Favicon (project-wide picker over `assets/images/.{ico,png,svg,webp}`, plus per-page override), Meta (custom `<meta name=… content=…>` rows). `wrapPageHtml` export emits `<title>`, `<meta name=description>`, custom meta tags, `<link rel=icon>` (with type sniffed from extension), bootstrap CSS + project style.css, custom links, then `<script>` bundle + custom scripts.
- **Custom CSS live preview.** Editor change emits `project:css-changed` (250ms debounced) so the canvas iframe `<style data-grapestrap-globalcss>` mirror reflects edits within ~quarter-second. No manual save required.
- **Toolbar ↻ Refresh action.** Belt-and-suspenders save + canvas resync: flush active tab → save → clear all dirty flags → emit `project:css-changed` / `assets:changed` / `library:changed` / `editor.refresh()`. Use when external file changes need to be picked up.
- **Wired all View → Toggle commands.** New `panels/view-toggles.js` centralises the toggle handlers. Fixed strips toggle `[hidden]`; GL-managed panels toggle a body class that hides the matching `.lm_item` via `:has()` + display:none. Persistence to `prefs.view`. Three new menu items so all toggles are discoverable: Linked Files / Breakpoint Slider / Custom CSS.
- **Help → About + Help → Shortcuts now functional** (audit fix). About toasts version + repo link; Shortcuts opens the Preferences dialog (Shortcuts is its default tab). Both menu items used to emit events nothing listened to.

### Changed
- **Export bundles BOTH minified and un-minified Bootstrap.** Matches Dreamweaver: `bootstrap.css` + `.css.map` + `bootstrap.min.css` + `.css.map` + `bootstrap.bundle.js` + `.js.map` + `bootstrap.bundle.min.js` + `.js.map` (8 files). Wrapper HTML defaults to linking the un-minified for browser-devtools quality.
- **Project state gains `dirtySnippets` set + `manifestDirty` flag** (audit fix). `markSnippetsDirty(id)` / `markManifestDirty()` wired in `snippets/index.js`, `library-items/cmdDelete`, and `page-properties`. Without these, `isDirty()` lied after a snippet add/delete or a project-favicon edit — future close-warn would have lost data.
- **Tests isolate XDG dirs per launch.** `XDG_CONFIG_HOME / CACHE / DATA / STATE` set to a fresh tmpdir in `launch()` so prefs don't leak between tests. Required after view-toggle prefs from prior dev runs were silently hiding the Properties panel and breaking ~6 downstream specs.
- **GL panel hide via `:has()` direct-child path.** First `:has()` attempt collapsed the entire column tree (every ancestor `.lm_item` matched the descendant selector). Constrain to the GL v2 path `> .lm_items > .lm_item_container > .lm_content.<host>` so only the leaf collapses.

### Fixed
- **Plugin compatibility regression after v0.0.2 version bump.** Plugin manifests declared `grapestrapVersion: "^0.0.1"` which under semver caret means `>=0.0.1 <0.0.2`. Widened to `>=0.0.1 <0.1.0` across all 5 bundled plugins. Without the fix, every plugin failed discovery and the renderer found zero plugins.
- **DOM tree / Properties / Library / Project panel scrolling.** Hosts had `height: 100%; overflow: auto` but lost the specificity tie with GL's `.lm_content { position: relative; overflow: hidden }`. Switched to `position: absolute !important; inset: 0 !important; overflow-y: auto !important`.
- **Importer dropping `<head>` `<link>`/`<script>`/`<style>`.** Imported pages rendered without their CSS. Now hoists every stylesheet/script/style from `<head>` into body content as first children — browsers still apply them. Lossy for true head-only metadata; full round-trip in v0.0.3.
- **Importer dropping `/css/` and `/js/` subdirs.** Walk had no fallback for non-asset, non-pages subdirs. Added preservation under `site/<srcRel>/<name>`.
- **Export silently swallowing bootstrap copy errors** + **assets folder copy errors** (audit fix). Replaced `try {…} catch {}` with proper error propagation. Missing source dir is tolerated (project with no assets); other failures throw a clear path-of-action error.
- **`file:list-assets` IPC silent-fail on EIO/perms** (audit fix). ENOENT (no asset dir yet) still tolerated; other errors now log so a real failure isn't indistinguishable from "empty asset folder."
- **Preferences shortcut-rebind silent-fail on prefs persist** (audit fix). Now toasts on persist failure instead of just keeping the in-memory value.
- **Images break post-resize** (defensive). Re-sync `<base href>` + `<style data-grapestrap-globalcss>` into canvas iframe head on `canvas:content-changed` (rAF-coalesced) — covers the case where GrapesJS rebuilds the head on content reload.
- **GL panel toggle leaving outline + box visible.** Was hiding `.lm_content` only; now hides the `.lm_item` wrapper via `:has()` so the splitter slot collapses with it.
- **`linked-files:open-globalcss` now actually focuses the Custom CSS panel** (audit fix). Was emitting an event nothing listened to + a toast that lied about opening the panel.

## [v0.0.2-alpha.2] — 2026-05-04 (patch — breaking layout change)

### Changed (BREAKING)
- **Project disk layout reshaped** so each project is one self-contained folder. Old:
  ```
  /somewhere/<name>.gstrap   (manifest, side-by-side with content)
  /somewhere/pages/...
  /somewhere/assets/...
  /somewhere/style.css
  ```
  New:
  ```
  /somewhere/<name>/<name>.gstrap   (manifest at root of the project folder)
  /somewhere/<name>/site/           (deployable web content — rsync this)
    ├─ pages/<name>.html
    ├─ assets/{images,fonts,videos}/
    ├─ library/<id>.html
    ├─ templates/<name>.html
    └─ style.css
  ```
  Manifest *paths* are unchanged — they still read like `pages/index.html`, relative-to-`site/`. Only the disk layout shifted.
- **New Project / Import Folder dialogs now ask for a *parent* folder**, not a save-as path. We create `<parent>/<slug>/<slug>.gstrap` + `<parent>/<slug>/site/` inside. Refuses if `<slug>/` already exists and isn't empty.
- **Save-As** also picks a parent folder; the saved-into folder gets named after the project's slug.
- **Old-layout projects (v0.0.1 / v0.0.2-alpha.0 / .alpha.1) refuse to load** with a clear error message: "Old project layout detected (pages/ at project root). As of v0.0.2-alpha.2 web content lives in <project>/site/. Recreate the project or move pages/ + assets/ + style.css into a site/ subdirectory." No silent ENOENTs mid-readFile. Migration helper deferred — projects from this hour should be recreated.
- Asset Manager `<base href>` now points at `<projectDir>/site/`. File-listing IPC reads from `site/assets/<kind>/`. Asset import targets `site/assets/<kind>/`.
- Export still flat-copies HTML/CSS/JS to the chosen output dir, but sources `assets/` from `site/assets/` rather than `<projectDir>/assets/`.

### Added
- New regression spec `'Project layout: .gstrap at root + site/ subdir for deployable web content'` exercises both the new layout AND the old-layout rejection guard. 33 → 34 specs green.

### Why
User feedback on nola1: "what if when we create a project we create a directory that we drop our files in?" Cleaner mental model — one project equals one folder, the `site/` tree IS the deployable static site (no extra build step), nothing collides if you put two projects under the same parent. Worth a breaking change while no real production projects exist yet.

## [v0.0.2-alpha.1] — 2026-05-04 (patch)

### Added
- **Asset Manager panel** (`panels/asset-manager/`). Third tab in the left-column GL stack alongside Project + Library. Three sections — Images / Fonts / Videos — each listing files in `assets/<kind>/` with per-section "+ Add" file-picker (filtered by kind) that copies into the project tree. Image tiles render thumbnails via `file://<projectDir>/assets/images/<name>` URLs; clicking an image tile inserts `<img src="assets/images/<name>" class="img-fluid">` at the canvas selection (anchor-aware placement). Per-tile × delete unlinks. Watcher-driven refresh so dropping a file into `assets/` from outside the app surfaces it without restart.
- **Live image preview via `<base href>`**. The canvas iframe now carries a `<base href="file://<projectDir>/" data-grapestrap-base>` injected at `canvas:frame:load` and refreshed on `project:opened` / `project:closed`. Relative `assets/images/...` paths in saved HTML resolve at preview time without the renderer rewriting `src` attributes. The base never lands on disk — `editor.getHtml()` is body-only.
- **File → Import Folder…**. New menu item + `cmdImportFolder` + `project:import-directory` IPC. Pick a source directory, pick a target `.gstrap` manifest path, and the importer copies the source tree into a new project: top-level / `pages/` HTML files become `pages/<name>.html` (with `<body>` extraction + title/description capture into `page.head` for full-document inputs); `assets/` tree preserved verbatim; loose top-level images / fonts / videos are routed into `assets/<kind>/`; top-level `style.css` becomes the project's globalCSS. Originals are NEVER modified — import = copy.
- Two new Playwright specs: Asset Manager click-insert end-to-end with `<base href>` verification; Import Folder scan-and-open with a representative source dir (full-document index.html + body-only about.html + assets/images/foo.png + style.css). 31 → 33 specs green.

### Fixed (carried from 2026-05-04 follow-up after v0.0.2-alpha.0 cut)
- **Plugin compatibility regression after the v0.0.2 version bump.** All five bundled plugin manifests declared `grapestrapVersion: "^0.0.1"`, which under semver's caret rule for 0.0.x means `>=0.0.1 <0.0.2` — the version bump made every plugin fail the discovery filter and the renderer found zero plugins. Widened to `>=0.0.1 <0.1.0` (forward-compat across the v0.0.x and v0.1.x lines). Reported on nola1; broke 8 specs that had been passing.
- **DOM tree / Properties / Library / Project panels couldn't scroll past the viewport.** Hosts were `height: 100%; overflow: auto` but Golden Layout's `.lm_content` parent had no explicit height in CSS (only `position: relative`), so `height: 100%` resolved to whatever the children stacked to. Changed each host to `position: absolute; inset: 0` inside the `lm_content` parent — `overflow-y: auto` now has a definite area. Reported on nola1 alongside the plugin regression.

## [v0.0.2-alpha] — 2026-05-04

Phase 2 of the v4 build plan: Multi-Page editing primitives + Dreamweaver-parity tools + Style Manager polish. Closes the v0.0.1 walking-skeleton gaps and lights up every Phase 2 must-ship feature.

### Added (2026-05-04 — v0.0.2 keyboard rebinding UI)
- Preferences dialog with a **Shortcuts** tab. Lists every default binding (action label + current combo + Edit / Reset). Click Edit on a row → row enters capture state ("Press a combo… (Esc cancels)") → next non-modifier keydown becomes the new binding.
- New `src/renderer/shortcuts/default-bindings.js` — single source of truth for the default map. `resolveBindings(overrides)` overlays `prefs.shortcuts`: `{ key, ctrl, shift, alt }` replaces the default; `null` disables it; missing keeps it.
- `keybindings.js` reads `prefs.shortcuts` at boot and listens for `shortcuts:user-changed` so dialog edits take effect without a restart.
- Conflict detection: if the new combo matches another command's binding, the row tints red and shows the colliding command id inline. Non-blocking by design — the user resolves it.
- Per-row Reset clears that command's override; "Reset all" wipes the whole prefs.shortcuts subtree.
- General / Editor / Plugins tabs are scaffolded stubs that point users at `$XDG_CONFIG_HOME/GrapeStrap/preferences.json` for v0.0.2; full UIs land in v0.0.3.
- New Playwright spec drives the full rebind round-trip: open Preferences, edit Save, capture Ctrl+Shift+P, verify the combo updates AND `prefs.shortcuts['file:save']` persists AND pressing the new combo fires `file:save` on the event bus, then Reset reverts.

### Added (2026-05-04 — v0.0.2 Snippets tab)
- New Snippets tab in the Insert panel. Snippets are reusable HTML fragments that drop a **free copy** on insert (compare to Library Items, which drop a linked instance — see below).
- Two sources combined in the tab: project snippets (`projectState.current.snippets[]`, persisted inline in the project manifest) + plugin snippets (`pluginRegistry.snippets[]`, registered via the existing `api.registerSnippet({ id, label, content })` plugin hook — already in the API surface but had no UI consumer until now).
- "+ From Selection" tile captures the currently-selected component as a project snippet (prompts for a name).
- Project snippets get a per-tile × delete button on hover. Plugin snippets are read-only.
- Snippet tiles use `snippet:source:rawId` ids to avoid colliding with plugin block ids; `blockContent()` in the Insert panel resolves through the snippets module for that prefix. Click-to-insert + drag-and-drop + anchor-aware placement + flash all share the existing path.
- Project manager (main): manifests now carry `snippets: []` inline (no per-snippet file on disk for v0.0.2 — they're typically tiny).
- New spec covers capture from selection → tile appears → click inserts a free copy without library-wrapper → delete via ×.

### Added (2026-05-04 — v0.0.2 Linked Files bar)
- Strip above the canvas (below page tabs) listing CSS/JS the active page's `<head>` references — `<link rel=stylesheet>` and `<script src>` as chips with a kind badge (CSS blue, JS amber).
- Click semantics: href matching the project's globalCSS file emits `linked-files:open-globalcss` so the Custom CSS panel can focus itself, plus an info toast. Any other href toasts "External resource: <href>" — for v0.0.2 we don't open arbitrary asset paths in tabs.
- Visibility: hidden when no project / no active tab; hidden when the active tab is a library item (libraries are bare fragments without head links); toggleable via `view:toggle-linked-files` event.
- The `shell.css` strip CSS already had grid area + dimensions in place from v0.0.1 (it was a hidden slot); this release adds the renderer that emits chips into it. Parsing is DOMParser-based and runs on `canvas:content-changed` (rAF-coalesced) plus tab focus events.
- Spec covers chip render with both kinds, project-css click emits open-globalcss event, library tab hides bar, toggle hides on demand.

### Added (2026-05-04 — v0.0.2 Library Items)
- Dreamweaver-style **linked snippets**. A library item is a named HTML fragment stored on the project; page instances of the item are wrapped:
  ```html
  <div data-grpstr-library="<id>" data-grpstr-library-name="<name>">…</div>
  ```
  Editing the item propagates the new inner HTML into every wrapper across every page. One edit, every instance updates.
- New Library panel in a Golden Layout stack tab next to "Project" in the left column. Lists items, "+ New" creates an empty item and opens it in a tab, "+ From Selection" wraps the canvas selection into a new item (and replaces the original with a wrapped instance). Per-row mini-buttons handle Insert / Edit / Rename / Delete.
- `pageState.tabs` gain a `kind: 'page' | 'library'` field plus a display label. The canvas panel branches on kind to load page html vs library item html. The save flush in `menu-router` does the same, so Ctrl+S on a library tab writes back to the item.
- **Tab swap-out IS the propagation moment**: when the user leaves a library tab, `propagateLibraryItem` walks every page in `projectState`, parses the html, replaces the inner of all `[data-grpstr-library="<id>"]` wrappers, and marks each touched page dirty. Save on a library tab does the same flush + propagate in one step. DOMParser-based, not regex — survives attribute-order quirks.
- **Lock**: descendants of any wrapper component get `selectable / editable / removable / draggable / copyable / hoverable = false` via `component:add` and on `canvas:frame:load`. The wrapper itself stays selectable so a future Detach UI can lift contents out.
- Tab strip shows a small "lib" accent badge on library tabs.
- Delete-with-instances guard: deleting an item that's still instanced on a page toasts a warning instead of orphan-emptying every wrapper. User has to clean instances first.
- Spec covers create-from-selection, insert, lock check, edit-in-tab + propagation across both instances on the page.

### Added (2026-05-04 — v0.0.2 Color picker w/ EyeDropper)
- Singleton popover anchored to a trigger button. Replaces the bare `<input type="color">` in the pseudo-class state editor. Surface:
  - BS5 theme palette (primary/secondary/success/danger/warning/info/light/dark + body/black/white/transparent), one row of swatches.
  - Recent colors (last 12, in-memory; cleared on `project:closed`).
  - hex / rgb() / `var(--bs-…)` text input — Enter commits, live-updates the preview swatch as you type.
  - Native **EyeDropper** button (Chromium 95+, present in Electron) — samples a pixel from anywhere on the desktop and commits as hex.
  - Clear button — passes empty string up.
- Click outside, Esc, or picking a swatch dismisses. Anchor positioning flips above the trigger when the viewport doesn't fit below.
- Pseudo-class editor color rows use the picker; `EyeDropper` presence is feature-detected — picker hides the button on platforms without it.

### Added (2026-05-04 — v0.0.2 Style Manager chunk C: pseudo-class state bar + Cascade view)
- **Pseudo-class state bar** at top of Style Manager: `[ Normal ] [ :hover ] [ :focus ] [ :active ] [ :disabled ]`. Selecting a non-Normal state scopes a CSS rule into the project's `style.css` for the active state. Selector resolution: first non-Bootstrap class on the component, then id. Element with no usable selector toasts a warning and stays in Normal.
- New **Pseudo-class Styles** sub-panel — property editor for the active state with bg/text/border color, opacity, transform, box-shadow, cursor, text-decoration. Clear button removes the rule.
- New **Cascade** sub-panel — walks `iframe.contentDocument.styleSheets`, lists matching rules grouped by origin (inline / project / Bootstrap), with strikethrough on overridden properties. Tier ordering inline > project > bootstrap; "winning" rule per property = last write within highest tier (no real specificity computation — that's a v0.0.3 enhancement).
- New `css-rule-utils.js` — selector picker (first non-BS class, then id) + read/write/remove rule helpers using per-rule regex (no AST, byte-stable for unrelated rules in `style.css`).
- `grapesjs-init.js` mirrors `projectState.current.globalCSS` into a `<style data-grapestrap-globalcss>` tag inside the canvas iframe so live preview reflects pseudo rules and Cascade can read them. Mirror updated via `eventBus.on('project:css-changed')`.

### Fixed (2026-05-04 — split-view pane overlap, reported on nola1)
- In Split mode, the canvas iframe was painted on top of the Monaco code pane (line numbers visible behind the canvas) because both `.gstrap-canvas-design` and `.gstrap-canvas-code` are `position: absolute; inset: 0;` — correct for single-pane modes where one is hidden, but stacked in Split where both render in flow.
- The `.is-split` CSS hook was already toggled by `applyViewMode` but never had matching CSS — flagged in a prior in-code comment and never landed. Fix flips the host into a flex row when `.is-split` is set, switches the two child panes to `position: relative` + `flex: 1 1 50%`, and adds a 1px `border-left` separator on the code pane.
- GrapesJS canvas refresh is now also called on every viewmode transition (was code/split only) — the iframe rulers and selection overlays were drawing at the old width when the design pane shrank to 50% on the way into split mode and grew back on the way out, because the host stayed the same size and `installCanvasResizeWatcher` only fires on host changes.

### Added (2026-05-03 — v0.0.2 Style Manager, chunk A)
- New `src/renderer/panels/style-manager/` module replaces the v0.0.1 placeholder Properties→Style section. Class-first BS5 utility picker — every selection writes a real `class="…"`; nothing goes through inline `style`.
- `bs-classes.js` is the single source of truth for the BS5 utility enumerations + match patterns (so the chip list, autocomplete, and Cascade view in chunks B/C all read the same lists).
- `class-utils.js` provides `applyGroup` / `readGroup` / `toggleClass` — every sub-panel routes through these so "select one of N from this group" deterministically strips prior selections via the group's regex before adding the new one.
- Three sub-panels in chunk A:
  - **Spacing** — margin / padding, per-side (`All / Top / End / Bottom / Start / X / Y`), scale `0..5 + auto + n1..n5` (margin-only). Click an active scale a second time to clear it.
  - **Display** — display value (`none / inline / block / flex / grid / table` + variants) + visibility, with the per-breakpoint `xs sm md lg xl xxl` strip at the top. Per-breakpoint variants stack: `d-flex` + `d-md-block` coexist on the same component.
  - **Text** — alignment, weight, style/decoration/transform, size (`fs-1..6`), color (BS5 theme tokens with swatches).
- Accordion shell (`index.js`) renders one section per sub-panel; default-open set is `['spacing']`. Open/closed state is per-app-session, not persisted yet.
- New stylesheet `src/renderer/styles/style-manager.css` introduces the shared primitives (`gstrap-sm-section / -toggle / -body / -segs / -seg / -scales / -scale / -grid / -pill / -swatch / -clear`) so chunks B/C compose without inventing new classes.
- `editor.on('component:update:classes')` in `grapesjs-init.js` now re-broadcasts as `canvas:component-class-changed` on the eventBus so the Properties chip list and the Style Manager stay in lockstep when classes change from any source (Style Manager, chip-list edit, Quick Tag, plugin command, undo).
- New Playwright spec `'Style Manager: Spacing/Display/Text panels write BS classes and round-trip'`: drives the right panel through Spacing → Display (with breakpoint switch) → Text and asserts both the component's class set AND the Properties chip list reflect every change. Also covers click-toggles-off, mutually-exclusive group eviction (writing `fw-semibold` evicts the seed h1's `fw-bold`), and chip-removal refreshing the Style Manager's "Active" highlights.
- All 21 specs green in ~60 s.

### Added (2026-05-03 — v0.0.2 Style Manager, chunk B)
- Four remaining BS5-aware sub-panels: **Flex**, **Background**, **Border**, **Sizing**. The right Properties panel now exposes all seven sub-panels promised by Build Plan v4 §"Style Manager Replacement Specification".
- `flex.js` is gated on the component having any `d-flex` / `d-inline-flex` / `d-<bp>-flex` variant. When none is present, the body shows a hint with a one-click "Set display: flex" shortcut so the user discovers the prerequisite without bouncing to the Display panel. Once enabled: direction, wrap, justify-content, align-items, align-content, gap.
- `background.js`: theme color swatches (BS5.3 token palette + `bg-body-secondary` / `bg-body-tertiary` / `bg-transparent`), the eight `*-subtle` variants (mutually exclusive with the bare color), and a `bg-gradient` toggle.
- `border.js`: per-side toggles (All / Top / End / Bottom / Start — `border` and `border-top` etc. are independent and can coexist by design), width 1–5, theme color swatch, radius (`rounded` / `rounded-0..5` / `rounded-circle` / `rounded-pill`), shadow (`shadow-none/sm/<bare>/lg`).
- `sizing.js`: width and height rows (`25 / 50 / 75 / 100 / auto`, mutually exclusive within their group), plus independent toggles for `mw-100`, `mh-100`, `vw-100`, `vh-100`.
- New `gstrap-sm-hint` style for the Flex empty-state — small inline card pattern reusable by future panels with prerequisites.
- New Playwright spec `'Style Manager: Flex/Background/Border/Sizing panels write BS classes'`: drives all four panels end-to-end, including the Flex prerequisite hint flow, mutually-exclusive eviction across groups (subtle evicts solid bg-color; switching width 3→5; switching w-50→w-75 leaves `vh-100` alone), and the `border` + `border-top` coexistence rule.
- All 22 specs green in ~65 s.

### Added (2026-05-02 — HTML pretty-printer)
- New `src/renderer/editor/format-html.js` — small (~150 line, no deps) tokenizer-and-tree-rendering HTML formatter. Handles: block vs inline element distinction, single-line rendering of inline-only parents that fit ≤100 chars, void elements (`<br>`, `<img>`, `<hr>`, …) on their own lines in block context, verbatim pass-through of `<pre>`/`<script>`/`<style>`/`<textarea>`/`<code>` (whose interior whitespace is significant), HTML comments and doctypes preserved.
- Wired into `editor/grapesjs-init.js`'s `getCanvasHtml()` so every consumer (project save, tab-swap capture, code-view sync, flat export) gets the same pretty-printed output. GrapesJS's raw `editor.getHtml()` is one long line — formatting once at the boundary keeps the disk + display + export in sync without touching call sites. New `getCanvasHtmlRaw()` is the explicit escape hatch (currently unused).
- Wired into `editor/canvas-sync.js`'s `syncCanvasToCode` so Monaco's Code view shows the formatted form, not the one-liner.
- **Regression spec** `'Code view shows pretty-printed HTML, not the GrapesJS one-liner'` opens a seed project, appends a nested `<section><div><h2><p><a>…</a></p></div></section>`, switches to Code view, and asserts the Monaco editor's value contains newlines AND matches `/<section[^>]*>\s*\n\s+<div/` (proves indentation depth is increasing). Note: Monaco reports `language: 'plaintext'` when its HTML worker doesn't initialise — separate v0.0.2 concern; this spec doesn't depend on the language tag.
- All 10 specs green in 25.1 s.

### Fixed (2026-05-02 — Insert panel tiles did nothing)
- **Root cause:** the Insert panel tiles in `src/renderer/panels/insert/index.js` rendered with `draggable="true"` but had **no click or dragstart handler**. The file's old comment claimed GrapesJS BlockManager handled drag-to-canvas — that's only true if you're using the BlockManager's *own* DOM, which we replaced with a custom tabbed UI.
- **Fix:** added a `click` handler that resolves the block content from `pluginRegistry.blocks` (with a fallback to GrapesJS's `BlockManager.get(id).get('content')`) and inserts it. Insertion target rule: if a component is selected, insert as a sibling immediately after it; otherwise append to the page wrapper. The new component is selected so the user sees feedback and can keep editing. `dragstart` also now sets `application/x-grapestrap-block` drag data so the v0.0.2 iframe drop target can pick it up — no-op today.
- **Regression spec** `'Insert panel: clicking a tile inserts the block into the canvas'`: opens a seed project, clicks the first tile in the active tab, asserts the wrapper's component count grew and a component is selected. All 9 specs green in 23.1 s.

### Fixed (2026-05-02 — File→New / File→New Page silently did nothing)
- **Root cause:** `cmdNewProject` and `cmdNewPage` in `src/renderer/shortcuts/menu-router.js` called `window.prompt()`, which throws in modern Electron (`"prompt() is and will not be supported."`). The throw propagated up into `eventBus.emit('command', …)`'s try/catch, which silently swallows handler exceptions — so clicking File→New / Open in the toolbar produced zero feedback.
- **Fix:**
  - New `src/renderer/dialogs/text-prompt.js` — `showTextPrompt({ title, label, initialValue, placeholder, okLabel })` returns `Promise<string | null>`. In-renderer dialog, no Electron blocked APIs. Used by both `cmdNewProject` and `cmdNewPage`. Styling lives in `styles/modals.css`.
  - `handleCommand` now wraps `dispatchCommand` in its own try/catch — silent failures from any future command handler are caught and surfaced as an error toast (`{ type: 'error', message: '<action>: <message>' }`). The eventBus's wrapper still catches as a backstop, but the new outer layer always logs and toasts.
  - Native dialogs (`pickNewProjectPath`, `pickOpenProjectPath`, `pickExportDir` in `src/main/ipc-handlers.js`) now pass the focused `BrowserWindow` as parent so they can't render parentless / off-screen on Linux/Wayland compositors.
- **Regression spec:** `'File menu: cmdNewProject path does not throw on the prompt step'` — emits `file:new-project`, asserts the prompt dialog appears with the right title, clicks Cancel, and asserts no error toast is fired. Also asserts the test waits for `eventBus.listenerCount('command') > 0` first — boot() is async, so the smoke test base `launch()` (which only waits for `window.__gstrap` to be defined) can otherwise emit before listeners subscribe. All 8 specs green in 23.4 s.

### Added (2026-05-02 — right-click context menu)
- Generic floating context-menu component in `src/renderer/dialogs/context-menu.js`. `showContextMenu(x, y, items[])` returns a Promise that resolves with the activated action's return value (or undefined on dismiss). Items: `{ label, accelerator?, action, disabled?, danger?, separator? }`. Auto-positions away from viewport edges; ↑↓ Enter Esc keyboard nav; outside-click + window blur dismiss. New `styles/context-menu.css`.
- Shared per-component action helpers in `src/renderer/shortcuts/component-actions.js`: `duplicateComponent`, `deleteComponent`, `copyComponentHtml`, `editComponentTag`, `wrapComponentInTag`, plus `buildComponentMenuItems(component)` returning the canonical menu definition. Single source of truth — keyboard accelerators in the menu match `menu-router.js` so the right-click and keyboard paths can't drift apart.
- `contextmenu` handler on the GrapesJS canvas iframe (in `editor/grapesjs-init.js`): listens on `frame.contentDocument`, synthesises a `mousedown` so GrapesJS runs its own selection logic, then emits `canvas:context-menu` with viewport-translated coords + the selected component.
- `contextmenu` handler on DOM tree rows (in `panels/dom-tree/index.js`): same `canvas:context-menu` event, so both surfaces use one open path.
- One central listener in `main.js` opens the menu via `showContextMenu(x, y, buildComponentMenuItems(component))`. Registered BEFORE `showWelcomeIfFirstRun()` so it isn't silently broken until the first-run dialog is dismissed.
- Wired real handlers for `edit:duplicate` / `edit:delete` in `menu-router.js` (previously emitted no-op events). Selection-required, with toast warnings if nothing is selected or the page root is targeted.
- New Playwright spec `'Right-click on DOM tree row opens context menu; Duplicate adds a sibling; Delete removes'` exercises the full loop: right-click → menu visible with the expected 5 items → click Duplicate → component count rises → right-click → click Delete → count returns to baseline. All 7 specs green in 19.5 s.

### Fixed (2026-05-02 — GL host collapsed to 0px on launch; "canvas drift" was a misdiagnosis)
- **Actual root cause:** the seven shell chrome regions in `src/renderer/index.html` (toolbar, tabs, linked-files, main, insert, strip, status) were positioned by CSS-grid auto-placement against `grid-template-rows: var(--toolbar-h) var(--tabs-h) auto 1fr auto auto auto`. `.gstrap-linkedfiles` is `hidden` by default (no project loaded) and resolves to `display: none`, which **removes the element from the grid entirely** — not just its visual size. Auto-placement then shifted every subsequent child UP one row: `#gstrap-main` landed in the auto row originally meant for linked-files (intrinsic content size = 0, so the row collapsed to 0 px), `#gstrap-insert` took the 1fr row that was meant for GL, and so on. Result: GL rendered into a 0-px-tall host (panes invisible) while the insert panel's 89 px of tiles sat at the top of a 622 px row of empty `--bg-2` background. The "canvas drifts downward on resize" symptom in memory was a misread — the canvas was **never** being given any vertical space; what the user saw on each resize was the insert panel re-stretching its empty row, not the canvas growing.
- **Fix (`src/renderer/styles/shell.css`):** named `grid-template-areas` (`toolbar / tabs / linked / main / insert / strip / status`) with each chrome class pinned via `grid-area: <name>`. Named areas pin elements to their slot regardless of which siblings are `display: none`, so hiding linked-files no longer slides everything else up. Also kept `minmax(0, 1fr)` on the GL row (prevents intrinsic content from inflating it) and `overflow: hidden` on `.gstrap-shell`.
- **Verified:** new regression spec `'canvas pane does not drift on alternating window resize'` flips the viewport across six sizes and asserts (a) `gstrap-main.clientHeight > 100` (rules out the collapse), and (b) the height returns exactly to baseline when the viewport returns to baseline. All 6 specs green in 18.9 s.
- **Layout-driver consolidation (also shipped, defense-in-depth):** even though it wasn't the root cause, the renderer previously had three competing layout drivers — the host `ResizeObserver` with a 1 px gate (`3ae4b57`), an unguarded `window.addEventListener('resize')` that called `updateSize()` without the gate, and Monaco's `automaticLayout: true` (an internal RO per Monaco instance × 3 instances). Now: one host RO with an integer `clientWidth/clientHeight` gate fans out to `layout.updateSize()` → `relayoutAllMonaco()` → `getEditor()?.refresh()`. The window listener is gone (the host RO catches window resize for free). Monaco `automaticLayout` is off in `monaco-init.js` and `panels/custom-css/index.js`; each editor is registered via `registerForRelayout(editor)` which installs a per-container rAF-coalesced integer-gated RO so GL splitter drags re-lay-out it. The canvas panel installs the same RO on `.gstrap-canvas-host` to call `editor.refresh()` on splitter drag.
- **CSS box-sizing scoping:** an initial attempt added a global `*, *::before, *::after { box-sizing: border-box }` reset which broke Golden Layout's vendor pixel arithmetic on nola1 (panels rendered blank). Restricted to only `.gstrap-*` chrome classes; `.lm_*` and the canvas iframe internals keep the page default.

### Added
- Project plan v4 (supersedes v3): rolling v0.x release model, plugin architecture from day 1, locked Code-authoritative-when-active sync policy, Library Items separated from master templates, Linux community commitments (XDG, Wayland, Flatpak/Snap, no telemetry).
- Walking-skeleton scaffold: Electron main + preload + renderer with the locked security posture; Vite + electron-builder build; XDG Base Directory module; Wayland auto-detection; native menus; IPC handlers; project manager (`.gstrap` manifest + sibling page files on disk); chokidar file watcher; plugin loader (bundled + user + project); plugin host runtime + API surface; renderer state (event bus, project state, per-tab page state); GrapesJS canvas init; Monaco init with `file://` worker config; canvas-sync module enforcing Code-authoritative-when-active; Golden Layout with file-manager / canvas / properties / custom-css panes; toolbar; page tabs; Insert panel (6 tabs); Property Inspector strip; status bar; welcome dialog.
- Bundled plugins (each with manifest + entry): `@grapestrap/core-blocks`, `@grapestrap/blocks-bootstrap5`, `@grapestrap/blocks-sections` (12 sections, Gramateria-adapted), `@grapestrap/exporter-flat`, `@grapestrap/lang-en`.
- Documentation: `docs/INSTALL.md`, `docs/CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/PLUGIN-DEVELOPMENT.md`.
- Linux desktop integration: `.desktop` entry, MIME XML for `.gstrap`, packaging README.
- GitHub Actions: `release.yml` (Linux artifacts on tag push), `ci.yml` (lint + build on PR/push).
- Community files: bug report / feature request / plugin submission templates; Code of Conduct (Contributor Covenant 2.1); CREDITS.md.

### Fixed (2026-04-27 — first launch verification)
- `package.json` pinned `grapesjs-blocks-bootstrap5@^1.0.0` (does not exist on npm); bumped to `^0.2.31` so install resolves.
- Main process referenced `dist/preload/preload.js` but `vite-plugin-electron` emits the preload as `preload.mjs` under `"type": "module"`. Pointed `webPreferences.preload` at the real filename. Without this, the renderer reported "FATAL: preload bridge missing".
- CSP on `src/renderer/index.html` blocked `blob:` in `script-src`, so the plugin host's Blob-URL dynamic-import fell over for every bundled plugin (`activated 0 plugin(s)`). Allowed `blob:` in `script-src`.
- GrapesJS pulled `font-awesome` from `cdnjs.cloudflare.com` by default (CSP-blocked). Set `cssIcons: ''` in the editor init since canvas icons ship from bundled `assets/canvas-icons/`.
- `@grapestrap/lang-en` used `import …assert { type: 'json' }` (deprecated) and the relative-import form fails under blob-URL loading anyway. Inlined the message catalog with a comment explaining the v0.0.1 limitation.

### Verified
- `npm install` clean against pinned versions, Electron 31.7.7 downloaded.
- `npm run build` produces all three Electron targets (renderer, main, preload).
- Headless Electron launch (Xvfb): preload bridge attaches, plugin discovery finds 5 / 5 bundled plugins, `activated 5 plugin(s)`, GrapesJS and Monaco both initialize without errors.
- **Playwright smoke test (`tests/e2e/smoke.spec.js`) passes in ~3 s**: create project → open page tab → mutate page html → save → relaunch → reopen → sentinel string survives the round-trip. **M1 gate is green.**

### Added (2026-04-27 — page-tab → canvas plumbing)
- `pageState.open()` now emits `tab:focused` for newly-created tabs (previously only re-opens). Canvas subscribers fire on first open of a project.
- Canvas panel listens for `tab:focused` and swaps content via new `loadHtmlIntoCanvas` / `getCanvasHtml` helpers in `grapesjs-init.js`. Outgoing tab's editor html is captured back into projectState before the swap, so unsaved edits survive tab switches.
- New `canvas:content-changed` event fired on `component:add` / `component:remove` / `component:update` / `style:custom`. Canvas panel uses it to mark the active page dirty on real edits, with a `loadingTabName` guard so the component:add storm during programmatic loads doesn't dirty-flag a page just for being opened.
- `cmdSave` / `cmdSaveAs` / `cmdExport` flush the active tab's canvas html into projectState before calling the IPC, so on-disk state reflects what's on screen.
- Playwright config (`playwright.config.js`) and the M1 smoke test (`tests/e2e/smoke.spec.js`) — drives the same IPC the menu router uses, no native dialogs.
- `__gstrap` window handle exposed unconditionally (was gated on `import.meta.env.PROD`). Containment is the preload-bridge + sandbox + contextIsolation posture, not symbol-hiding.

### Added (2026-04-27 — Property Inspector strip element-aware UI, originally planned for v0.0.2)
- Property strip is now element-aware. Always shows tag, ID input, classes input. Adds: `href` + `target` for `<a>`; `src` + `alt` for `<img>`; an H1–H6 level dropdown for headings (changes the tag in-place via `replaceWith`, preserving children + attributes).
- Inputs commit on `change` / blur, not on every keystroke — fewer canvas-state churns and undo entries.
- New stylesheet `src/renderer/styles/property-strip.css` — monospace inputs, VS-Code-ish colors for the tag pill, focused-accent border.
- Playwright spec verifies the heading-level dropdown actually swaps the tag (h1 → h3).

### Added (2026-04-27 — Quick Tag Editor + Wrap with Tag, originally planned for v0.0.2)
- **Ctrl+T** (Quick Tag Editor): floating input shows the selected element as `<tag attr="…">`. Edit, Enter to apply, Esc / backdrop to cancel. Tag rename + attribute update preserves the element's children. The text-form input matches Dreamweaver's classic UX (faster than a structured form once the muscle memory is there; structured editing already lives in the Properties panel).
- **Ctrl+Shift+W** (Wrap with Tag): same dialog, wraps the selected element's outer HTML in a new tag.
- New parser in `src/renderer/dialogs/quick-tag.js` handles `<h2 class="foo bar" id="hi">` style input — quoted ('"' or `'`) or bare values, valueless attrs, optional self-closing `/`. Tag name lowercased; attributes preserved verbatim.
- New stylesheet `src/renderer/styles/quick-tag.css` — top-centered overlay with a backdrop, monospace input, error flash on parse fail.
- Two new Playwright specs verify both shortcuts: select h1 → Ctrl+T → fill `<h2 class="rebranded">` → Enter → element renames to h2; select h1 → Ctrl+Shift+W → fill `<header class="page-head">` → wrap. All 4 specs (M1 smoke + DOM tree + Quick Tag + Wrap) pass in ~12 s combined.

### Added (2026-04-27 — DOM Tree panel, originally planned for v0.0.2)
- New left-sidebar `DOM` panel mirrors the canvas component tree as an indented list. Click a row to select the component on the canvas; canvas selection highlights the matching tree row. Refresh is coalesced via `queueMicrotask` so a section drop that adds 30 children only repaints once.
- Golden Layout default config gains a fourth column: FILE MGR | DOM TREE | CANVAS | PROPS+CSS.
- New stylesheet `src/renderer/styles/dom-tree.css` — indented monospace rows, hover, selected state, VS-Code-ish color scheme for tags / ids / classes.
- Second Playwright spec verifies the DOM tree's two-way sync: tree contains main/h1/p rows from the seed index page; clicking the h1 row selects the matching component on the canvas; the selection highlights in the tree.
- Drag-to-reorder + right-click context menu (wrap, delete, duplicate, edit tag) deferred to a follow-up commit. Read-only is the v1 scope.

### Architecture (2026-04-27 — plugin protocol scheme, originally planned for v0.0.2)
- Privileged `gstrap-plugin://<uid>/<file>` protocol scheme replaces the Blob-URL plugin loader. Plugins now load as ES modules from a hierarchical URL, so multi-file plugins with relative imports (`./helpers.js`, `./messages.json`, sub-modules) work natively. The previous Blob-URL approach broke any non-trivial plugin layout because blob URLs have no parent directory.
- Scheme registered pre-`app.whenReady` as `standard + secure + supportFetchAPI + codeCache`. Handler attaches post-discovery; reads files from disk via `net.fetch` against `pathToFileURL(target)`, with a path-traversal guard pinning every read to inside the owning plugin's directory.
- Each plugin gets a session-scoped numeric `uid` (`p1`, `p2`, …) that the renderer uses as the URL host. The plugin's name (which can include `@scope/name`) is not URL-safe as a hostname, so the uid indirection sidesteps that.
- CSP `script-src` / `style-src` / `img-src` / `font-src` / `connect-src` now allow `gstrap-plugin:`. `blob:` removed from `script-src` (no longer needed). `worker-src` keeps `blob:` for Monaco workers.
- `@grapestrap/lang-en` reverted to `import messages from './messages.json' with { type: 'json' }` — the proof that relative JSON imports work end-to-end. The v0.0.1 inlined catalog is gone.
- Build plan §"Phase 2 → Plugin System" updated: the protocol-scheme rewrite is shipped, not pending.

### Notes
- v0.0.1 is a walking skeleton. Many menu items are wired but show "not yet wired" toasts; full handlers land in v0.0.2.
- App icon at `assets/icons/icon.png` not yet shipped (tracked separately) — main warns at launch.
