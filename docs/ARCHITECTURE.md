# GrapeStrap Architecture

This document is for new contributors. It explains how GrapeStrap is structured, why we made the load-bearing design choices, and where to look in the source tree to find each subsystem.

It is intentionally a high-level map. For the full feature list, milestone breakdown, and locked technical decisions, see [`GRAPESTRAP_BUILD_PLAN_v4.md`](../GRAPESTRAP_BUILD_PLAN_v4.md). For installation and runtime paths, see [INSTALL.md](./INSTALL.md). For writing plugins, see [PLUGIN-DEVELOPMENT.md](./PLUGIN-DEVELOPMENT.md).

---

## Table of contents

1. [The thirty-second tour](#the-thirty-second-tour)
2. [Process model](#process-model)
3. [Source tree map](#source-tree-map)
4. [Plugin host](#plugin-host)
5. [Editor core](#editor-core)
6. [State model](#state-model)
7. [Sync policy](#sync-policy)
8. [Project file format](#project-file-format)
9. [UI layout](#ui-layout)
10. [Security posture](#security-posture)
11. [XDG compliance](#xdg-compliance)
12. [Wayland handling](#wayland-handling)
13. [i18n](#i18n)
14. [Build and packaging](#build-and-packaging)
15. [Testing](#testing)
16. [Where to start as a new contributor](#where-to-start-as-a-new-contributor)

---

## The thirty-second tour

GrapeStrap is an **Electron** application. The main process opens a window. The renderer process loads `src/renderer/index.html`, which mounts:

- A **GrapesJS** instance (the visual canvas)
- **Monaco** (the code editor — same engine as VS Code)
- **Golden Layout** (the dockable panel system) governing the central area
- A custom toolbar, page tab strip, Linked Files bar, Insert panel, Property Inspector strip, and status bar around the Golden Layout region

The renderer talks to disk via a **preload bridge**. There is no direct Node access from renderer code — every fs/network call goes through the preload's `contextBridge`-exposed API.

A **plugin host** loads plugins from three locations (bundled, user, project) and gives each one access to a stable API surface. **Every built-in is itself a plugin** loaded from `plugins/` — the host has no special path for built-ins. Blocks, sections, exporters, and the English language pack all come from plugins.

Project state is held in a small **event-bus-driven** store in the renderer. There is no React, no Vue, no framework. Plain ES modules and DOM. The state we persist lives on disk in a `.gstrap` JSON manifest with sibling `pages/`, `templates/`, `library/`, and `assets/` folders.

Sync between Monaco and the GrapesJS canvas follows the **Dreamweaver model**: the side most recently focused is authoritative. Design edits flow live (debounced) into Code; Code edits propagate to Design only when the Design pane regains focus. We picked this deliberately — see [Sync policy](#sync-policy).

---

## Process model

Like any Electron app, GrapeStrap runs as multiple processes.

```
┌──────────────────────────────────────────────────────────────┐
│  MAIN PROCESS                                                │
│  - src/main/main.js                                          │
│  - Window lifecycle, native menus, IPC handlers              │
│  - File system, project open/save, recovery                  │
│  - Plugin discovery (manifest read; load happens in renderer)│
│  - Native dialogs                                            │
│  - electron-store, electron-log                              │
│  - XDG path resolution, Wayland flag injection               │
└──────────────────────────────────────────────────────────────┘
                          │
                          │ IPC (contextBridge-exposed API)
                          │
┌──────────────────────────────────────────────────────────────┐
│  PRELOAD                                                     │
│  - src/preload/preload.js                                    │
│  - The ONLY bridge between renderer and Node                 │
│  - Exposes a narrow, named API on window.grapestrap          │
│  - No nodeIntegration in renderer. No remote module.         │
└──────────────────────────────────────────────────────────────┘
                          │
                          │
┌──────────────────────────────────────────────────────────────┐
│  RENDERER PROCESS                                            │
│  - src/renderer/main.js                                      │
│  - GrapesJS, Monaco, Golden Layout                           │
│  - Plugin host runtime (loads plugins by URL/path)           │
│  - All UI: panels, dialogs, toolbar, status bar              │
│  - i18n runtime                                              │
│  - Event bus, project state, per-tab page state              │
└──────────────────────────────────────────────────────────────┘
```

### Main process responsibilities

The main process is intentionally thin. It owns:

- The `BrowserWindow` lifecycle, including the locked security flags (sandbox, contextIsolation, nodeIntegration:false, CSP).
- Native menus (`Menu.buildFromTemplate`) — File, Edit, View, Insert, Help.
- IPC handlers — these are the only entry points the renderer can reach into Node code through.
- File operations — open dialog, save dialog, atomic writes to disk for `.gstrap` and sibling files.
- Project manager — recent projects list, dirty tracking coordination, recovery file detection.
- Plugin loader — discovers manifests in the three plugin locations, validates them, returns the list to the renderer for actual loading.
- Preferences (`electron-store`) — JSON config under `$XDG_CONFIG_HOME/GrapeStrap/`.
- Logging (`electron-log`) — to `$XDG_DATA_HOME/GrapeStrap/logs/main.log`.
- Platform helpers — XDG path resolution, Wayland detection, Ctrl+R/F5 override before window load.

Files: `src/main/main.js`, `src/main/menus.js`, `src/main/ipc-handlers.js`, `src/main/file-operations.js`, `src/main/project-manager.js`, `src/main/prefs.js`, `src/main/plugin-loader.js`, `src/main/platform/xdg.js`, `src/main/platform/wayland.js`.

### Preload bridge

The preload script is the only place where Node APIs touch renderer code. It uses `contextBridge.exposeInMainWorld('grapestrap', { ... })` to publish a narrow API:

- File ops (open, save, watch) — proxied to main via IPC.
- Plugin discovery results — main's enumerated manifest list, surfaced for the renderer's plugin host.
- Preferences read/write — proxied to electron-store.
- Logger — proxied to electron-log.
- Native dialog callers — open/save/confirm prompts.
- Path helpers — XDG paths surfaced as constants for plugins.

The renderer never sees `require`, `process`, `Buffer`, or any Node global. If it asks to read a file, it goes through `window.grapestrap.fs.readFile(...)`, which validates the path and forwards to main.

File: `src/preload/preload.js`.

### Renderer process

The renderer hosts the actual editor. It's a single-page app with no router (the page tabs are a state concept, not URL routes). It mounts:

1. The Golden Layout container into the central region
2. The toolbar, page tab strip, Linked Files bar, Insert panel, Property Inspector strip, and status bar in fixed regions around it
3. A GrapesJS instance inside an iframe-backed canvas panel
4. Monaco inside a code panel
5. The plugin host runtime, which calls each plugin's `register(api)` entry point

All renderer code is vanilla ES modules. Vite bundles it. There is no JSX, no transpilation step beyond what Vite does for ES module imports, and no TypeScript.

---

## Source tree map

Annotated tree. Compare to the canonical layout in the [build plan](../GRAPESTRAP_BUILD_PLAN_v4.md#project-structure):

```
grapestrap/
├── src/
│   ├── main/                          ← Electron main process
│   │   ├── main.js                    ← entry point: window, security flags, lifecycle
│   │   ├── menus.js                   ← native menu definitions
│   │   ├── ipc-handlers.js            ← every channel the preload calls
│   │   ├── file-operations.js         ← open/save/watch
│   │   ├── project-manager.js         ← recent projects, dirty tracking, recovery
│   │   ├── prefs.js                   ← electron-store wrapper, XDG-aware
│   │   ├── plugin-loader.js           ← scans the 3 plugin folders, validates manifests
│   │   └── platform/
│   │       ├── xdg.js                 ← resolves XDG_*_HOME paths
│   │       └── wayland.js             ← detects Wayland session, picks ozone flags
│   ├── preload/
│   │   └── preload.js                 ← the bridge
│   ├── renderer/
│   │   ├── index.html
│   │   ├── main.js                    ← renderer entry: mounts everything
│   │   ├── editor/
│   │   │   ├── grapesjs-init.js       ← GrapesJS configuration
│   │   │   ├── monaco-init.js         ← Monaco worker config for file:// protocol
│   │   │   ├── view-modes.js          ← Design / Code / Split, per-tab
│   │   │   ├── canvas-sync.js         ← code-authoritative-when-active
│   │   │   ├── paste-handler.js       ← paste-with-inline-styles cleanup (v0.0.2)
│   │   │   ├── quick-tag-editor.js    ← Ctrl+T popover (v0.0.2)
│   │   │   └── wrap-with-tag.js       ← Ctrl+Shift+W (v0.0.2)
│   │   ├── layout/
│   │   │   ├── golden-layout-config.js
│   │   │   ├── panels.js              ← panel registry
│   │   │   ├── workspace-layouts.js   ← named saved layouts (v0.1.0)
│   │   │   └── reset-layout.js
│   │   ├── panels/                    ← each panel is a small ES module
│   │   │   ├── file-manager/
│   │   │   ├── dom-tree/              ← v0.0.2
│   │   │   ├── insert/                ← Insert panel with tabbed categories
│   │   │   ├── linked-files-bar/      ← v0.0.2
│   │   │   ├── properties-side/
│   │   │   ├── properties-strip/      ← Dreamweaver-style horizontal strip
│   │   │   ├── style-manager/         ← class-first style sub-panels
│   │   │   ├── custom-css/            ← project-global style.css editor
│   │   │   ├── library-items/         ← v0.0.2
│   │   │   ├── snippets/              ← v0.0.2
│   │   │   ├── color-picker/          ← v0.0.2
│   │   │   └── tabs.js
│   │   ├── plugin-host/
│   │   │   ├── api.js                 ← public API surface — what plugins import
│   │   │   ├── registry.js            ← active plugins, lookup, lifecycle
│   │   │   ├── manifest-validator.js  ← semver, required fields, permissions
│   │   │   └── trust-prompt.js        ← first-load confirm dialog
│   │   ├── status-bar/
│   │   ├── notifications/             ← Notyf wrapper
│   │   ├── dialogs/                   ← every modal: new project, prefs, export, etc.
│   │   ├── shortcuts/                 ← keymap, conflict detection, rebinding
│   │   ├── state/                     ← event bus, project state, tab state
│   │   ├── i18n/                      ← i18next runtime + message catalogs
│   │   └── utils/
│   ├── shared/                        ← code used by both main and renderer
│   │   ├── constants.js
│   │   ├── bootstrap-classes.js       ← class metadata for autocomplete + Style Manager
│   │   └── file-format.js             ← .gstrap schema validation
│   └── styles/
├── plugins/                           ← bundled built-ins (loaded identically to user plugins)
│   ├── core-blocks/                   ← @grapestrap/core-blocks
│   ├── blocks-bootstrap5/             ← @grapestrap/blocks-bootstrap5 (forked CWALabs)
│   ├── blocks-sections/               ← @grapestrap/blocks-sections (Gramateria-adapted)
│   ├── exporter-flat/                 ← @grapestrap/exporter-flat
│   └── lang-en/                       ← @grapestrap/lang-en
├── assets/                            ← bundled at build time, copied into installed app
├── packaging/                         ← Flatpak yml, Snap yaml, .desktop entry, MIME xml
├── docs/                              ← what you're reading
└── …
```

---

## Plugin host

The plugin host is the most load-bearing architectural commitment in GrapeStrap. **Every block, section, panel, and exporter that ships is a plugin**, loaded from `plugins/` at startup the same way a community plugin would be. We eat our own dog food.

### Discovery and load order

The main process scans three folders, in order:

1. **Bundled** — `<app>/plugins/`. Vetted by maintainers. No trust prompt.
2. **User** — `$XDG_CONFIG_HOME/GrapeStrap/plugins/`. Installed by the user. Trust prompt on first load (planned for v0.0.2; v0.0.1 loads bundled only).
3. **Project** — `<project>/.grapestrap/plugins/`. Committed with the project, version-locked, no prompt because the project itself is the trust boundary.

Later folders override earlier ones with the same `name`. So a project can pin a specific version of a plugin, overriding the user-installed copy or even a bundled one.

For each folder, main reads `grapestrap.json`, validates it (`semver` compat against the running GrapeStrap version, required fields present, permissions known), and ships the list to the renderer over IPC. The renderer's plugin host then dynamically imports the plugin's `main` entry and calls its `register(api)` function.

### The API object

The `api` argument to `register()` is a per-plugin instance with:

- `api.manifest` — the plugin's own manifest, frozen.
- `api.registerBlock`, `api.registerSection`, `api.registerPanel`, `api.registerExporter`, `api.registerCommand`, `api.registerSnippet`, `api.registerLanguage` — the registration surface.
- `api.addMenuItem`, `api.addStatusBarItem`, `api.addToolbarButton` — UI extension points.
- `api.on`, `api.off` — event subscription, off the renderer's event bus.
- `api.editor` — the GrapesJS instance. Read-mostly. Mutations go through API helpers.
- `api.monaco` — the Monaco namespace, for plugins that need to register completion providers, language modes, etc.
- `api.project` — read access to current project state.
- `api.activeTab` — the currently focused page tab.
- `api.fs` — sandboxed file system scoped to `$XDG_DATA_HOME/GrapeStrap/plugin-data/<plugin-name>/`.
- `api.notify` — toast helper (Notyf under the hood).
- `api.log` — child logger from electron-log, named for the plugin.
- `api.preferences` — get/set plugin-namespaced prefs, persisted by electron-store.

Plugins are dispatched lifecycle events through `api.on(event, handler)` — `app:ready`, `project:opened`, `project:closed`, `project:saved`, `tab:opened`, `tab:closed`, `tab:focused`, `element:selected`, `element:deselected`, `element:before-add`, `element:after-add`, `element:before-remove`, `element:after-remove`, `viewmode:changed`, `device:changed`, `export:before`, `export:after`.

The full surface is specified in [PLUGIN-DEVELOPMENT.md](./PLUGIN-DEVELOPMENT.md).

### Trust model

Plugins run in the renderer process with full API access. We do not sandbox plugin JS in a separate context. The cost of doing so (a complex web-worker-or-vm-shim model with serialised messages for every API call) outweighs the gain for an editor of this class.

What we do instead:

- **Bundled plugins** are vetted by maintainers and ship with the app.
- **User plugins** require explicit drop-in install (a folder under XDG_CONFIG_HOME) and a confirm prompt on first load showing the manifest. The user has to read the manifest and accept.
- **Project-pinned plugins** skip the prompt — the project is the trust boundary. If you opened the project, you trust it.
- The **Preferences > Plugins** page shows installed plugins, their manifests, load logs, and lets the user disable or uninstall.
- **No auto-install, no auto-update.** We never reach out and pull plugin code without the user explicitly asking.
- The **curated list** at `grapestrap.org/plugins` is community-submitted and reviewed before listing.

### Files

`src/renderer/plugin-host/api.js` (the API surface), `src/renderer/plugin-host/registry.js` (active plugins), `src/renderer/plugin-host/manifest-validator.js`, `src/renderer/plugin-host/trust-prompt.js`, and the discovery side in `src/main/plugin-loader.js`.

---

## Editor core

The editor is the marriage of GrapesJS (visual) and Monaco (code), wrapped in our own UI shell.

### GrapesJS

Configured in `src/renderer/editor/grapesjs-init.js`. We disable GrapesJS's own block manager UI (we render Insert panel ourselves), disable inline-style writing (class-first), and feed it components from the bundled plugins.

The canvas iframe is sandboxed but receives Bootstrap CSS and lazy-loaded vendor JS (Splide, GLightbox) injected on `component:add` and cleaned up on `component:remove` — adapted from Gramateria's pattern but using locally bundled assets, not CDN URLs (see [CREDITS.md](../CREDITS.md)).

### Monaco

Configured in `src/renderer/editor/monaco-init.js`. The `file://` protocol breaks Monaco's default web worker config; we set up the worker URLs explicitly so language services work. Monaco gets HTML, CSS, JS, and (in v0.1.0) PHP language modes.

Bootstrap class autocomplete (v0.0.2) is a custom Monaco completion provider fed by `src/shared/bootstrap-classes.js`.

### View modes

Design / Code / Split are per-tab. Implementation in `src/renderer/editor/view-modes.js`. Each tab remembers its own mode in tab state. Switching modes triggers a sync if needed (see below).

---

## State model

GrapeStrap deliberately uses **no UI framework**. Everything is plain ES modules, DOM events, and a small event bus. The reasoning:

- The editor's state is fundamentally a few large objects (project, tabs, GrapesJS internal model). Frameworks shine when there are hundreds of small components rendering frequently. We have a handful of large panels.
- Bringing in React/Vue/Svelte/Solid means a build pipeline opinion, a state management opinion, and a debugging-the-framework tax.
- Vanilla JS keeps the contributor bar low. New contributors don't have to learn the framework first.
- The plugin API is more stable when there's no framework version to coordinate against.

### The event bus

A single `EventEmitter`-style bus lives in `src/renderer/state/`. Events are fired by:

- The editor (GrapesJS wraps + canvas-sync) — `element:*`, `viewmode:changed`, `device:changed`.
- The project manager — `project:opened`, `project:closed`, `project:saved`, `project:dirty`.
- The tab manager — `tab:opened`, `tab:closed`, `tab:focused`.
- The exporter pipeline — `export:before`, `export:after`.
- The plugin host — `app:ready` once all plugins have run their `register()`.

Anyone (panels, plugins, status bar, dialogs) subscribes via `bus.on(event, handler)`. Plugins subscribe via `api.on(...)` which proxies to the bus with auto-cleanup on plugin unload.

### Project state

The current open project lives in a single state object: metadata, pages, templates, library items, palette, plugins list, preferences. It is mirrored on disk in the `.gstrap` manifest plus sibling files. State changes mark the project dirty and emit `project:dirty`; save flushes to disk.

### Per-tab page state

Each open tab has its own state: which page it is, current view mode, Monaco scroll/cursor position, undo stack head, dirty markers per code/design view. Tab state is in-memory only — closing a tab discards its scroll position. Re-opening starts fresh.

The tab strip and Linked Files bar render off this state. The panels (file manager, DOM tree, properties) react to the focused tab's state.

### Why no framework, but also no Redux/Zustand/etc.

Because the state shape is small. A handful of objects. Direct mutation followed by an event-bus emit is simpler than an action/reducer pipeline at this scale. If state grows enough that this becomes painful, we'll re-evaluate.

---

## Sync policy

The Monaco↔canvas sync question is the single most important design decision in any visual web editor. Live bidirectional diffing — typing in code and seeing it reflected in the canvas in real time, and vice versa — is what every project tries first and where most projects sink.

The problem: HTML in code is a string. The component tree in GrapesJS is a structured model. Going string → tree (parse) and tree → string (serialise) are both cheap. Diffing one side's edits against the other in real time, while the user is typing, while preserving cursor positions and selections and partial edits, **is not**. Every edge case (typing inside an attribute name, halfway through a tag, inside a comment, inside a `<script>`) is its own bug. The "300ms debounced both directions" approach in v3 of this plan would have been months of edge-case chasing.

So we picked the **Dreamweaver model**, which has been shipping happily since 1997:

- **Design → Code:** live, debounced ~300ms. Edits in Design view flow continuously to Code view.
- **Code → Design:** **on focus loss only.** Edits in Code view do not propagate live. When focus moves back to Design (or the Design pane in Split mode regains focus), the component tree is rebuilt from the current HTML string.

In Split view, **the side most recently focused is authoritative.** The other side updates on focus loss.

### Tradeoff acknowledged

Switching from Code back to Design loses canvas selection and any in-flight component traits not present as classes/attributes on the HTML. We document this in the welcome dialog on first launch and in the FAQ. Dreamweaver users already expect this behaviour. Everyone else gets a one-line explanation.

This unblocks the v0.0.1 milestone and prevents months of edge-case work. We can revisit live bidirectional sync as a v0.3 research project if community demand justifies it.

### Implementation

`src/renderer/editor/canvas-sync.js`. Hooks into GrapesJS's `update` event for Design → Code. Listens to Monaco's blur or pane focus-loss events for Code → Design. Tracks "active side" per tab. Writes are atomic — we don't update mid-edit.

---

## Project file format

A `.gstrap` project on disk is a JSON manifest plus sibling files:

```
my-project/
├── my-project.gstrap         ← JSON manifest (the "project file")
├── style.css                 ← project-global CSS, Monaco-edited
├── pages/
│   ├── index.html            ← one .html per page
│   ├── about.html
│   └── contact.html
├── templates/                ← v0.1.0
│   └── default-master.html
├── library/                  ← v0.0.2 — Library Items
│   └── site-footer.html
└── assets/
    ├── images/
    ├── fonts/
    └── videos/
```

The manifest references pages, templates, library items, and global CSS by relative path. Pages and library item HTML live in their own files **so a one-line edit produces a one-line git diff** instead of a noisy diff inside a 50KB JSON blob. The full manifest schema is in the [build plan](../GRAPESTRAP_BUILD_PLAN_v4.md#project-file-format-gstrap) and validated by `src/shared/file-format.js`.

### Why pages-on-disk

Three reasons:

1. **Git-friendly diffs.** Editing one page produces a one-file diff.
2. **External editor support.** A user can edit `pages/about.html` in vim or VS Code; chokidar picks up the change and GrapeStrap reloads the affected tab.
3. **Scale.** A 100-page project fits comfortably as 100 small HTML files; a 100-page JSON object does not.

### Recovery

`<project>.gstrap.recovery` — a sibling file written every 30 seconds while editing (v0.1.0; v0.0.1 ships with manual save and a dirty-warning on close). On launch, if a `.recovery` file is newer than the matching `.gstrap`, the user is offered to restore.

We deliberately do **not** use localStorage for recovery. localStorage is ephemeral, browser-specific, and breaks when the user opens the project on another machine. Disk-adjacent recovery is portable.

---

## UI layout

The renderer DOM has a fixed scaffold around a Golden Layout region. Only the central area is dockable.

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOOLBAR (50px)                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  PAGE TABS (32px)                                                   │
├─────────────────────────────────────────────────────────────────────┤
│  LINKED FILES BAR (24px, v0.0.2)                                    │
├──────────┬──────────┬──────────────────┬────────────────────────────┤
│          │          │                  │                            │
│  GOLDEN LAYOUT — defaults: file mgr / DOM tree / canvas+code / props│
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  INSERT PANEL (90px, tabbed: Common/Layout/Forms/Text/Media/...)    │
├─────────────────────────────────────────────────────────────────────┤
│  PROPERTY INSPECTOR STRIP (48px, context-aware)                     │
├─────────────────────────────────────────────────────────────────────┤
│  STATUS BAR (24px)                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

The toolbar, page tab strip, Linked Files bar, Insert panel, Property Inspector strip, and status bar are **fixed regions** of the renderer DOM. They don't live inside Golden Layout because Dreamweaver users expect them to stay put. Golden Layout governs only the central panel area.

Layout primitives:

- **Toolbar** — the high-frequency commands (New, Open, Save, Undo, Redo, view mode toggle, device toggle, Insert dropdown, Preview).
- **Page tabs** — one tab per open page, with dirty markers and a `+` button to create a new page.
- **Linked Files bar** — shows `<link>`/`<script>` references for the focused page, with status dots (loaded / missing / modified).
- **Insert panel** — tabbed categories (Common, Layout, Forms, Text, Media, Sections, Library, Snippets) populated from registered blocks.
- **Property Inspector strip** — Dreamweaver-style horizontal strip with the most-used properties for the selected element type. Five element kinds in v0.0.1 (text, image, button, container/row/column, link); more in v0.0.2.
- **Status bar** — path, cursor position (in Code view), selector breadcrumb (in Design view), device, saved state, and Git status (v0.1.0).

Default Golden Layout arrangement: file manager and DOM tree on the left, canvas/code in the middle (driven by view mode), Properties + Style + Cascade + Custom CSS on the right. User can re-arrange, detach, save layouts (v0.1.0).

### Color palette

Dark theme only for v0.x. The full palette is in the [build plan](../GRAPESTRAP_BUILD_PLAN_v4.md#color-palette-dark-theme). Light theme is on the v0.2 list.

### Fonts

Inter for UI, JetBrains Mono for code, both bundled locally as woff2 — no Google Fonts CDN, ever.

---

## Security posture

GrapeStrap follows current Electron security best practice. The `BrowserWindow` is created with:

- `sandbox: true`
- `contextIsolation: true`
- `nodeIntegration: false`
- `webSecurity: true`
- `preload: <absolute path to preload.js>`

A strict Content Security Policy is set on `index.html`:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: file:;
font-src 'self' data:;
connect-src 'self';
```

`'unsafe-inline'` is on `style-src` because GrapesJS injects inline `<style>` blocks for canvas previews. We do not allow inline `<script>`.

### Renderer isolation

The renderer cannot reach Node directly. Every fs/network call goes through preload. Preload exposes a narrow API:

```javascript
contextBridge.exposeInMainWorld('grapestrap', {
  fs: { readFile, writeFile, watch, ... },
  project: { open, save, recent, ... },
  prefs: { get, set, observe },
  log: { info, warn, error },
  dialog: { open, save, confirm },
  paths: { configHome, dataHome, cacheHome, ... },
})
```

Anything not in this surface, the renderer cannot do.

### Override defaults that would lose data

`Ctrl+R` and `F5` are reload shortcuts in vanilla Electron. They would wipe unsaved work in our renderer. We override both during window creation, so the shortcuts are free for our use (Ctrl+R becomes "Toggle responsive preview").

`Ctrl+Shift+R` is gated behind a `--dev` flag for the same reason.

### Plugin trust

Discussed in [Plugin host](#plugin-host). Short version: bundled plugins are vetted, user plugins prompt on first load showing the manifest, project plugins skip the prompt because the project itself is the trust boundary.

### What we explicitly do NOT do

- We do **not** copy Gramateria's broken `'node-integration': false` typo (which silently leaves Node enabled).
- We do **not** ship `enableRemoteModule: true` (deprecated and removed anyway).
- We do **not** load remote URLs in the main window.
- We do **not** disable `webSecurity`.
- We do **not** ship telemetry, ever.

---

## XDG compliance

We are strict about XDG Base Directory specification compliance. We do not write to `~/.grapestrap` or `~/.config/grapestrap` (lowercase). We use:

| Purpose                | XDG var               | Default fallback            |
|------------------------|-----------------------|-----------------------------|
| Preferences, plugins   | `$XDG_CONFIG_HOME`    | `~/.config`                 |
| Logs, plugin data      | `$XDG_DATA_HOME`      | `~/.local/share`            |
| Cache                  | `$XDG_CACHE_HOME`     | `~/.cache`                  |

All under a `GrapeStrap/` subfolder (PascalCase, matching the product name).

Resolution lives in `src/main/platform/xdg.js`. The renderer never resolves XDG paths itself — main does it once at startup and surfaces the resolved paths via preload.

See [INSTALL.md — XDG paths and where files live](./INSTALL.md#xdg-paths-and-where-files-live) for the full table.

---

## Wayland handling

`src/main/platform/wayland.js` runs at main-process startup, before the `BrowserWindow` is created. It:

1. Reads `XDG_SESSION_TYPE` and `WAYLAND_DISPLAY` from the environment.
2. If both indicate Wayland, appends `--ozone-platform=wayland` and `--enable-features=UseOzonePlatform` to Chromium's command line via `app.commandLine.appendSwitch(...)`.
3. Otherwise leaves the defaults (X11/XWayland).

Users can override with the `GRAPESTRAP_PLATFORM=wayland|x11` environment variable, which our detection respects.

Tested compositors: Mutter (GNOME), KWin (KDE Plasma), Sway, Hyprland. If a compositor exposes Wayland but the window misbehaves, we fall back to X11 cleanly because the Chromium ozone code is well-trodden.

---

## i18n

i18n shipped as a runtime in v0.1.0; the message catalog scaffold exists from v0.0.1.

- `i18next` is the runtime, configured in `src/renderer/i18n/i18next-init.js`.
- Default catalog `src/renderer/i18n/messages/en.json` (and shipped as the `@grapestrap/lang-en` plugin).
- Plugins register their own languages via `api.registerLanguage({ code, name, messages })`.
- Translator workflow lives in `docs/translations/` (planned).

The English catalog is the source of truth — every UI string in the renderer goes through `t('key.path')`, and the catalog is checked into git. Translation plugins ship message overrides for non-English locales.

We do not machine-translate. Every translation is human-authored.

---

## Build and packaging

- **Vite** drives the build. `vite.config.js` configures the renderer build, with `vite-plugin-electron` orchestrating main and preload.
- **electron-builder** packages the build into `.deb`, AppImage, `.rpm`, `tar.gz` (v0.0.1+), Flatpak (v0.0.2+), and Snap (v0.1.0+) outputs.
- **Bundled plugins** are part of the app payload — `electron-builder`'s `files` array includes `plugins/**/*`.
- **Assets** (Bootstrap CSS, Bootstrap Icons, Font Awesome Free, Inter, JetBrains Mono, Splide, GLightbox) are committed under `assets/` and copied at build time. **No CDN, ever**, in shipped code or in exported user projects.

The full build script invocations are in [INSTALL.md — Building from source](./INSTALL.md#building-from-source).

CI is GitHub Actions, defined in `.github/workflows/release.yml`. It builds all Linux package formats on every tagged release.

---

## Testing

- **Unit tests** — light. Pure functions in `src/shared/` and small helpers. We don't unit-test UI components.
- **End-to-end tests** — Playwright against Electron, in `tests/e2e/`. The v0.0.1 smoke test exercises the walking skeleton: open project → drag a block → save → close → reopen → assert block present. Every v0.0.2+ feature comes with its own Playwright test gating that feature's PR.
- **Manual QA** — every release tag gets a smoke pass on Ubuntu LTS, Fedora, and Arch (the maintainer's daily drivers).

Run tests:

```bash
npm run test:e2e
npm run lint
```

---

## Where to start as a new contributor

Pick the area that matches your interest:

| Interested in...                                | Start here                                                              |
|-------------------------------------------------|-------------------------------------------------------------------------|
| Block library, Bootstrap components             | `plugins/blocks-bootstrap5/` — fork it, add a new component, send a PR. |
| New section blocks (heroes, footers, etc.)      | `plugins/blocks-sections/` — raw HTML strings, easy to add.             |
| Style Manager sub-panels                        | `src/renderer/panels/style-manager/`                                    |
| New panel (DOM tree, Library Items, snippets)   | `src/renderer/panels/<your-panel>/`                                     |
| Insert panel UX                                 | `src/renderer/panels/insert/`                                           |
| Plugin authoring                                | [PLUGIN-DEVELOPMENT.md](./PLUGIN-DEVELOPMENT.md) — write your own       |
| New exporter (Hugo, Jekyll, 11ty)               | Plugin — `type: "exporter"`. See PLUGIN-DEVELOPMENT.md                  |
| Linux packaging (Flatpak/Snap/AUR)              | `packaging/`                                                            |
| Translations                                    | `src/renderer/i18n/messages/` and `docs/translations/`                  |
| Documentation                                   | `docs/` — open a PR, we love doc PRs                                    |
| Architecture decisions                          | `docs/decisions/` — propose an ADR                                      |

For anything substantial, open an issue or a Discussion thread first to align on the approach. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full process.

---

## Further reading

- [GRAPESTRAP_BUILD_PLAN_v4.md](../GRAPESTRAP_BUILD_PLAN_v4.md) — the canonical, authoritative build plan. Every locked decision lives there.
- [INSTALL.md](./INSTALL.md) — installation, system requirements, XDG paths, Wayland.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to contribute.
- [PLUGIN-DEVELOPMENT.md](./PLUGIN-DEVELOPMENT.md) — write a plugin.
- [CREDITS.md](../CREDITS.md) — attributions, including Gramateria patterns we adapted and CWALabs work we forked.
- [LICENSE](../LICENSE) — MIT.
- `docs/KEYBOARD-SHORTCUTS.md` — full keyboard reference (planned with v0.0.2).
- `docs/decisions/` — ADRs for significant architectural calls.
