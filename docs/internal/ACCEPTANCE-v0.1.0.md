<!-- =============================================================
PATH: docs/internal/ACCEPTANCE-v0.1.0.md
ROLE: Wave-6 workstation acceptance checklist for v0.1.0-rc.1 —
      manual pass/fail run on nola1 against the CI-built .deb
DEPENDS: GRAPESTRAP_BUILD_PLAN_v5.md (Wave 6 scope), README.md,
         docs/INSTALL.md, CHANGELOG.md [Unreleased] (feature facts)
CREATED: 2026-07-19 (Wave 6.4)
============================================================= -->

# Acceptance Checklist: GrapeStrap v0.1.0-rc.1

| | |
|---|---|
| **Target version** | `v0.1.0-rc.1` (CI-built `.deb` from the draft GitHub release) |
| **Install command** | `sudo apt install ./grapestrap_0.1.0-rc.1_amd64.deb` |
| **Machine** | nola1 workstation |
| **Estimated duration** | ~40 minutes |
| **On failure** | Record the step number and Notes; attach `~/.local/share/GrapeStrap/logs/main.log`. Per BUILD_PLAN v5 Wave 6: failure → fix + regression spec → `rc.N`. A clean pass gates the `v0.1.0` tag. |

**Watch item (from Wave 5):** electron-builder warns that `desktopName` / `syncDesktopName` are unset. Under Wayland, verify the app window actually associates with the installed `.desktop` file — the window must group under the GrapeStrap name and icon in the taskbar/dock, not a generic Electron entry (step 5).

Run the steps in order. Steps marked with a section header share setup with the steps that follow them.

---

## 1. Install and desktop integration (~8 min)

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Download `grapestrap_0.1.0-rc.1_amd64.deb` from the draft GitHub release. Run `sudo apt install ./grapestrap_0.1.0-rc.1_amd64.deb` (the `./` prefix is required). | Package installs cleanly; dependencies resolve automatically; no post-install script errors. | | |
| 2 | Open the desktop application launcher and search for GrapeStrap. | A GrapeStrap desktop entry appears, with the GrapeStrap application icon (not a generic placeholder) at launcher sizes. | | |
| 3 | Run `xdg-mime query default application/x-grapestrap` in a terminal. | Output is `grapestrap.desktop`. | | |
| 4 | Confirm the session type with `echo $XDG_SESSION_TYPE`, then launch GrapeStrap from the launcher. | The app starts. In a Wayland session it runs on the native Wayland backend (auto-detected); in an X11 session it runs plain X11. No blank window, no crash on startup. | | Record the session type. If rendering misbehaves, retest with `GRAPESTRAP_FORCE_X11=1` and note the difference. |
| 5 | **Watch item.** With the app open under Wayland, check the taskbar/dock/window switcher. | The window is associated with the installed desktop entry: GrapeStrap name and icon, and launching a second time focuses/groups with the existing entry. Not shown as a generic "Electron" window. | | `desktopName`/`syncDesktopName` unset in the builder config — this is the specific risk being checked. |

## 2. Create a project from the Landing starter (~4 min)

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 6 | File → New Project. In the New Project dialog, review the starter template choices. | Four starters are offered: Blank, Landing Page, Portfolio, Blog. | | |
| 7 | Select **Landing Page**, choose a parent folder, and create the project. | The project scaffolds and opens: pages and a master template appear in the File Manager (Templates section populated), and the project's `site/assets/` tree contains Bootstrap, Bootstrap Icons, and Font Awesome — no CDN references. | | |
| 8 | In the system file manager, double-click the project's `.gstrap` manifest file. | The file opens in GrapeStrap (MIME association `application/x-grapestrap` works end to end). | | Close the second instance/window afterward if one opens. **The double-click always launches the INSTALLED build** — if a dev tree or older install is also present, make sure every later step runs in the build under test (the 2026-08-03 §5 failure came from continuing in a stale installed rc.2). |

## 3. Edit a region page (~4 min)

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 9 | Open a page that uses the master template. Click into the template-owned chrome (header/footer). | Locked template chrome renders dimmed in the canvas; the status bar reports the locked state (`Locked — template "<name>"`); locked elements cannot be edited or deleted and get no resize handles. | | |
| 10 | Click into an editable region and change some text. | The status bar shows the region indicator (`Region: <id>`); the edit applies normally and the page/tab shows dirty state. | | |
| 11 | Save (Ctrl+S). | Save succeeds; dirty indicators clear. | | |

## 4. Drag-resize a column at two breakpoints (~5 min)

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 12 | At full canvas width, select a column (a direct child of a `.row` with a `col` class) and drag its side grip one or two grid steps. | During the drag, a ghost outline and a live class badge (e.g. `col-md-7`) preview the snap target. On release, the column's class updates to the snapped `col-*` class — no pixel CSS is written. | | |
| 13 | Press Ctrl+Z once. | The entire resize reverts in a single undo step. | | |
| 14 | Use the breakpoint slider above the canvas to narrow the frame to a Tablet or Mobile width, then drag the same column's grip again. | The write is breakpoint-scoped (e.g. `col-md-N` for the active breakpoint) and the base-width class is left intact. | | Known gap (not a blocker): the breakpoint-bar readout can go stale after a View-menu device switch. |
| 15 | Return the slider to 100% width. | The base-breakpoint layout is unchanged from step 12's result. | | |

## 5. Preview in Browser + save-reload (~4 min)

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 16 | Click **Preview in Browser** on the toolbar (or press Ctrl+F12). | The default browser opens the page from a `127.0.0.1` URL; the page renders fully styled (Bootstrap, icons, fonts all load — served locally, loopback only). | | |
| 17 | Back in GrapeStrap, make a visible edit and save (Ctrl+S). | The browser tab auto-reloads (SSE) and shows the edit without a manual refresh. | | |

## 6. Crash recovery (~5 min)

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 18 | Make a distinctive edit and do **not** save. Wait at least 60 seconds. | A `<project>.gstrap.recovery` snapshot file exists next to the project manifest (snapshots are written roughly every 30 s while the project is dirty). | | Verify in a terminal: `ls <projectDir>/*.recovery` |
| 19 | Find the app process id and `kill -9` it while the project is still dirty. | The app dies immediately (no exit dialog — that is the point of the test). | | Kill the exact GrapeStrap PID only. |
| 20 | Relaunch GrapeStrap and reopen the project if it does not reopen itself. | A recovery dialog offers **Restore / Discard**. | | |
| 21 | Choose **Restore**, then save. | The unsaved edit from step 18 is back in the page; after saving, the `.gstrap.recovery` file is cleared. | | Known gap: PHP file-tab buffers are not covered by recovery snapshots — do not test recovery with a `.php` tab edit. |

## 7. Git status indicators (~3 min)

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 22 | In a terminal: `cd <projectDir> && git init && git add -A && git commit -m "baseline"`. Then focus/reopen the project in GrapeStrap. | The status bar shows the branch name (plus ahead/behind counts once a remote exists). | | Read-only feature — no commit UI is expected in v0.1.0. |
| 23 | Modify and save a page, and add a new file under `site/`. | The File Manager rows show a modified dot on the changed page and an untracked dot on the new file. | | |

## 8. Workspace layouts (~3 min)

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 24 | Resize/rearrange the panels, then save the current arrangement as a named workspace layout. | The layout saves under the given name and appears in the layout list. | | |
| 25 | Switch to the **Coder** preset. | The panel arrangement changes to the Coder preset; Monaco editors and the canvas re-lay out correctly (no frozen or mis-sized panes). | | |
| 26 | Switch back to the layout saved in step 24. | The saved geometry and panel visibility are restored exactly. | | |

## 9. PHP file handling (~3 min)

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 27 | Copy a `.php` file (containing an `include` or `require`) into the project's `site/` tree, then check the File Manager. | The file is listed in the **Site Files** section. | | |
| 28 | Double-click the `.php` file. | It opens in a Monaco code tab with PHP syntax highlighting and dotted-underline decorations on `include`/`require` lines. Edits save back to disk. Highlight-only: no PHP executes. | | |
| 29 | With the preview server running, request the `.php` file's URL in the browser. | The PHP source displays as plain text in the browser — it is not executed and does not download as a binary/attachment. | | |

## 10. Export + open in browser (~3 min)

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 30 | Run Export (File menu) and choose an empty output directory. | Export completes without errors. The output directory contains one full HTML document per page plus a self-contained `assets/` tree (Bootstrap, Bootstrap Icons, Font Awesome, `style.css`). No `.gstrap-tpl` files in the output. | | |
| 31 | Open the exported landing page HTML file directly in a browser (file://, no server). | The page renders fully styled with all framework links resolving locally — no network requests, no missing CSS/JS/fonts. | | |

## 11. About modal (~1 min)

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 32 | Open Help → About. | A modal (not a toast) shows version `0.1.0-rc.1`, the repository link, and the no-telemetry pledge. | | |

---

## Sign-off

| | |
|---|---|
| **Result** | PASS / FAIL (any single Fail = FAIL) |
| **Date / tester** | |
| **Failures logged** | Step numbers + `main.log` attached: yes / no |
| **Next action** | PASS → user-gated `v0.1.0` tag + publish the draft release. FAIL → fix + regression spec → `rc.N`, rerun this checklist. |
