# GrapeStrap — Build Plan v4 (FINAL)
**The Dreamweaver alternative the Linux community has been waiting for.**

**Stack:** Electron + GrapesJS + Monaco + Golden Layout + Vite
**Targets:** Ubuntu/Debian/Fedora/Arch x64 | **Distribution:** GitHub Releases, Flathub, Snap Store, AUR
**License:** MIT | **Telemetry:** None, ever

---

## What changed from v3

v4 supersedes v3. The changes are deliberate and load-bearing:

1. **Rolling v0.x release model.** v3 promised a single v0.1.0 in 4 weeks containing the entire feature set. That was 4 months of work compressed into a fantasy timeline. v4 delivers v0.0.1 → v0.0.2 → v0.1.0 over ~13 weeks, each release usable on its own.
2. **Plugin architecture from day 1.** Every block, section, panel, and exporter that ships is itself a plugin. The community can replace any built-in. v3 deferred this to "v0.2 maybe."
3. **Sync policy locked to the Dreamweaver model.** Code-authoritative-when-active, no real-time bidirectional diffing. v3's "300ms debounced both directions" would have eaten months.
4. **Master templates moved to v0.1.0.** They were a 2–3 week feature crammed into v3's fourth week. Library Items added as a separate, lighter concept that ships earlier.
5. **Dreamweaver feature parity expanded.** DOM tree panel, Quick Tag Editor, Wrap with Tag, Linked Files bar, CSS Cascade view, pseudo-class editing, Library Items, Snippets — all signature DW features missing from v3.
6. **Linux community commitments made explicit.** Flatpak/Snap packaging, XDG compliance, Wayland support, MIME registration, no telemetry pledge, i18n scaffold, governance model.
7. **Spelling locked.** "GrapeStrap" as the product name. `grapestrap` as the package, binary, and folder name.

---

## Table of Contents

1. [Vision](#vision)
2. [Locked Technical Decisions](#locked-technical-decisions)
3. [Prior Art & Attribution](#prior-art--attribution)
4. [Plugin Architecture](#plugin-architecture)
5. [Sync Policy (Locked)](#sync-policy-locked)
6. [Project Structure](#project-structure)
7. [Dependencies](#dependencies)
8. [Phase 1 — v0.0.1: Walking Skeleton + Single-Page Editing](#phase-1--v001)
9. [Phase 2 — v0.0.2: Multi-Page + Dreamweaver Tools + Style Polish](#phase-2--v002)
10. [Phase 3 — v0.1.0: Master Templates + Linux Polish + Public Launch](#phase-3--v010)
11. [Phase 4 — v0.2 and beyond](#phase-4--v02-and-beyond)
12. [Block System Specification](#block-system-specification)
13. [Style Manager Replacement Specification](#style-manager-replacement-specification)
14. [Master Templates & Library Items](#master-templates--library-items)
15. [Plugin API Specification](#plugin-api-specification)
16. [Project File Format (.gstrap)](#project-file-format-gstrap)
17. [Keyboard Shortcuts (Complete)](#keyboard-shortcuts-complete)
18. [UI Layout Specification](#ui-layout-specification)
19. [Linux Community Commitments](#linux-community-commitments)
20. [Development Milestones](#development-milestones)
21. [Handoff to Claude Code](#handoff-to-claude-code)

---

## Vision

GrapeStrap is a desktop visual editor for building static Bootstrap 5 websites, modeled after Adobe Dreamweaver's editing paradigm. Linux-first because the Linux ecosystem has no high-quality native visual web editor — and Linux deserves it.

Three principles drive every decision:

1. **Class-first styling.** Bootstrap utility classes are the primary mechanism for styling. Inline styles are de-prioritized but available for power users.
2. **Dreamweaver muscle memory.** Property Inspector strip, organized Insert tabs, Design/Code/Split view modes, master-page templates, Library Items, Quick Tag Editor, DOM tree panel, Linked Files bar, native menus. Dreamweaver users should feel at home within ten minutes.
3. **Built for and by the community.** Plugin system from v0.1, MIT licensed, Flathub published, no telemetry, no phone-home, no auto-updater nag. Translations welcomed from day 1. CONTRIBUTING.md and a plugin development guide ready before code lands.

---

## Locked Technical Decisions

| Area | Choice | Reason |
|---|---|---|
| Code editor | **Monaco** | Real IDE feel; matches Dreamweaver positioning; bundle size irrelevant on desktop |
| Panel system | **Golden Layout** | Dockable, detachable, resizable workspace |
| Window chrome | **Native frame** | Plays nice with GNOME/KDE/XFCE |
| Build tooling | **Vite** | Fast, modern, ES modules, hot reload |
| Language | **Vanilla JS** | No TypeScript; lower contributor bar |
| Chrome icons (app UI) | **Bootstrap Icons** | Thematic fit, MIT, designed for Bootstrap |
| Canvas icons (user content) | **Font Awesome Free** | Name recognition, breadth, MIT-compatible |
| Both icon sets | **Bundled locally** | No internet dependency on first run or in exports |
| Layout primitives | **CWALabs `grapesjs-blocks-bootstrap5` (forked)** | Structured components with size traits |
| Section blocks | **Custom raw-HTML strings** | Adapted from Gramateria with attribution |
| Formatter | **Prettier** | Format exported HTML/CSS/JS |
| File watching | **chokidar** | External file change detection |
| Preferences storage | **electron-store** with XDG paths | Persisted JSON config |
| Logging | **electron-log** with XDG paths | Crash/error logs to disk |
| Toast notifications | **Notyf** | Small, focused, Bootstrap-friendly |
| Status bar | **Custom** | Dreamweaver-style, persistent passive info |
| **Plugin API** | **Custom, in-process renderer** | Every built-in is a plugin; eats own dog food |
| **Sync policy** | **Code-authoritative-when-active (Dreamweaver model)** | Live Design→Code; Code→Design on switch only |
| **i18n** | **i18next, English ships, structure from day 1** | Linux community translates fast |
| **Wayland** | **Auto-detect, native by default** | Modern Linux desktop standard |
| **XDG Base Dirs** | **Strict compliance** | Respect `$XDG_CONFIG_HOME`, `$XDG_CACHE_HOME`, `$XDG_DATA_HOME` |
| **Linux packaging** | **`.deb`, AppImage, rpm, tar.gz, Flatpak, Snap** | Reach every distro |
| **Style philosophy** | **Class-first, Level 1 soft push** | Custom CSS available via dedicated panel |
| Class chips on elements | **Hover/focus only** | Clean visual default |
| Multi-page UX | **Tabs above canvas + page list in file manager** | Matches modern IDEs |
| View modes | **Design / Code / Split** (Ctrl+1/2/3) | Dreamweaver signature |
| View mode scope | **Per-tab** | Each open page remembers its own view mode |
| Master-page templates | **v0.1.0** | Full feature; not v0.0.1 |
| **Library Items** | **v0.0.2** | Dreamweaver-style linked snippets, lighter than templates |
| **DOM tree panel** | **v0.0.2** | Iconic Dreamweaver feature |
| **CSS Cascade view** | **v0.0.2** | Shows where styles come from |
| **Pseudo-class editing** | **v0.0.2** | `:hover`, `:focus`, `:active` |
| **Linked Files bar** | **v0.0.2** | Shows CSS/JS the page references |
| **Quick Tag Editor** | **v0.0.2** | Ctrl+T, Dreamweaver muscle memory |
| **Wrap with Tag** | **v0.0.2** | Ctrl+Shift+W |
| **Snippets panel** | **v0.0.2** | User code chunks, plugin-extendable |
| **Color picker w/ eyedropper** | **v0.0.2** | Project palette, samples canvas |
| Property Inspector | **Bottom horizontal strip** | Dreamweaver signature |
| Insert panel | **Organized tabs** (Common / Layout / Forms / Text / Media / Sections / Library / Snippets) | Dreamweaver-style |
| Asset folders | **Typed subfolders** (`assets/images/`, `assets/fonts/`, `assets/videos/`) | Dreamweaver convention |
| Head editing | **Both: dialog + code view** | Common case in dialog, advanced in code |
| Custom CSS scope | **Project-global** (one `style.css` shared across pages) | Simple mental model |
| Paste-with-inline-styles | **Warn + offer cleanup** | Non-destructive, pedagogical |
| Drag-to-resize | **Layout primitives + images** (snaps to BS class on release) | DW feel + class-first output |
| Keyboard rebinding | **Full UI in Preferences (v0.0.1 stub, v0.0.2 full)** | ~50 shortcuts; conflicts with user workflows likely |
| **Telemetry** | **None, ever** | Community pledge |
| **Auto-update** | **Notify only, never install** | Community trust |

---

## Prior Art & Attribution

### Gramateria (https://github.com/ronaldaug/gramateria) — MIT
We performed a complete source review of Gramateria v1.0.6. We borrow four specific patterns/assets, all credited in `CREDITS.md`:

1. **Lazy CDN-style dependency injection per block.** When a block needing a third-party JS library is dropped, `component:add` injects the dependency into the canvas iframe. On `component:remove`, dependencies are cleaned up if no other component needs them. **Adaptation:** we inject *locally bundled* assets (from `node_modules` copied at build time), not CDN URLs.
2. **Section block library.** ~12 pre-built Bootstrap 5 sections. Adapted to remove hardcoded Cloudinary URLs from the original author's account and updated for our class-first philosophy.
3. **Export template pattern.** Single function returning HTML string with placeholders. Simple, readable, extensible.
4. **Standard exported folder layout.** `index.html`, `css/style.css`, `js/script.js`, `assets/`. Standard static-site structure.

### What we explicitly do NOT borrow from Gramateria
- Their broken Electron security (`'node-integration': false` is misspelled — has no effect — leaves Node enabled)
- Laravel Mix build tooling (replaced with Vite)
- localStorage-as-source-of-truth (we use disk `.gstrap` files; localStorage is recovery-only backup, file-based recovery preferred)
- Netlify deployment with plain-text token storage in localStorage
- `document.execCommand("copy")` (deprecated; use `navigator.clipboard`)
- Hardcoded Cloudinary asset URLs

### CWALabs `grapesjs-blocks-bootstrap5` — MIT
**Action:** Fork to our GitHub org on Day 1. Update `package.json` to reference our fork. Maintain ourselves regardless of upstream activity.

**Reason:** Single maintainer, 14 stars upstream. Forking now means we control updates, can patch bugs immediately, and can extend with GrapeStrap-specific features (tooltips on size dropdowns that teach class names, `col-xxl-*` support if missing, default `col-md-X` over `col-X`).

### Adobe Dreamweaver
We do not use, copy, or look at Adobe code. We mimic the *workflow* — Property Inspector, view modes, DOM tree, Library Items, master templates, Quick Tag Editor — because those workflows define a category. The implementation is entirely original.

---

## Plugin Architecture

GrapeStrap is built as a thin host with a rich plugin API. **Every block, section, panel, and exporter that ships is itself a plugin.** This eats our own dog food: the API is real from day 1, and the community can replace any built-in.

### Plugin Types

| Type | Purpose |
|---|---|
| `block` | Draggable element in Insert panel |
| `section` | Pre-built section (raw HTML, drag to insert) |
| `panel` | Custom panel registered with Golden Layout |
| `exporter` | Custom export target (Hugo, Jekyll, 11ty, etc.) |
| `theme` | Color palette / icon overrides for editor chrome |
| `language` | i18n translation pack |
| `command` | Keyboard-bindable action |
| `snippet-pack` | Bundle of reusable code snippets |

### Plugin Manifest (`grapestrap.json`)

```json
{
  "name": "@grapestrap/blocks-bootstrap5",
  "version": "0.1.0",
  "displayName": "Bootstrap 5 Blocks",
  "description": "Layout primitives for Bootstrap 5",
  "author": "GrapeStrap Team",
  "license": "MIT",
  "type": "block",
  "main": "dist/index.js",
  "grapestrapVersion": "^0.1.0",
  "dependencies": {},
  "permissions": []
}
```

### Plugin Locations (loaded in order, later overrides earlier)

1. **Bundled** (`<app>/plugins/`) — ships with GrapeStrap, vetted by us
2. **User** (`$XDG_CONFIG_HOME/GrapeStrap/plugins/`) — installed by user, prompted on first load
3. **Project** (`<project>/.grapestrap/plugins/`) — committed with project, version-locked, no prompt

### Plugin API Surface (v0.1)

```javascript
// A plugin's entry exports a default function:
export default function register(api) {
  // Registration
  api.registerBlock({ id, label, category, content, dependencies, traits })
  api.registerSection({ id, label, content, dependencies, preview })
  api.registerPanel({ id, title, component, defaultLocation })
  api.registerExporter({ id, label, exportFn })
  api.registerCommand({ id, label, handler, defaultBinding })
  api.registerSnippet({ id, label, content, language })
  api.registerLanguage({ code, name, messages })

  // Menu / UI
  api.addMenuItem({ menu, label, command, position })
  api.addStatusBarItem({ id, render })
  api.addToolbarButton({ id, label, icon, command })

  // Events
  api.on(event, handler)
  api.off(event, handler)

  // Editor access
  api.editor       // GrapesJS instance (read access; mutations through API helpers)
  api.monaco       // Monaco namespace
  api.project      // Read current project state
  api.activeTab    // Currently focused page tab

  // Sandboxed I/O
  api.fs           // fs scoped to plugin's data dir under XDG_DATA_HOME
  api.notify       // toast helper
  api.log          // electron-log child logger named for this plugin
  api.preferences  // get/set plugin-namespaced prefs
}
```

### Trust Model

Plugins run in the renderer with full API access. Sandboxing JS plugins in Electron costs more than it gains for an editor of this class.

- **Bundled plugins** are vetted by maintainers
- **User plugins** require explicit install (drop into folder, restart) and confirm prompt on first load showing the manifest
- **A "Plugins" page in Preferences** shows installed plugins, lets the user disable/uninstall, view manifest and load logs
- **Curated plugin list** at `https://grapestrap.org/plugins` — community submissions reviewed before listing
- **No auto-install, no auto-update** — explicit user action only
- **Plugin API stability** — semver-versioned; breaking changes require a major version bump and migration notes

### Built-ins as Plugins

These ship in `<app>/plugins/` and look identical to community plugins:

- `@grapestrap/core-blocks` — text, image, button, link, list, table, divider
- `@grapestrap/blocks-bootstrap5` — our fork of CWALabs' plugin
- `@grapestrap/blocks-sections` — Gramateria-adapted sections
- `@grapestrap/exporter-flat` — default flat HTML/CSS/assets export
- `@grapestrap/lang-en` — English (default)

This means a community member can submit `@yourname/blocks-bulma` to support a different framework, and it loads identically.

---

## Sync Policy (Locked)

The bidirectional Monaco↔canvas sync problem has eaten months of every editor that tried real-time both-ways diffing. We commit to the **Dreamweaver model**:

- **Design → Code:** live-debounced (300ms). Edits in Design view flow continuously to Code view.
- **Code → Design:** **on switch only**. Edits in Code view do not propagate live. When the user switches back to Design view (or the Design pane in Split mode regains focus), the component tree is rebuilt from the current HTML.
- **Tradeoff acknowledged:** switching from Code to Design loses canvas selection and any in-flight component traits not present as classes/attributes. Acceptable for v0.x.
- **Tradeoff documented in onboarding** (welcome dialog on first launch, FAQ in docs).

In Split view, **the side most recently focused is authoritative**. The other side updates on focus loss.

This unblocks M1 and prevents months of edge-case chasing. We can revisit live bidirectional sync as a v0.3 research project if community demand exists.

---

## Project Structure

```
grapestrap/
├── src/
│   ├── main/                          ← Electron main process
│   │   ├── main.js
│   │   ├── menus.js
│   │   ├── ipc-handlers.js
│   │   ├── file-operations.js
│   │   ├── project-manager.js
│   │   ├── prefs.js                   ← electron-store with XDG paths
│   │   ├── plugin-loader.js           ← Discovers and loads plugins
│   │   └── platform/
│   │       ├── xdg.js                 ← XDG Base Directory resolution
│   │       └── wayland.js             ← Wayland detection + flags
│   ├── preload/
│   │   └── preload.js
│   ├── renderer/
│   │   ├── index.html
│   │   ├── main.js
│   │   ├── editor/
│   │   │   ├── grapesjs-init.js
│   │   │   ├── monaco-init.js
│   │   │   ├── view-modes.js
│   │   │   ├── canvas-sync.js         ← Code-authoritative-when-active
│   │   │   ├── paste-handler.js
│   │   │   ├── quick-tag-editor.js    ← v0.0.2: Ctrl+T popover
│   │   │   └── wrap-with-tag.js       ← v0.0.2: Ctrl+Shift+W
│   │   ├── layout/
│   │   │   ├── golden-layout-config.js
│   │   │   ├── panels.js
│   │   │   ├── workspace-layouts.js   ← v0.1.0: save/load named layouts
│   │   │   └── reset-layout.js
│   │   ├── panels/
│   │   │   ├── file-manager/
│   │   │   ├── dom-tree/              ← v0.0.2: collapsible tree
│   │   │   ├── insert/
│   │   │   ├── linked-files-bar/      ← v0.0.2: above canvas
│   │   │   ├── properties-side/
│   │   │   ├── properties-strip/
│   │   │   ├── style-manager/
│   │   │   │   ├── spacing.js
│   │   │   │   ├── display.js
│   │   │   │   ├── flex.js
│   │   │   │   ├── text.js
│   │   │   │   ├── background.js
│   │   │   │   ├── border.js
│   │   │   │   ├── sizing.js
│   │   │   │   ├── pseudo-class.js    ← v0.0.2: :hover, :focus, :active
│   │   │   │   └── cascade-view.js    ← v0.0.2: where styles come from
│   │   │   ├── custom-css/
│   │   │   ├── library-items/         ← v0.0.2: linked snippet manager
│   │   │   ├── snippets/              ← v0.0.2: user code chunks
│   │   │   ├── color-picker/          ← v0.0.2: with eyedropper, palette
│   │   │   └── tabs.js
│   │   ├── plugin-host/               ← Plugin API runtime
│   │   │   ├── api.js                 ← Public API surface
│   │   │   ├── registry.js            ← Active plugin registry
│   │   │   ├── manifest-validator.js
│   │   │   └── trust-prompt.js        ← First-load confirm dialog
│   │   ├── status-bar/
│   │   ├── notifications/
│   │   ├── dialogs/
│   │   │   ├── new-project.js
│   │   │   ├── new-page.js
│   │   │   ├── page-properties.js
│   │   │   ├── preferences/
│   │   │   │   ├── general.js
│   │   │   │   ├── editor.js
│   │   │   │   ├── shortcuts.js
│   │   │   │   ├── plugins.js         ← Manage installed plugins
│   │   │   │   └── advanced.js
│   │   │   ├── export.js
│   │   │   ├── about.js
│   │   │   ├── recovery.js
│   │   │   └── welcome.js             ← First-launch onboarding
│   │   ├── shortcuts/
│   │   ├── state/
│   │   ├── i18n/                      ← Translation runtime
│   │   │   ├── i18next-init.js
│   │   │   └── messages/
│   │   │       └── en.json
│   │   └── utils/
│   ├── shared/
│   │   ├── constants.js
│   │   ├── bootstrap-classes.js
│   │   └── file-format.js
│   └── styles/
├── plugins/                           ← Bundled built-in plugins
│   ├── core-blocks/
│   ├── blocks-bootstrap5/             ← Our fork of CWALabs
│   ├── blocks-sections/               ← Gramateria adaptation
│   ├── exporter-flat/
│   └── lang-en/
├── assets/
│   ├── icons/
│   ├── chrome-icons/
│   ├── canvas-icons/
│   ├── fonts/
│   ├── bootstrap/
│   ├── vendor/
│   ├── templates/
│   │   ├── blank/
│   │   ├── landing/
│   │   ├── portfolio/
│   │   └── blog/
│   └── splash/
├── build/
├── packaging/
│   ├── flatpak/
│   │   └── org.grapestrap.GrapeStrap.yml
│   ├── snap/
│   │   └── snapcraft.yaml
│   └── desktop/
│       └── grapestrap.desktop
├── docs/
│   ├── README.md
│   ├── INSTALL.md
│   ├── CONTRIBUTING.md
│   ├── ARCHITECTURE.md
│   ├── KEYBOARD-SHORTCUTS.md
│   ├── PLUGIN-DEVELOPMENT.md          ← How to write a plugin
│   ├── decisions/                     ← ADR records
│   └── translations/                  ← Translator guide
├── .github/
│   ├── workflows/
│   │   └── release.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   ├── feature_request.md
│   │   └── plugin_submission.md
│   └── CODE_OF_CONDUCT.md
├── CREDITS.md
├── CHANGELOG.md
├── package.json
├── vite.config.js
├── .gitignore
└── LICENSE
```

---

## Dependencies

### Runtime
```bash
# Core editor stack
npm install grapesjs
npm install monaco-editor
npm install golden-layout

# Bootstrap blocks (after forking CWALabs to your org)
npm install @grapestrap/blocks-bootstrap5

# UI assets
npm install bootstrap@5
npm install bootstrap-icons
# Font Awesome Free downloaded and committed to assets/canvas-icons/

# Utilities
npm install chokidar
npm install electron-store
npm install electron-log
npm install notyf
npm install prettier
npm install i18next
npm install simple-git           # v0.1.0: status indicator only
npm install semver               # plugin version compatibility checks

# Lazy-load deps (copied to assets/vendor/ at build time)
npm install @splidejs/splide
npm install glightbox
```

### Build / Dev
```bash
npm install --save-dev electron
npm install --save-dev electron-builder
npm install --save-dev vite
npm install --save-dev vite-plugin-electron
npm install --save-dev concurrently
npm install --save-dev playwright   # E2E test harness
```

---

## package.json (Critical Sections)

```json
{
  "name": "grapestrap",
  "version": "0.0.1",
  "main": "src/main/main.js",
  "scripts": {
    "dev": "vite",
    "start": "electron .",
    "build": "vite build",
    "build:deb": "npm run build && electron-builder --linux deb",
    "build:appimage": "npm run build && electron-builder --linux AppImage",
    "build:rpm": "npm run build && electron-builder --linux rpm",
    "build:tarball": "npm run build && electron-builder --linux tar.gz",
    "build:flatpak": "npm run build && flatpak-builder build/flatpak packaging/flatpak/org.grapestrap.GrapeStrap.yml",
    "build:snap": "npm run build && snapcraft --output build/grapestrap.snap",
    "build:linux": "npm run build && electron-builder --linux deb AppImage rpm tar.gz",
    "test:e2e": "playwright test",
    "lint": "eslint src/"
  },
  "build": {
    "appId": "org.grapestrap.GrapeStrap",
    "productName": "GrapeStrap",
    "linux": {
      "target": ["deb", "AppImage", "rpm", "tar.gz"],
      "category": "Development",
      "icon": "assets/icons/icon.png",
      "mimeTypes": ["application/x-grapestrap"],
      "desktop": {
        "Name": "GrapeStrap",
        "Comment": "Visual Bootstrap 5 editor for Linux",
        "Categories": "Development;WebDevelopment;",
        "Keywords": "html;css;bootstrap;web;editor;dreamweaver;visual;",
        "MimeType": "application/x-grapestrap;text/html;"
      }
    },
    "files": [
      "src/**/*",
      "plugins/**/*",
      "assets/**/*",
      "node_modules/**/*",
      "dist/**/*"
    ]
  }
}
```

---

## Phase 1 — v0.0.1
**Weeks 1–4. Walking Skeleton + Single-Page Editing.**

**Goal:** A usable editor for a single-page Bootstrap site. Open project, drag blocks, edit text and classes, save, export to flat HTML/CSS/assets. Released on GitHub for early-adopter feedback.

**Released as:** `v0.0.1-alpha`. Linux only (`.deb`, AppImage, tar.gz). Linux community early adopters get a working editor 4 weeks in.

### Deliverables

#### Foundation (Week 1)
- Electron security posture, preload bridge, native menus
- Vite build, GitHub Actions CI release pipeline (`.deb`, AppImage, tar.gz)
- XDG Base Directory compliance — config goes to `$XDG_CONFIG_HOME/GrapeStrap/`, cache to `$XDG_CACHE_HOME/GrapeStrap/`, data to `$XDG_DATA_HOME/GrapeStrap/`
- Wayland auto-detection with `--ozone-platform` flag injection
- Override Ctrl+R / F5 (default reload would wipe unsaved work)
- electron-store, electron-log wired with XDG paths
- E2E test harness (Playwright-against-Electron); one smoke test: open project, drag block, save, close, reopen, verify block present

#### Plugin Host (Week 1)
- Plugin loader scans bundled `plugins/` folder
- Plugin manifest validation (semver compat check)
- Plugin API skeleton (registerBlock, registerSection, registerExporter, on/off events, editor/monaco/notify/log/fs accessors)
- Built-ins refactored as plugins from the start: `@grapestrap/core-blocks`, `@grapestrap/blocks-bootstrap5`, `@grapestrap/blocks-sections`, `@grapestrap/exporter-flat`
- User plugin folder loaded but disabled (deferred to v0.0.2; trust prompt UI not yet built)

#### Editor Core (Weeks 2–3)
- GrapesJS canvas with bundled Bootstrap 5 + forked CWALabs plugin
- Monaco code view (HTML and CSS tabs per page)
- Monaco Web Worker config for `file://` protocol
- Code-authoritative-when-active sync (the locked policy)
- Design / Code / Split view modes (Ctrl+1/2/3, per-tab)
- Page tabs (full system, single page in v0.0.1 but architecture supports multi-page)
- File manager (project tree, page list, asset folders, chokidar watcher)
- Property Inspector strip (5 element types: text, image, button, container/row/column, link)
- Status bar (path, cursor, selector, device, saved state)
- Toast notifications (Notyf)
- Class-first style strip subset: spacing, text, background (full Style Manager v0.0.2)
- Custom CSS panel (project-global `style.css` in small Monaco)
- Drag-and-drop image import → `assets/images/`
- Disable inline-style writing in GrapesJS

#### Project Management (Week 3)
- New Project dialog
- Open Project (native dialog)
- Save / Save As to `.gstrap`
- Pages stored as separate disk files alongside `.gstrap` manifest (avoids huge JSON, git-friendly)
- Recent Projects (last 10)
- File-based crash recovery (`.gstrap.recovery` next to project file, not localStorage)
- Dirty tracking, confirm-on-close

#### Sections + Lazy Deps (Week 4)
- 12 section blocks (Gramateria adaptation): hero, header, footer, gallery, testimonial, contact, pricing, features, CTA, navbar variants
- Lazy local dependency injection (Splide, GLightbox bundled, injected per block)
- Export to flat HTML/CSS/assets folder structure

#### Polish (Week 4)
- Welcome dialog on first launch (explains sync policy, links to docs)
- Reset Layout
- Native menus complete (File, Edit, View, Insert, Help)
- Linux desktop integration: `.desktop` file, MIME type for `.gstrap`, app icon
- README, INSTALL, CONTRIBUTING, basic ARCHITECTURE
- v0.0.1 announcement post

### What's deliberately NOT in v0.0.1

- Master templates (v0.1.0)
- Library Items (v0.0.2)
- DOM tree panel (v0.0.2)
- CSS Cascade view (v0.0.2)
- Pseudo-class editing (v0.0.2)
- Linked Files bar (v0.0.2)
- Quick Tag Editor / Wrap with tag (v0.0.2)
- Snippets panel (v0.0.2)
- Color picker / eyedropper (v0.0.2)
- User-installed plugins (host loads, but trust UI deferred)
- Project-wide Find/Replace (v0.0.2)
- Bootstrap class autocomplete in Monaco (v0.0.2)
- Full Style Manager (v0.0.2)
- Asset manager panel (v0.0.2)
- Page Properties dialog (v0.0.2)
- Paste-with-inline-styles handler (v0.0.2)
- Drag-to-resize with class snapping (v0.0.2)
- rpm / Flatpak / Snap (v0.0.2 / v0.1.0)
- i18n runtime (v0.1.0; English hardcoded for v0.0.1)
- Workspace layouts (v0.1.0)
- Preview in Browser (v0.1.0)
- Git status indicator (v0.1.0)
- PHP awareness (v0.1.0)

---

## Phase 2 — v0.0.2
**Weeks 5–8. Multi-Page + Dreamweaver Tools + Style Polish.**

**Goal:** A Dreamweaver user opening this for the first time recognizes the workflow and reaches for familiar tools — and finds them.

**Released as:** `v0.0.2-beta`. `.deb`, AppImage, rpm, tar.gz, Flatpak (initial Flathub submission).

### Deliverables

#### Style Manager (Full)
- All seven Bootstrap-aware sub-panels: spacing, display, flex, text, background, border, sizing
- Pseudo-class editing toggle: `[normal] [:hover] [:focus] [:active] [:disabled]`
- CSS Cascade view: shows all matching rules in cascade order, source, specificity, jump-to-definition
- "Add new rule for this element" creates rule scoped to current element in `style.css`

#### DOM Tree Panel
- Left sidebar, collapsible, default-on
- Mirrors document structure as a tree
- Click selects on canvas; canvas selection highlights tree node
- Drag to reorder
- Right-click for actions (wrap, delete, duplicate, edit tag)

#### Quick Tag Editor (Ctrl+T)
- Element selected → Ctrl+T pops a small editor at the element
- Tag name + attribute list editor
- Enter applies, Esc cancels

#### Wrap with Tag (Ctrl+Shift+W)
- Select element(s) → Ctrl+Shift+W pops "wrap in:" input
- Default suggestions: div, section, article, span, a, button

#### Linked Files Bar
- Strip above canvas, below page tabs
- Lists all `<link>` and `<script>` references for current page
- Status dots: loaded / missing / modified externally
- Click to open in Code view

#### Color Picker
- Used wherever a color value is needed
- HSL / RGB / HEX modes
- Eyedropper that samples canvas iframe
- Project palette (saved colors, stored in `.gstrap` under `palette`)
- Bootstrap palette presets

#### Library Items
- Drop-in linked snippets (see [Master Templates & Library Items](#master-templates--library-items))
- Library panel in Insert tab
- Right-click any selection → "Save as Library Item"
- Editing a library item updates all pages using it
- "Detach from library" copies HTML in place

#### Snippets
- Stored in `$XDG_CONFIG_HOME/GrapeStrap/snippets/` as folders with `.html`/`.css`/`.js` + metadata
- Snippets panel in Insert tab
- Right-click selection → "Save as snippet"
- Plugin-extendable via `registerSnippet`

#### Multi-Page Polish
- Open multiple pages simultaneously, each tab with its own state
- Tab reordering, middle-click close, context menu
- Per-tab view mode and Monaco scroll/cursor position preserved
- Asset manager panel (right side): list, preview, rename, delete, "where used"
- Page Properties dialog (General / SEO / Head / Template tabs)

#### Editor Polish
- Bootstrap class autocomplete in Monaco (custom completion provider with tooltips)
- Find / Replace in current file (Ctrl+F, Ctrl+H — Monaco built-in)
- Find / Replace across project (Ctrl+Shift+F): scoped, regex, results panel, edit-from-results
- Paste-with-inline-styles handler (warn + offer cleanup, map common styles to BS classes)
- Drag-to-resize with class snapping (columns and images first; generic sized divs after)

#### Plugin System
- **Replace Blob-URL plugin loader with `gstrap-plugin://` privileged protocol scheme** — registered pre-`whenReady` as standard+secure, served from disk via `protocol.handle`. Unblocks multi-file plugins: relative imports (`./helpers.js`, `./messages.json`) resolve correctly because the URL is hierarchical, unlike `blob:`. CSP `script-src` adds the scheme. v0.0.1 lang-en's inlined messages return to `import …json with { type: 'json' }` once this lands. Discovered during v0.0.1 first-launch verification (2026-04-27).
- User plugin folder loading enabled (`$XDG_CONFIG_HOME/GrapeStrap/plugins/`)
- Trust prompt on first load of an unrecognized plugin (shows manifest, install or reject)
- Plugins page in Preferences (list, enable/disable, view manifest, view load logs)
- Project-pinned plugins (`<project>/.grapestrap/plugins/`) supported
- Plugin development guide (`docs/PLUGIN-DEVELOPMENT.md`) with reference plugin example

#### Linux Packaging
- rpm builds added to release pipeline
- Flatpak manifest, initial Flathub submission
- AUR PKGBUILD published (community-maintained)

#### Documentation
- Keyboard shortcuts reference complete
- Sync policy explainer in onboarding and FAQ
- Plugin development guide with worked example

---

## Phase 3 — v0.1.0
**Weeks 9–13. Master Templates + Linux Polish + Public Launch.**

**Goal:** The version we tell the world about. v0.1.0 is "production-feasible for static site agencies and Linux web devs." Full announcement, press, demos.

**Released as:** `v0.1.0`. All formats: `.deb`, AppImage, rpm, tar.gz, Flatpak (Flathub published), Snap (Snap Store published).

### Deliverables

#### Master Templates (Full)
- Template editor mode (open `.gstrap-tpl` for editing)
- Editable region definitions (`data-grpstr-region="<id>"`)
- Region locking on child page edit (locked areas grayed and read-only)
- Change propagation: edit template → all child pages updated
- "Detach from template" operation
- New Page dialog with template selection
- Status bar shows: "Editing region: content (from default-master)"

#### Workspace Layouts
- Save current panel arrangement as named layout
- Switch between layouts
- Default layouts: "Designer," "Coder," "Compact"
- Layouts stored per-user in prefs

#### Preview in Browser
- Toolbar button + Ctrl+F12
- Configurable: detect installed Firefox, Chromium, Brave, Vivaldi
- Spawns project in browser at temp `file://` path
- Auto-reloads on save (using a tiny dev server with chokidar reload)

#### Git Status Indicator
- File manager shows modified / untracked / ignored dots next to files
- Status bar shows current branch and ahead/behind counts
- No commit UI in v0.1.0 (full Git in v0.2)

#### PHP Awareness
- Monaco PHP language mode for `.php` files
- Basic `<?php include ?>` recognition (highlights, doesn't resolve)
- Server-side preview deferred to v0.2

#### i18n Runtime
- i18next wired throughout
- All UI strings extracted to message catalog
- English shipped (`@grapestrap/lang-en`)
- Translation guide in `docs/translations/`
- Plugin API: `registerLanguage` for community translation packs

#### Crash Recovery
- File-based recovery (`.gstrap.recovery` next to project file)
- Recovery dialog on app launch if newer-than-saved state found
- Auto-save backup every 30 seconds while editing

#### Starter Templates
- Blank (master + index)
- Landing Page (hero, features, pricing, testimonials, CTA, footer)
- Portfolio (header, gallery with glightbox, about, contact)
- Blog (header, post list, sidebar, post detail, archive)

#### Linux Polish
- Snap manifest, Snap Store submission
- Wayland flag auto-detection verified across GNOME/KDE/Sway
- MIME type registration verified across Files (Nautilus), Dolphin, Thunar
- XDG compliance audit
- "No telemetry" pledge in README, About dialog, Preferences

#### Documentation Site
- GitHub Pages site at `grapestrap.org` (or `grapestrap.github.io`)
- Quick start, screenshots, video demo
- Plugin marketplace listing page (curated submissions)
- Translation status board
- Roadmap

#### Launch
- v0.1.0 announcement post
- Submit to: r/linux, r/webdev, r/opensource, Hacker News, Lobsters
- Reach out to Linux YouTube channels (DistroTube, The Linux Experiment, etc.)
- Set up Matrix room and GitHub Discussions
- Pin "first 10 plugin submissions" issue for community engagement

---

## Phase 4 — v0.2 and beyond

In priority order, post-launch:

- **Sass/Less compilation** with watch (Linux web devs use these heavily)
- **SFTP/FTP deploy** (with project-local credential storage, never cloud)
- **Full Git integration** (commit, push, diff, branch in editor)
- **Behaviors panel** (no-code interactions: show/hide, swap image, smooth scroll)
- **HTML/CSS validation** (W3C Nu validator integration, offline mode)
- **Broken link checker** (project-wide, on demand)
- **Color contrast / accessibility checker** (WCAG levels, fix suggestions)
- **Image editing** (crop, optimize, format convert)
- **Theme designer** (custom Bootstrap variables, generate `_variables.scss`)
- **Live bidirectional sync** (research project; only if community demand exists)
- **Light theme**
- **Windows/macOS builds** (community-driven; Linux-first stance preserved)
- **Real-time collaboration** (separate effort, possibly its own project)

---

## Block System Specification

### Tier 1: Layout Primitives (CWALabs forked plugin, loaded as `@grapestrap/blocks-bootstrap5`)

Used for: container, row, column, column_break, media_object, all forms, all interactive Bootstrap components.

**Why:** GrapesJS components with traits enforce structural rules. Columns know they go in rows, sizes are dropdowns, drag-drop snapping is correct.

**Customizations to our fork:**
- Tooltips on size dropdowns: `col-md-6` → "6 of 12 columns at md breakpoint and up (768px+)"
- Responsive variant traits: a column has size selectors for xs/sm/md/lg/xl/xxl breakpoints
- `col-xxl-*` support
- Default class output uses `col-md-X` (more responsive-by-default)

### Tier 2: Section Blocks (Raw HTML, Gramateria-style, loaded as `@grapestrap/blocks-sections`)

Used for: heroes, headers, footers, galleries, testimonials, contact forms, pricing, features, CTAs.

**Format:**
```javascript
{
  id: 'section-hero',
  label: 'Hero',
  category: 'Sections',
  attributes: { class: 'gly-hero' },
  content: `<section class="hero py-5">
    <div class="container">
      <h1 class="display-4 fw-bold">Welcome</h1>
      <p class="lead">A simple hero section.</p>
      <a href="#" class="btn btn-primary btn-lg">Get Started</a>
    </div>
  </section>`,
  dependencies: []
}
```

### Tier 3: Basic Content (Mixed, loaded as `@grapestrap/core-blocks`)

Text, image, button, link, list, table — extended with class-first traits.

---

## Style Manager Replacement Specification

Replaces GrapesJS's default Style Manager. Lives in the right-side Properties panel under the "Style" accordion.

### Pseudo-class State Bar (top of panel)

```
[ normal ] [ :hover ] [ :focus ] [ :active ] [ :disabled ]
```

Selecting a state filters the Style panel to show/edit rules for that state. When not normal, canvas displays a "Previewing :hover" strip. Generated CSS lives in `style.css` as `.element:hover { ... }`.

### Sub-panels

#### Spacing
- Margin: per side and combined (m-0 through m-5, m-auto, m-n1 through m-n5)
- Padding: same options for p-*

#### Display
- Display type: d-none, d-block, d-flex, d-inline, d-inline-block, d-grid, d-table
- Per-breakpoint responsive variants (sm/md/lg/xl/xxl)
- Visibility: invisible, visible

#### Flex (only enabled when display includes d-flex)
- Direction, wrap, justify, align-items, align-content, gap

#### Text
- Alignment, color, weight, style, size, transform, wrap

#### Background
- Color, subtle variants (BS 5.3+), gradient toggle

#### Border
- Sides, color, width (1–5), radius (0–5, circle, pill, per-corner), shadow

#### Sizing
- Width / height (25/50/75/100/auto, mw-100, vw-100, mh-100, vh-100)

### Cascade View (NEW)

For the selected element, displays all matching CSS rules in cascade order:

| Source | Selector | Specificity | Properties |
|---|---|---|---|
| inline | (style attribute) | 1000 | `color: red` |
| project | `.btn-primary` | 010 | `background: #0d6efd; color: #fff` |
| Bootstrap | `.btn-primary` | 010 | `background: var(--bs-btn-bg); ...` |
| inherited | `body` | 001 | `font-family: ...` |

- Click rule → jump to its definition in the appropriate code view
- "Add new rule for this element" creates a new entry in `style.css` scoped to the element

### Custom CSS Panel (Project-Global)

Separate accordion. Opens project-global `style.css` in a small Monaco instance.

- Full Monaco features (find/replace, autocomplete)
- Saves to `style.css` in project root
- Linked into all pages automatically

---

## Master Templates & Library Items

These are two distinct concepts. Both ship in v0.x but at different milestones.

### Master Templates (v0.1.0)

A master template defines reusable page chrome (navbar, footer, sidebar) with **editable regions** that child pages fill in.

**Per page:** at most one master template (or none, for standalone pages).

**Region definition** (in template HTML): `data-grpstr-region="<id>"`.

**Editing modes:**
- Open template directly → all elements editable, regions visible as drop zones
- Open page using template → template areas locked (gray, read-only), regions editable
- Status bar: "Editing region: content (from default-master)"
- Right-click locked area → "Edit master template"

**Detaching:** Right-click page → "Detach from template" copies the rendered HTML in place, removes template reference.

### Library Items (v0.0.2)

Library Items are arbitrary linked snippets. Different from master templates:

| | Master Template | Library Item |
|---|---|---|
| Scope | Page-level chrome | Component-level snippet |
| Per-page | At most one | Many, can nest |
| Editable regions | Yes (defined in template) | Whole item is the unit |
| Locking on use | Template areas locked, regions editable | Library item locked, "Detach to edit in place" |
| Use case | Site nav + footer + layout | Reusable "site footer," "contact CTA," "newsletter form" |

**Storage in project file:**
```json
{
  "libraryItems": [
    {
      "id": "site-footer",
      "label": "Site Footer",
      "html": "<footer class=\"py-4 bg-dark text-white\">...</footer>"
    }
  ]
}
```

**Insertion:** Page stores a reference, not a copy:
```html
<div data-grpstr-library="site-footer"></div>
```

On render and export, library item HTML is inlined.

**Editing:** Editing a library item updates all pages that use it. "Detach from library" copies current HTML in place, removes the reference.

### Why both

DW shipped both for a reason. Master templates handle "every page has the same nav and footer." Library Items handle "this component appears on a few pages and I want to update it once."

---

## Plugin API Specification

See [Plugin Architecture](#plugin-architecture) for the high-level model. Detailed API surface here.

### Plugin Entry

```javascript
// plugins/my-plugin/index.js
export default function register(api) {
  api.log.info(`Loading ${api.manifest.name}`)

  api.registerBlock({
    id: 'my-block',
    label: 'My Block',
    category: 'Common',
    content: '<div class="p-3 bg-light">Hello</div>',
    dependencies: []
  })

  api.registerCommand({
    id: 'my-plugin.do-thing',
    label: 'Do The Thing',
    handler: () => {
      api.notify.success('Did the thing.')
    },
    defaultBinding: 'Ctrl+Alt+T'
  })

  api.on('element:selected', (element) => {
    api.log.info(`Selected: ${element.tagName}`)
  })
}
```

### Lifecycle Events

- `app:ready` — main editor mounted, plugins loaded
- `project:opened` / `project:closed` / `project:saved`
- `tab:opened` / `tab:closed` / `tab:focused`
- `element:selected` / `element:deselected`
- `element:before-add` / `element:after-add` (cancellable via return false)
- `element:before-remove` / `element:after-remove`
- `viewmode:changed`
- `device:changed`
- `export:before` / `export:after`

### File System Access (sandboxed)

```javascript
// Plugin gets a folder under XDG_DATA_HOME/GrapeStrap/plugin-data/<plugin-name>/
api.fs.readFile('settings.json')
api.fs.writeFile('settings.json', { ... })
api.fs.listDir('cache/')
api.fs.deleteFile('cache/old.json')
// Cannot reach outside its own data folder
```

### Permissions (declared in manifest)

For v0.1, permissions are advisory (logged, shown in trust prompt, not enforced). v0.2 may enforce.

```json
{
  "permissions": [
    "project:read",
    "project:write",
    "fs:plugin-data",
    "network:fetch"
  ]
}
```

---

## Project File Format (.gstrap)

JSON manifest + sibling files on disk. Avoids monolithic JSON for git-friendliness.

### Disk Layout

```
my-project/
├── my-project.gstrap         ← manifest (JSON)
├── style.css                 ← extracted globalCSS
├── pages/
│   ├── index.html
│   ├── about.html
│   └── contact.html
├── templates/                ← v0.1.0
│   └── default-master.html
├── library/                  ← v0.0.2
│   └── site-footer.html
└── assets/
    ├── images/
    ├── fonts/
    └── videos/
```

### Manifest (`my-project.gstrap`)

```json
{
  "version": "1.0",
  "format": "grapestrap-project",
  "metadata": {
    "name": "My Project",
    "created": "2026-04-26T22:00:00Z",
    "modified": "2026-04-26T22:30:00Z",
    "lastSavedAt": "2026-04-26T22:30:00Z",
    "appVersion": "0.1.0"
  },
  "pages": [
    {
      "name": "index",
      "file": "pages/index.html",
      "templateName": "default-master",
      "regions": { "content": "<h1>Welcome</h1>" },
      "head": {
        "title": "Home",
        "description": "Welcome page",
        "customMeta": [],
        "customLinks": [],
        "customScripts": []
      }
    }
  ],
  "templates": [
    { "name": "default-master", "file": "templates/default-master.html" }
  ],
  "libraryItems": [
    { "id": "site-footer", "label": "Site Footer", "file": "library/site-footer.html" }
  ],
  "globalCSS": "style.css",
  "palette": ["#0d6efd", "#6610f2", "#d63384"],
  "assets": [],
  "vendorDeps": ["splidejs", "glightbox"],
  "plugins": [
    { "name": "@grapestrap/blocks-bootstrap5", "version": "0.1.0" },
    { "name": "@grapestrap/blocks-sections", "version": "0.1.0" }
  ],
  "preferences": {
    "exportMinify": false,
    "exportBundleBootstrap": true,
    "exportIncludeComments": false
  }
}
```

### Why pages-on-disk

Three reasons:
1. **Git-friendly diffs.** Editing one page produces a one-file diff, not a 50KB JSON blob diff.
2. **External editor support.** A user can edit `pages/about.html` in vim, chokidar picks it up, GrapeStrap reloads.
3. **Scale.** A 100-page project fits comfortably; a 100-page JSON does not.

### Export Output Structure

```
export/
├── index.html
├── about.html
├── contact.html
├── css/
│   ├── bootstrap.min.css       ← bundled if "Bundle Bootstrap" enabled
│   └── style.css
├── js/
│   ├── bootstrap.bundle.min.js
│   └── ...custom scripts
└── assets/
    ├── images/
    ├── fonts/
    ├── videos/
    ├── canvas-icons/           ← only if used
    └── vendor/                 ← Splide, GLightbox, etc., only if used
```

---

## Keyboard Shortcuts (Complete)

### File Operations
| Shortcut | Action |
|---|---|
| Ctrl+N | New Project |
| Ctrl+Shift+N | New Page |
| Ctrl+O | Open Project |
| Ctrl+S | Save current page/template |
| Ctrl+Shift+S | Save As |
| Ctrl+E | Export project |
| Ctrl+W | Close current tab |
| Ctrl+Shift+T | Reopen closed tab |
| Ctrl+Q | Quit |

### Edit Operations
| Shortcut | Action |
|---|---|
| Ctrl+Z / Ctrl+Shift+Z | Undo / Redo |
| Ctrl+X / C / V | Cut / Copy / Paste |
| Ctrl+A | Select All |
| Ctrl+D | Duplicate selected element |
| Delete | Delete selected element |
| Esc | Deselect / close active modal |
| Ctrl+F | Find (current file) |
| Ctrl+H | Replace (current file) |
| Ctrl+Shift+F | Find in project |
| Ctrl+G | Go to line (Monaco) |
| Ctrl+P | Quick file open |
| **Ctrl+T** | **Quick Tag Editor** *(v0.0.2)* |
| **Ctrl+Shift+W** | **Wrap with Tag** *(v0.0.2)* |
| Ctrl+, | Preferences |

### View Modes
| Shortcut | Action |
|---|---|
| Ctrl+1 | Design view |
| Ctrl+2 | Code view |
| Ctrl+3 | Split view |

### Panels
| Shortcut | Action |
|---|---|
| Ctrl+B | Toggle file manager |
| **Ctrl+Shift+O** | **Toggle DOM tree panel** *(v0.0.2)* |
| Ctrl+J | Toggle properties panel |
| Ctrl+\` | Toggle Property Inspector strip |
| Ctrl+I | Toggle Insert panel |
| Ctrl+Shift+P | Command palette |
| Ctrl+Shift+E | Focus file manager |
| F11 | Toggle fullscreen |

### Page Navigation
| Shortcut | Action |
|---|---|
| Ctrl+Tab / Ctrl+Shift+Tab | Cycle tabs |
| Ctrl+PgUp / Ctrl+PgDn | Cycle tabs (alt) |

### Responsive Preview
| Shortcut | Action |
|---|---|
| Ctrl+R | Toggle responsive preview |
| Ctrl+Alt+1 / 2 / 3 | Desktop / Tablet / Mobile |
| **Ctrl+F12** | **Preview in Browser** *(v0.1.0)* |

### Code Editor (Monaco built-ins)
| Shortcut | Action |
|---|---|
| Ctrl+/ | Toggle line comment |
| Ctrl+Shift+K | Delete line |
| Alt+↑/↓ | Move line up/down |
| Ctrl+] / [ | Indent / outdent |
| Ctrl+Space | Trigger autocomplete |
| Ctrl+Shift+L | Format document |
| **Ctrl+Alt+↓** | **Multi-cursor next occurrence** |

### Disabled Defaults (overridden)
- Ctrl+R (default reload)
- F5 (default reload)
- Ctrl+Shift+R (only enabled with `--dev` flag)

### Rebinding UI

Preferences > Keyboard Shortcuts shows the full table with editable bindings. Conflict detection: assigning a shortcut already in use shows the conflict and asks to override.

---

## UI Layout Specification

### Top-Level Renderer Layout (NOT inside Golden Layout)

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOOLBAR (50px)                                                     │
│  [New][Open][Save] [Undo][Redo] │ [Design][Code][Split]            │
│  [Devices: D|T|M] [Insert ▾] [Preview]                             │
├─────────────────────────────────────────────────────────────────────┤
│  PAGE TABS (32px)   ▼ index ● │ about │ + new                      │
├─────────────────────────────────────────────────────────────────────┤
│  LINKED FILES BAR (24px, v0.0.2)                                    │
│  📄 bootstrap.min.css  📄 style.css  ⚙ bootstrap.bundle.min.js    │
├──────────┬─────────────────────────────────┬────────────────────────┤
│          │                                 │                        │
│  GOLDEN LAYOUT REGION                                              │
│                                                                     │
│  Default arrangement:                                              │
│  ┌────────┬──────────┬──────────────────┬──────────┐              │
│  │FILE MGR│DOM TREE  │CANVAS / CODE     │PROPERTIES│              │
│  │+ pages │(v0.0.2)  │(view-mode-driven)│+ Style   │              │
│  │+ tplts │          │                  │+ Cascade │              │
│  │+ lib   │          │                  │  (v0.0.2)│              │
│  │+ snip  │          │                  │+ Custom  │              │
│  │        │          │                  │  CSS     │              │
│  └────────┴──────────┴──────────────────┴──────────┘              │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  INSERT PANEL (90px, tabs)                                          │
│  Common | Layout | Forms | Text | Media | Sections | Library | Snippets │
├─────────────────────────────────────────────────────────────────────┤
│  PROPERTY INSPECTOR STRIP (48px, context-aware)                     │
├─────────────────────────────────────────────────────────────────────┤
│  STATUS BAR (24px)                                                  │
│  path • cursor • selector • device • saved • git status            │
└─────────────────────────────────────────────────────────────────────┘
```

The toolbar, page tabs, Linked Files bar, Insert panel, Property Inspector strip, and status bar are NOT inside Golden Layout — they're fixed regions of the renderer DOM. Golden Layout governs only the central panel area.

### Color Palette (Dark Theme)

```
--bg-1:    #1e1e1e   (canvas background)
--bg-2:    #252526   (panel background)
--bg-3:    #2d2d2d   (toolbar / header / strip)
--bg-4:    #333333   (hover states)
--border:  #3e3e42
--text-1:  #cccccc   (primary)
--text-2:  #858585   (secondary / disabled)
--text-3:  #6c6c6c   (placeholder)
--accent:  #0078d4   (selection / active)
--accent-2:#106ebe   (accent hover)
--success: #4ec9b0
--warning: #dcdcaa
--error:   #f48771
--info:    #569cd6
```

### Fonts (Bundled, not CDN)

- **UI:** Inter (variable font, woff2)
- **Code:** JetBrains Mono (woff2)
- **Status bar / strip:** Inter at 12px

### Empty States

| State | Display |
|---|---|
| No project open | Centered card "Open a project or create a new one" with two buttons |
| Project open, no tabs | "Select a page from the file manager" |
| File manager empty subfolder | "This folder is empty" with context-sensitive new button |
| Property Inspector, no element | "Select an element to edit its properties" |
| Insert panel search no results | "No blocks match '<query>'" |
| DOM tree, no element | "No element selected" |

---

## Linux Community Commitments

GrapeStrap is built for and by the Linux community. We commit to:

### What we will NOT do
- Telemetry, analytics, phone-home of any kind
- Auto-updater that nags or installs without consent
- Account creation or sign-in for any base feature
- Locked features behind a paid tier
- Vendor lock-in: project format is open JSON + plain HTML/CSS, exports are flat HTML/CSS, plugin API is documented and stable

### What we WILL do
- Distribute via Flathub, Snap Store, AUR, GitHub Releases — all free
- Respect XDG Base Directory specification
- Auto-detect Wayland and run natively where available
- Register MIME type for `.gstrap`
- Translate to any language a community translator submits
- Maintain CONTRIBUTING.md, ARCHITECTURE.md, PLUGIN-DEVELOPMENT.md
- Curate a public plugin list at `grapestrap.org/plugins`
- Run a Matrix room and GitHub Discussions
- Triage issues weekly during active development
- Document architectural decisions as ADRs in `docs/decisions/`
- Sign releases with a stable GPG key, publish key fingerprint

### Project Governance
- **v0.x:** BDFL model (founding maintainer)
- **v1.0+:** Steering committee considered once contributor base stabilizes (3+ regular contributors)
- **Code of Conduct:** Contributor Covenant 2.1 from day 1
- **Decisions:** ADR format in `docs/decisions/`, public discussion before locking

### Funding (transparent)
GrapeStrap will not have ads, sponsored placements in the editor, or premium features. If funding is sought, it will be:
- GitHub Sponsors / Open Collective / Liberapay (transparent, opt-in)
- Optional paid support contracts for organizations
- Never via the editor UI itself

---

## Development Milestones

| Phase | Target | Release | Deliverable |
|---|---|---|---|
| **v0.0.1** | Weeks 1–4 | alpha | Walking skeleton + single-page editing. `.deb`, AppImage, tar.gz. Plugin host + built-ins-as-plugins from day 1. |
| **v0.0.2** | Weeks 5–8 | beta | Multi-page + DW tools (DOM panel, Quick Tag, Wrap, Linked Files, Cascade, pseudo-class, Library Items, snippets, color picker, autocomplete) + full Style Manager + user plugins. rpm + Flatpak added. |
| **v0.1.0** | Weeks 9–13 | public launch | Master templates, workspace layouts, Preview in Browser, Git status, PHP awareness, i18n runtime, crash recovery, starter templates. Snap published, Flathub published. Public announcement. |
| **v0.2.x** | Post-launch | rolling | Sass/Less, SFTP, full Git, Behaviors, validation, accessibility, image edit, theme designer. Light theme. Cross-platform if community demand. |

**Walking-skeleton-first remains.** v0.0.1 must work end-to-end (open → edit → save → reopen → export) before any v0.0.2 feature lands. After v0.0.1 ships, gate each v0.0.2 feature behind regression tests on the Playwright smoke suite.

---

## Handoff to Claude Code

```bash
cd /home/numb1/projects/grapestrap
```

Then hand it this build plan with the directive:

> Build GrapeStrap per `GRAPESTRAP_BUILD_PLAN_v4.md`. Goal: Linux gets a real Dreamweaver alternative. Begin Phase 1 (v0.0.1) — walking skeleton. Set up:
>
> 1. Electron main process with the locked security posture (sandbox, contextIsolation, nodeIntegration:false, CSP, override Ctrl+R/F5)
> 2. Preload bridge per Step 1.3 of v3 (still applies)
> 3. Vite + vite-plugin-electron build
> 4. XDG Base Directory module — config to `$XDG_CONFIG_HOME/GrapeStrap/`, log to `$XDG_DATA_HOME/GrapeStrap/logs/`
> 5. Wayland auto-detection in main process startup
> 6. Plugin host skeleton — discover and load from bundled `plugins/` folder, validate manifests, wire API surface
> 7. Refactor all built-ins as plugins from the start: `@grapestrap/core-blocks`, `@grapestrap/blocks-bootstrap5` (forked CWALabs), `@grapestrap/blocks-sections`, `@grapestrap/exporter-flat`
> 8. Basic HTML shell loading GrapesJS, ability to save/load `.gstrap` JSON files (with sibling pages on disk)
> 9. Code-authoritative-when-active sync between Monaco and canvas
> 10. Playwright E2E test: open project → drag block → save → reopen → assert block present
>
> Use the locked technical decisions table — no substitutions. Fork CWALabs/grapesjs-blocks-bootstrap5 to my GitHub org and use the fork. Set up Monaco's Web Worker config explicitly for Electron's `file://` protocol.
>
> After M1 works end-to-end (verified by the Playwright smoke test), stop and confirm before proceeding to Phase 2.

---

## Final Notes

- Every CDN URL in shipped code is a thinking error. Bootstrap, Font Awesome, Google Fonts, Splide, GLightbox — all bundled locally, all in exports.
- Disk is source of truth. localStorage is not used for recovery; file-based `.gstrap.recovery` is.
- All renderer fs/network calls go through preload — never direct Node access from renderer.
- electron-log writes to `$XDG_DATA_HOME/GrapeStrap/logs/main.log`.
- electron-store writes to `$XDG_CONFIG_HOME/GrapeStrap/preferences.json`.
- MIT license matches GrapesJS, CWALabs, Gramateria, Bootstrap, Font Awesome — clean for open-source release.
- Name: GrapeStrap = GrapesJS + Bootstrap.
- Built for Linux, by someone who thinks Linux deserves it.
- v0.0.1 in 4 weeks. v0.1.0 in 13 weeks. Public launch when v0.1.0 ships, not before.
