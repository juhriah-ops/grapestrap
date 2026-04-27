# Plugin Development Guide

GrapeStrap is a thin host with a rich plugin API. **Every block, section, panel, and exporter that ships is itself a plugin.** This means the API is real from day 1, the community can replace any built-in, and your plugin loads identically to the bundled ones.

This guide walks you through writing a plugin: the manifest, the API surface, the lifecycle, a complete worked example, distribution, and the trust model. By the end you should be able to publish `@yourname/blocks-bulma` (or whatever) and have it Just Work.

If you haven't read [ARCHITECTURE.md](./ARCHITECTURE.md), skim its [Plugin host](./ARCHITECTURE.md#plugin-host) section first. The full API spec is also in the [build plan](../GRAPESTRAP_BUILD_PLAN_v4.md#plugin-api-specification).

---

## Table of contents

1. [Plugin types](#plugin-types)
2. [Anatomy of a plugin](#anatomy-of-a-plugin)
3. [The manifest (`grapestrap.json`)](#the-manifest-grapestrapjson)
4. [The entry function](#the-entry-function)
5. [API surface](#api-surface)
6. [Lifecycle events](#lifecycle-events)
7. [Sandboxed file system](#sandboxed-file-system)
8. [Preferences](#preferences)
9. [Logging](#logging)
10. [Notifications](#notifications)
11. [Worked example: a "Quote" block plugin](#worked-example-a-quote-block-plugin)
12. [Plugin folder structure](#plugin-folder-structure)
13. [Loading and discovery](#loading-and-discovery)
14. [Distribution](#distribution)
15. [Trust model](#trust-model)
16. [API stability and semver](#api-stability-and-semver)
17. [Debugging plugins](#debugging-plugins)
18. [Cookbook: common patterns](#cookbook-common-patterns)
19. [What plugins should NOT do](#what-plugins-should-not-do)

---

## Plugin types

A plugin's manifest declares one `type`. The host uses this for marketplace categorisation and trust prompts; functionally a plugin can register any combination of things, but `type` reflects the primary purpose.

| Type            | Purpose                                                |
|-----------------|--------------------------------------------------------|
| `block`         | Draggable element in the Insert panel                  |
| `section`       | Pre-built section (raw HTML, drag to insert)           |
| `panel`         | Custom panel registered with Golden Layout             |
| `exporter`      | Custom export target (Hugo, Jekyll, 11ty, etc.)        |
| `theme`         | Color palette / icon overrides for editor chrome       |
| `language`      | i18n translation pack                                  |
| `command`       | Keyboard-bindable action                               |
| `snippet-pack`  | Bundle of reusable code snippets                       |

Examples of bundled built-ins by type:

- `@grapestrap/core-blocks` — `block`
- `@grapestrap/blocks-bootstrap5` — `block`
- `@grapestrap/blocks-sections` — `section`
- `@grapestrap/exporter-flat` — `exporter`
- `@grapestrap/lang-en` — `language`

---

## Anatomy of a plugin

The minimum a plugin needs is a folder with two files:

```
my-plugin/
├── grapestrap.json     ← manifest
└── index.js            ← entry — exports a default `register(api)` function
```

That's it. Drop that folder into `$XDG_CONFIG_HOME/GrapeStrap/plugins/`, restart GrapeStrap, accept the trust prompt, and the plugin is live.

A typical plugin grows from there:

```
my-plugin/
├── grapestrap.json
├── index.js
├── package.json        ← if you publish to npm
├── README.md
├── LICENSE
├── src/
│   ├── blocks/
│   ├── commands/
│   └── styles/
├── assets/
│   └── icons/
└── tests/
```

---

## The manifest (`grapestrap.json`)

Every plugin has a `grapestrap.json` at its root. Required and optional fields:

```json
{
  "name": "@yourname/quote-block",
  "version": "0.1.0",
  "displayName": "Quote Block",
  "description": "A blockquote with author attribution and a fancy command.",
  "author": "Your Name <you@example.com>",
  "license": "MIT",
  "type": "block",
  "main": "index.js",
  "grapestrapVersion": "^0.1.0",
  "homepage": "https://github.com/yourname/grapestrap-quote-block",
  "repository": "https://github.com/yourname/grapestrap-quote-block",
  "keywords": ["quote", "blockquote", "typography"],
  "dependencies": {},
  "permissions": []
}
```

### Field reference

| Field                | Required | Notes                                                                                               |
|----------------------|----------|-----------------------------------------------------------------------------------------------------|
| `name`               | yes      | npm-style scoped name. Scope with your own user/org (`@yourname/...`). Globally unique.             |
| `version`            | yes      | Semver. Bumped per release.                                                                         |
| `displayName`        | yes      | Human-readable, shown in Preferences > Plugins and in the marketplace.                              |
| `description`        | yes      | One sentence. Shown in trust prompt and marketplace.                                                |
| `author`             | yes      | "Name <email>" — email optional but encouraged.                                                     |
| `license`            | yes      | SPDX identifier. We strongly prefer MIT or another permissive license for ecosystem compatibility.  |
| `type`               | yes      | One of [the plugin types](#plugin-types).                                                           |
| `main`               | yes      | Relative path to the entry file. Usually `index.js` or `dist/index.js`.                             |
| `grapestrapVersion`  | yes      | Semver range the plugin is compatible with. Host refuses to load if the running version doesn't match. |
| `homepage`           | no       | URL.                                                                                                |
| `repository`         | no       | Source URL.                                                                                         |
| `keywords`           | no       | For marketplace search.                                                                             |
| `dependencies`       | no       | Bundled npm deps if you ship a `node_modules/`. We recommend bundling instead.                      |
| `permissions`        | no       | Declared (advisory in v0.1, may be enforced v0.2+) — see [Trust model](#trust-model).               |

The host's `manifest-validator.js` rejects manifests missing required fields, with mismatched semver, with unknown plugin `type`, or with malformed scoped names.

---

## The entry function

Your `main` file (`index.js` by convention) **must default-export a function** that takes the API object:

```javascript
// index.js
export default function register(api) {
  // do registration here
}
```

The host calls this once, after all bundled plugins have been loaded but before the welcome dialog. Any registrations you make are immediately available.

If you throw, the host catches the error, logs it under your plugin's logger, and shows a non-fatal toast. Other plugins continue to load.

---

## API surface

The `api` argument is your interface to the editor. Here is the complete public surface for v0.1.

### Manifest (read-only)

```javascript
api.manifest
// {
//   name: '@yourname/quote-block',
//   version: '0.1.0',
//   displayName: 'Quote Block',
//   ...
// }
```

Frozen. You can read it for self-reference (e.g. when building UI that says "Settings for <plugin name>").

### Registration

```javascript
api.registerBlock({ id, label, category, content, dependencies, traits, attributes, media })
api.registerSection({ id, label, content, dependencies, preview })
api.registerPanel({ id, title, component, defaultLocation })
api.registerExporter({ id, label, exportFn })
api.registerCommand({ id, label, handler, defaultBinding })
api.registerSnippet({ id, label, content, language })
api.registerLanguage({ code, name, messages })
```

#### `registerBlock`

Adds a draggable block to the Insert panel.

```javascript
api.registerBlock({
  id: 'quote',                              // unique within plugin
  label: 'Quote',                           // shown in Insert panel
  category: 'Common',                       // Insert panel tab
  content: '<blockquote class="...">...</blockquote>',  // HTML or GrapesJS component config
  attributes: { class: 'gly-quote' },       // Insert panel item attrs
  media: '<svg>...</svg>',                  // optional icon for Insert panel tile
  dependencies: [],                         // see Lazy dependencies below
  traits: []                                // GrapesJS trait list, optional
})
```

`content` can be a raw HTML string (simplest) or a GrapesJS component config object (more control over traits, drop targets, etc.). For most blocks, a string is fine.

#### `registerSection`

Like a block, but for the Sections tab of the Insert panel and intended as full-width chunks (heroes, headers, footers).

```javascript
api.registerSection({
  id: 'hero-centered',
  label: 'Centered Hero',
  content: `<section class="hero py-5"><div class="container text-center">...</div></section>`,
  preview: 'assets/preview-hero.png',       // optional thumbnail
  dependencies: []
})
```

#### `registerPanel`

Adds a panel to Golden Layout. The panel `component` is a function taking a container element and returning a teardown function.

```javascript
api.registerPanel({
  id: 'quote-stats',
  title: 'Quote Stats',
  defaultLocation: 'right',                  // 'left' | 'right' | 'bottom' | 'detached'
  component: (container) => {
    container.innerHTML = '<div class="p-3">No quotes yet.</div>'
    const handler = () => { /* update */ }
    api.on('element:after-add', handler)
    return () => {
      api.off('element:after-add', handler)
      container.innerHTML = ''
    }
  }
})
```

#### `registerExporter`

Adds an export target to the Export dialog. Your `exportFn` receives the project and writes output.

```javascript
api.registerExporter({
  id: 'hugo',
  label: 'Hugo (Static Site)',
  exportFn: async (project, outputDir) => {
    // project: { metadata, pages, templates, libraryItems, globalCSS, palette, assets }
    // outputDir: absolute path the user picked
    for (const page of project.pages) {
      const frontMatter = `---\ntitle: "${page.head.title}"\n---\n\n`
      const body = page.html
      await api.fs.writeFile(`${outputDir}/content/${page.name}.md`, frontMatter + body)
    }
    api.notify.success('Exported to Hugo format.')
  }
})
```

#### `registerCommand`

Adds a keyboard-bindable, command-palette-discoverable action.

```javascript
api.registerCommand({
  id: 'quote-block.fancy-quote',
  label: 'Fancy Quote',
  handler: () => { /* do thing */ },
  defaultBinding: 'Ctrl+Alt+Q'              // optional; user can rebind in Preferences
})
```

#### `registerSnippet`

Adds a code snippet to the Snippets tab of the Insert panel (v0.0.2+).

```javascript
api.registerSnippet({
  id: 'quote-html',
  label: 'Blockquote HTML',
  content: '<blockquote class="blockquote">...</blockquote>',
  language: 'html'
})
```

#### `registerLanguage`

For language plugins (i18n translation packs).

```javascript
api.registerLanguage({
  code: 'fr',
  name: 'Français',
  messages: { 'menu.file': 'Fichier', /* ... */ }
})
```

### UI extension

```javascript
api.addMenuItem({ menu, label, command, position })
api.addStatusBarItem({ id, render })
api.addToolbarButton({ id, label, icon, command })
```

#### `addMenuItem`

Adds an entry to a native menu. `menu` is one of `'file' | 'edit' | 'view' | 'insert' | 'help'`. `command` references a registered command id. `position` controls placement (`'top' | 'bottom' | { after: 'commandId' }`).

```javascript
api.addMenuItem({
  menu: 'insert',
  label: 'Fancy Quote',
  command: 'quote-block.fancy-quote',
  position: 'bottom'
})
```

#### `addStatusBarItem`

Adds a custom item to the right side of the status bar. `render` returns an HTML element.

```javascript
api.addStatusBarItem({
  id: 'quote-count',
  render: () => {
    const span = document.createElement('span')
    span.textContent = '0 quotes'
    api.on('element:after-add', () => {
      const count = api.editor.getWrapper().find('blockquote').length
      span.textContent = `${count} quotes`
    })
    return span
  }
})
```

#### `addToolbarButton`

Adds a button to the main toolbar. `icon` is a Bootstrap Icons class (no Font Awesome — Bootstrap Icons are the chrome icon set; Font Awesome is for canvas content).

```javascript
api.addToolbarButton({
  id: 'fancy-quote-btn',
  label: 'Fancy Quote',
  icon: 'bi bi-quote',
  command: 'quote-block.fancy-quote'
})
```

### Events

```javascript
api.on(event, handler)
api.off(event, handler)
```

See [Lifecycle events](#lifecycle-events) for the full list.

Handlers are auto-cleaned-up when the plugin is disabled or uninstalled — but you should still call `api.off` in any teardown logic to avoid double-fires during hot reload.

### Editor access

```javascript
api.editor       // GrapesJS instance
api.monaco       // Monaco namespace (for completion providers, language modes)
api.project      // read access to current project state
api.activeTab    // currently focused page tab descriptor
```

`api.editor` is a real GrapesJS instance. You can read components, traverse the model, attach event listeners. **For mutations**, prefer the API helpers and event-driven patterns; mutating GrapesJS internals directly works but couples your plugin to GrapesJS internals that may shift across versions.

`api.monaco` gives you the Monaco namespace for things like `monaco.languages.registerCompletionItemProvider`. Use sparingly.

`api.project` is a snapshot of the current project. It's a **read-only view** — to mutate the project, fire events or use higher-level helpers (saving the project, opening pages) which the host coordinates.

### Sandboxed I/O

```javascript
api.fs           // sandboxed to plugin's data dir under XDG_DATA_HOME
api.notify       // toast helper
api.log          // electron-log child logger named for this plugin
api.preferences  // get/set plugin-namespaced prefs
```

See sections below.

---

## Lifecycle events

Subscribe via `api.on(event, handler)`. Handlers are sync unless they return a Promise (handled where supported — e.g. `export:before` will await your handler).

| Event                     | Payload                                | Notes                                                       |
|---------------------------|----------------------------------------|-------------------------------------------------------------|
| `app:ready`               | `()`                                   | All plugins loaded, editor mounted, ready for user.         |
| `project:opened`          | `(project)`                            | After file load, before first tab opens.                    |
| `project:closed`          | `()`                                   | After all tabs are closed.                                  |
| `project:saved`           | `(project)`                            | After successful save flush.                                |
| `tab:opened`              | `(tab)`                                | Page tab created.                                           |
| `tab:closed`              | `(tab)`                                | Page tab closed.                                            |
| `tab:focused`             | `(tab)`                                | Active tab changed.                                         |
| `element:selected`        | `(element)`                            | Canvas element selected (or selection moved).               |
| `element:deselected`      | `()`                                   | Selection cleared.                                          |
| `element:before-add`      | `(element)`                            | Cancellable: return `false` to prevent.                     |
| `element:after-add`       | `(element)`                            | After insertion.                                            |
| `element:before-remove`   | `(element)`                            | Cancellable.                                                |
| `element:after-remove`    | `(element)`                            | After removal.                                              |
| `viewmode:changed`        | `({ tab, mode })`                      | `mode` is `'design' | 'code' | 'split'`.                    |
| `device:changed`          | `({ tab, device })`                    | `device` is `'desktop' | 'tablet' | 'mobile'`.              |
| `export:before`           | `({ project, outputDir, exporterId })` | Awaited — return a Promise to delay export.                 |
| `export:after`            | `({ project, outputDir, exporterId })` | After export completes.                                     |

---

## Sandboxed file system

Every plugin gets a folder at `$XDG_DATA_HOME/GrapeStrap/plugin-data/<plugin-name>/`. The host creates it lazily on first `api.fs` call. The plugin **cannot reach outside** this folder via the API — paths with `..` or absolute paths are rejected.

```javascript
await api.fs.readFile('settings.json')              // returns string, throws if missing
await api.fs.writeFile('settings.json', '{...}')    // creates file or overwrites
await api.fs.exists('cache/thumb.png')              // returns boolean
await api.fs.listDir('cache/')                      // returns string[]
await api.fs.deleteFile('cache/old.json')
await api.fs.mkdir('cache/')                        // recursive
```

All methods return Promises. JSON helpers:

```javascript
const settings = await api.fs.readJSON('settings.json')   // parses for you
await api.fs.writeJSON('settings.json', { foo: 1 })       // serialises for you
```

For larger blobs (images, archives), use `readBinary` / `writeBinary`:

```javascript
const buf = await api.fs.readBinary('cache/thumb.png')    // returns Uint8Array
await api.fs.writeBinary('cache/thumb.png', buf)
```

If you need to reach outside your sandbox (read user project files, write to assets/), do it through `api.project` and `api.editor` APIs, **not** by trying to escape the sandbox. The host will reject the path.

---

## Preferences

Plugins can persist small settings without using the file system. Stored under your plugin's namespace in the global preferences file (`$XDG_CONFIG_HOME/GrapeStrap/preferences.json`).

```javascript
const value = api.preferences.get('quoteStyle', 'fancy')   // default if unset
api.preferences.set('quoteStyle', 'simple')
api.preferences.observe('quoteStyle', (newValue, oldValue) => {
  // react to change, e.g. from a Preferences dialog
})
api.preferences.delete('quoteStyle')
```

Use preferences for: small user settings (style toggles, default options, last-used choices). Use `api.fs` for: anything bigger, anything binary, anything you want to back up separately.

---

## Logging

Each plugin gets a child logger from electron-log, prefixed with the plugin name in the logfile.

```javascript
api.log.info('Plugin starting up')
api.log.warn('Configuration option X is deprecated')
api.log.error('Failed to parse settings.json', err)
api.log.debug('Detailed trace info')   // only emitted in dev mode
```

Logs go to `$XDG_DATA_HOME/GrapeStrap/logs/main.log`. The Preferences > Plugins page shows recent log entries for each plugin, useful for debugging without opening the file.

---

## Notifications

Surface short, ephemeral messages to the user via Notyf-backed toasts.

```javascript
api.notify.success('Block inserted.')
api.notify.error('Failed to load section: missing dependency.')
api.notify.info('Tip: try Ctrl+Alt+Q to insert a fancy quote.')
api.notify.warning('This will overwrite your existing settings.')
```

For modal confirmations, use the renderer's dialog API (exposed by command handlers, not all plugin code paths). Reach for `notify` for non-blocking feedback only.

---

## Worked example: a "Quote" block plugin

This is a complete, plausible plugin. It registers:

- A custom **"Quote" block** — a styled blockquote with author attribution.
- A **"Fancy Quote" command** that inserts a more elaborate variant.
- A **status-bar quote count** that updates as quotes are added or removed.

Folder structure:

```
quote-block/
├── grapestrap.json
├── index.js
├── package.json          ← only needed if publishing to npm
├── README.md
├── LICENSE
└── src/
    └── styles.css        ← the quote's stylesheet, registered as a snippet
```

### `grapestrap.json`

```json
{
  "name": "@yourname/quote-block",
  "version": "0.1.0",
  "displayName": "Quote Block",
  "description": "A blockquote with author attribution, plus a fancy variant.",
  "author": "Your Name <you@example.com>",
  "license": "MIT",
  "type": "block",
  "main": "index.js",
  "grapestrapVersion": "^0.1.0",
  "homepage": "https://github.com/yourname/grapestrap-quote-block",
  "repository": "https://github.com/yourname/grapestrap-quote-block",
  "keywords": ["quote", "blockquote", "typography"],
  "permissions": []
}
```

### `index.js`

```javascript
// index.js
// @yourname/quote-block — registers a Quote block and a "fancy-quote" command.

const QUOTE_HTML = `
<blockquote class="blockquote border-start border-4 border-primary ps-3 my-4">
  <p class="mb-2">A great quotation goes here.</p>
  <footer class="blockquote-footer">Author Name <cite title="Source">Source Title</cite></footer>
</blockquote>
`.trim()

const FANCY_QUOTE_HTML = `
<figure class="text-center my-5">
  <blockquote class="blockquote">
    <p class="display-6 fst-italic">An unusually quotable thing to say.</p>
  </blockquote>
  <figcaption class="blockquote-footer">
    Author Name <cite title="Source">Source Title</cite>
  </figcaption>
</figure>
`.trim()

export default function register(api) {
  api.log.info(`Loading ${api.manifest.displayName} v${api.manifest.version}`)

  // 1. Register the basic Quote block
  api.registerBlock({
    id: 'quote',
    label: 'Quote',
    category: 'Common',
    media: '<i class="bi bi-quote"></i>',
    content: QUOTE_HTML,
    attributes: { class: 'gly-quote' },
    dependencies: []
  })

  // 2. Register the fancy variant as a command
  api.registerCommand({
    id: 'quote-block.fancy-quote',
    label: 'Insert Fancy Quote',
    handler: () => {
      const wrapper = api.editor.getWrapper()
      const target = api.editor.getSelected() || wrapper
      target.append(FANCY_QUOTE_HTML)
      api.notify.success('Fancy quote inserted.')
    },
    defaultBinding: 'Ctrl+Alt+Q'
  })

  // 3. Surface the command in the Insert menu
  api.addMenuItem({
    menu: 'insert',
    label: 'Fancy Quote',
    command: 'quote-block.fancy-quote',
    position: 'bottom'
  })

  // 4. Live count of quotes in the status bar
  let countSpan = null

  const updateCount = () => {
    if (!countSpan) return
    const wrapper = api.editor?.getWrapper()
    if (!wrapper) return
    const count = wrapper.find('blockquote').length
    countSpan.textContent = count === 1 ? '1 quote' : `${count} quotes`
  }

  api.addStatusBarItem({
    id: 'quote-count',
    render: () => {
      countSpan = document.createElement('span')
      countSpan.className = 'gs-status-item'
      countSpan.textContent = '0 quotes'
      return countSpan
    }
  })

  api.on('element:after-add', updateCount)
  api.on('element:after-remove', updateCount)
  api.on('tab:focused', updateCount)
  api.on('project:opened', updateCount)

  api.log.info('Quote Block plugin ready')
}
```

### What happens when this plugin loads

1. The user drops the `quote-block/` folder into `$XDG_CONFIG_HOME/GrapeStrap/plugins/` and restarts the editor.
2. Main process discovers the manifest, validates it (`@yourname/quote-block` is well-formed, `grapestrapVersion: ^0.1.0` matches the running version, `type: block` is known).
3. Main shows the trust prompt with manifest details. User accepts.
4. Renderer's plugin host imports `index.js` and calls `register(api)`.
5. The Insert panel's "Common" tab now shows a "Quote" tile.
6. The Insert menu has a new "Fancy Quote" entry.
7. The status bar shows "0 quotes" on the right.
8. Pressing Ctrl+Alt+Q inserts a fancy quote at the current selection.
9. Adding or removing any blockquote updates the status bar count.

### Distribute it

When you're happy with it:

```bash
cd quote-block/
npm init                          # to create package.json
# add "name": "@yourname/quote-block", "version": "0.1.0"
npm publish --access public       # under your npm scope
```

Then submit it to the curated marketplace via [GitHub issue template](https://github.com/grapestrap/grapestrap/issues/new?template=plugin_submission.md). See [Distribution](#distribution).

---

## Plugin folder structure

The host accepts a few layouts. Pick whichever fits your build.

### Single file

```
my-plugin/
├── grapestrap.json
└── index.js
```

Manifest's `main` is `index.js`. Simplest for small plugins.

### Bundled output

```
my-plugin/
├── grapestrap.json
├── package.json
├── src/
│   └── ...
└── dist/
    └── index.js
```

Manifest's `main` is `dist/index.js`. You bundle (Vite, Rollup, esbuild) before publishing. Recommended if you have multiple source files or use TypeScript internally — though the bundle output should still be plain JS.

### With assets

```
my-plugin/
├── grapestrap.json
├── index.js
├── assets/
│   ├── icons/
│   └── previews/
└── styles/
    └── plugin.css
```

You can ship arbitrary asset folders. Reference them by relative path inside your plugin code — the plugin's own folder is the implicit base. The host loader sets up an asset URL convention so `'./assets/icons/foo.svg'` resolves correctly.

---

## Loading and discovery

The host scans three locations, in order. Later locations override earlier ones with the same `name`:

1. **Bundled** — `<app>/plugins/`. Built-ins. Vetted by maintainers. No trust prompt.
2. **User** — `$XDG_CONFIG_HOME/GrapeStrap/plugins/`. Drop-in. Trust prompt on first load (planned for v0.0.2; v0.0.1 loads bundled only).
3. **Project** — `<project>/.grapestrap/plugins/`. Committed with the project. Version-locked. No trust prompt — the project itself is the trust boundary.

For each folder, main reads `grapestrap.json`, validates it, and ships the discovered list to the renderer. The renderer's plugin host then dynamically imports the plugin's `main` entry and calls its `register(api)` function.

### The override rule in practice

A user has installed `@yourname/quote-block@0.1.0` in their `$XDG_CONFIG_HOME/GrapeStrap/plugins/`. They open a project that has `<project>/.grapestrap/plugins/@yourname/quote-block@0.0.5/`. The project's pinned 0.0.5 wins — the host loads it instead of the user's 0.1.0. This makes projects portable across machines: anyone opening this project gets the same plugin behaviour the project author had, regardless of what's installed user-side.

### Disabling

Preferences > Plugins lets the user disable a plugin without uninstalling it. Disabled plugins are skipped at startup. The state is per-user, persisted in `preferences.json`.

### Hot reload (planned, v0.0.2+)

Disabling and re-enabling a plugin from Preferences re-runs `register(api)` against a fresh API, with all previous registrations cleared. Useful during plugin development.

---

## Distribution

### Where to put it

You have three deployment options:

**1. npm under your scope.** Publish `@yourname/quote-block` on npm. Users `npm install` it and drop it into `$XDG_CONFIG_HOME/GrapeStrap/plugins/`. (A `grapestrap install <name>` CLI helper is on the v0.2 roadmap; until then it's manual.)

```bash
cd quote-block/
npm publish --access public
```

**2. GitHub release.** Tag a release, attach a `.tar.gz` of the plugin folder. Users extract it into `$XDG_CONFIG_HOME/GrapeStrap/plugins/`.

**3. In a project.** Drop the plugin folder into `<project>/.grapestrap/plugins/`. Commit it to the project's repo. Anyone who clones the project gets the plugin without separate install.

### Curated marketplace

The grapestrap.org plugin marketplace is a **curated list** — community submissions reviewed by maintainers before listing. To submit:

1. Open a `plugin_submission` issue in the main repo (`.github/ISSUE_TEMPLATE/plugin_submission.md`). The template asks for the plugin's name, repo URL, npm URL, license, description, and whether you're the author.
2. A maintainer reviews the plugin's code, manifest, and license for compliance with the [Trust model](#trust-model) below.
3. Listed plugins appear at `grapestrap.org/plugins`. Listing does not imply endorsement — it indicates a maintainer has skimmed it for obvious problems.

We list plugins that:

- Have a permissive open-source license (MIT, Apache 2.0, ISC, etc. — copyleft is fine for non-derivative-creating plugins, but check us first).
- Don't include obfuscated code.
- Don't make network calls to undisclosed endpoints.
- Don't include telemetry of any kind.
- Have a working manifest and load cleanly.

We delist plugins that misbehave. Delisting does not affect users who already installed the plugin — it only removes it from the marketplace.

### A note on naming

Use a scope you control. `@yourname/...`, `@yourorg/...`. Don't use `@grapestrap/...` — that scope is reserved for official bundled plugins. Don't use unscoped names that could collide. Marketplace submissions with conflicting unscoped names get rejected.

---

## Trust model

Plugins run in the **renderer process** with full API access. We do not sandbox plugin JS in a separate context (no web worker shim, no VM). The cost outweighs the gain for an editor of this class.

This means:

- **A malicious plugin can do anything the renderer can do.** It can read project files via `api.project` and `api.fs`. It can call any registered command. It can mutate the GrapesJS canvas. It can read/write `preferences.json`. It can watch lifecycle events and exfiltrate data — though only via the API surface; it has no direct network or fs access.
- **A malicious plugin cannot reach outside the renderer's API surface.** It cannot run arbitrary shell commands. It cannot read files outside its sandboxed plugin-data directory (other than via project APIs). It cannot escape `contextIsolation`.

In practice this is the same trust level as a VS Code extension or a browser extension. Treat it that way.

### How we mitigate

- **Bundled plugins** are vetted by maintainers and ship with the app. The trust boundary is the GrapeStrap release itself.
- **User plugins** require explicit drop-in installation (the user has to put the folder in `$XDG_CONFIG_HOME/GrapeStrap/plugins/` or use a future install helper) and a confirm prompt on first load showing the manifest. The user reads the manifest — name, author, version, description, declared permissions — and accepts or rejects.
- **Project-pinned plugins** skip the prompt because opening a project implies trusting it. If you wouldn't run a `setup.sh` from a stranger's repo, don't open their project either.
- **Preferences > Plugins** shows installed plugins, manifests, and load logs. The user can disable or uninstall any non-bundled plugin at any time.
- **No auto-install, no auto-update.** GrapeStrap never reaches out and pulls plugin code without an explicit user action.
- **Curated marketplace.** Listed plugins are reviewed.

### Permissions field

The `permissions` array in your manifest is **advisory in v0.1**. It's logged, shown in the trust prompt, and surfaced in Preferences > Plugins, but the host does not enforce it yet. **v0.2 may enforce.**

Declare what your plugin actually needs. The user sees this in the trust prompt and judges accordingly. Plugins that declare `network:fetch` and only use `api.fs` will look suspicious.

Recognised permissions:

| Permission        | What it covers                                                            |
|-------------------|---------------------------------------------------------------------------|
| `project:read`    | Reading project state via `api.project` and lifecycle events.             |
| `project:write`   | Mutating project state (registering exporters, modifying canvas).         |
| `fs:plugin-data`  | Reading/writing the sandboxed `api.fs` folder.                            |
| `network:fetch`   | Outbound HTTP. (Note: even with this declared, you'd need to use `fetch` directly — there's no API helper. Discouraged in v0.1.) |

Most plugins need only `project:read` and `project:write`. Declare honestly.

### Install only what you trust

The same advice that applies to any software ecosystem. Read the manifest. Skim the source if you can. Prefer plugins from authors with a track record. Be especially cautious with plugins that declare `network:fetch`.

---

## API stability and semver

The plugin API is **semver-versioned**. Your manifest declares `grapestrapVersion: "^0.1.0"` to indicate the version range you're compatible with. The host refuses to load plugins whose declared range doesn't include the running GrapeStrap version, with a clear error in the load logs.

### What semver means here

- **Patch bump** (0.1.0 → 0.1.1) — bug fixes only. Plugins compatible with 0.1.0 work on 0.1.1.
- **Minor bump** (0.1.0 → 0.2.0) — additive changes. New API surface, new events, new registration types. Plugins compatible with 0.1.0 work on 0.2.0.
- **Major bump** (0.x → 1.0; 1.0 → 2.0) — breaking changes. API removal, signature changes, behavioural shifts that could break a well-behaved plugin. Migration notes published in the release.

### Pre-1.0 caveat

We're in the v0.x range, which means the API is **stabilising but not stable**. Reasonable additive changes happen between minor releases (0.1 → 0.2). Breaking changes will be batched and called out in CHANGELOG.

After v1.0, the plugin API gets the full semver guarantee.

### Best practices for plugin authors

- Use a tight `grapestrapVersion` range during v0.x: `^0.1.0` (matches 0.1.x), not `>=0.1.0` (matches all future versions including breaking ones).
- When a new GrapeStrap minor lands, test your plugin against it and bump the range if it works (`^0.2.0`).
- Subscribe to GitHub Releases and the announcements channel.
- Bump your own version when you change behaviour. Users and the marketplace use it to detect updates.

---

## Debugging plugins

### Use the logger

```javascript
api.log.info('Step 1 complete')
api.log.error('Failed:', err)
```

Logs go to `$XDG_DATA_HOME/GrapeStrap/logs/main.log` and are also visible in Preferences > Plugins under your plugin's entry.

### Open DevTools

Launching GrapeStrap with `--dev` enables Ctrl+Shift+R (force reload) and Ctrl+Shift+I (DevTools).

```bash
grapestrap --dev
```

DevTools console shows renderer-process errors, including unhandled exceptions in your `register(api)` function.

### Rapid iteration

For local development:

1. Symlink your plugin folder into `$XDG_CONFIG_HOME/GrapeStrap/plugins/`:
   ```bash
   ln -s "$(pwd)/quote-block" "$XDG_CONFIG_HOME/GrapeStrap/plugins/quote-block"
   ```
2. Restart GrapeStrap to pick up changes.
3. (Once hot-reload lands in v0.0.2+) Disable and re-enable your plugin from Preferences > Plugins to re-run `register(api)` without restarting.

### Common pitfalls

- **Manifest typo or wrong `grapestrapVersion` range** — the host silently skips plugins with invalid manifests. Check the load log in Preferences > Plugins.
- **Default export missing** — your `index.js` must `export default function register(api) { ... }`. Named exports are ignored.
- **Synchronous registration only** — call `api.registerBlock(...)` etc. inside `register()`, not from an async setTimeout or after a `fetch`. The Insert panel snapshot happens right after `register()` returns.
- **Reaching outside the API** — anything beyond the documented surface is internal and may break in any release. If you find yourself doing `api.editor.someInternal.thing`, file an issue asking for a stable API instead.

---

## Cookbook: common patterns

### A block with lazy dependencies

If your block needs a third-party library (Splide, GLightbox), declare it in `dependencies` and the host injects the bundled local copy on `component:add`, removes it when the last dependent component is removed.

```javascript
api.registerBlock({
  id: 'image-carousel',
  label: 'Image Carousel',
  category: 'Media',
  content: '<div class="splide">...</div>',
  dependencies: ['splidejs']
})
```

The host knows about `splidejs` and `glightbox` (bundled at build time, copied to `assets/vendor/`). If you need a dependency we haven't bundled, you ship it inside your plugin folder and reference it by relative path — but be aware: shipping CDN URLs in `content` is rejected by the bundler at export time.

### A panel that watches selection

```javascript
api.registerPanel({
  id: 'element-info',
  title: 'Element Info',
  defaultLocation: 'right',
  component: (container) => {
    const render = (element) => {
      if (!element) {
        container.innerHTML = '<div class="p-3 text-muted">No element selected</div>'
        return
      }
      container.innerHTML = `
        <div class="p-3">
          <h6>${element.tagName}</h6>
          <small>Classes: ${element.className || '(none)'}</small>
        </div>`
    }

    api.on('element:selected', render)
    api.on('element:deselected', () => render(null))
    render(api.editor.getSelected())

    return () => {
      api.off('element:selected', render)
    }
  }
})
```

### An exporter that writes a sitemap

```javascript
api.registerExporter({
  id: 'flat-with-sitemap',
  label: 'Flat HTML with sitemap.xml',
  exportFn: async (project, outputDir) => {
    // Delegate to the standard flat exporter first
    const flat = api.getExporter('flat')
    await flat.exportFn(project, outputDir)

    // Then add a sitemap
    const urls = project.pages
      .map(p => `  <url><loc>https://example.com/${p.name}.html</loc></url>`)
      .join('\n')
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`

    await api.fs.writeFile(`${outputDir}/sitemap.xml`, xml)
    api.notify.success('Exported with sitemap.')
  }
})
```

(`api.getExporter` retrieves an already-registered exporter by id, useful for composition.)

### Reacting to project save

```javascript
api.on('project:saved', (project) => {
  api.log.info(`Project saved: ${project.metadata.name}, ${project.pages.length} pages`)
})
```

### Persisting plugin state across sessions

```javascript
const KEY = 'lastUsedQuoteAuthor'

api.registerCommand({
  id: 'quote-block.fancy-quote',
  label: 'Insert Fancy Quote',
  handler: async () => {
    const lastAuthor = api.preferences.get(KEY, 'Anonymous')
    // ... use lastAuthor in the inserted HTML ...
    api.preferences.set(KEY, lastAuthor)
  }
})
```

### Multiple registration types in one plugin

A plugin's `type` is its primary categorisation, but functionally a plugin can call any combination of `register*` methods. A `type: "block"` plugin can also register commands, status-bar items, and snippets — and many should.

---

## What plugins should NOT do

Hard rules. Plugins that violate these get delisted from the marketplace.

- **Do not include telemetry.** No analytics, no phone-home, no "anonymous usage stats." This is non-negotiable.
- **Do not reach to CDNs at runtime.** All assets bundled locally. Same rule the host follows.
- **Do not write outside `api.fs`.** Don't try to read `~/.ssh/`. Even if you could (you can't), don't.
- **Do not obfuscate your code.** The user has to be able to read it. Minification for size is fine; identifier-mangled obfuscation is not.
- **Do not impersonate other plugins.** Don't use `@grapestrap/...` for non-official plugins. Don't use a name designed to confuse with an existing plugin.
- **Do not auto-install other plugins.** If your plugin depends on another, declare it in `dependencies` and ask the user via a notification.
- **Do not block the renderer.** No tight loops, no synchronous network, no megabyte JSON parses on every keystroke.
- **Do not bundle copyleft code without disclosing it.** GPL/AGPL code in a plugin is fine if it's the whole plugin and the user knows; bundling GPL inside an MIT plugin is a license violation.

If your plugin needs to do something this list forbids, open a Discussion. There's probably a way to do what you want within the rules, and if there isn't, the right move is to extend the host (file an issue for a new API surface), not work around it.

---

## Further reading

- [GRAPESTRAP_BUILD_PLAN_v4.md — Plugin API Specification](../GRAPESTRAP_BUILD_PLAN_v4.md#plugin-api-specification) — canonical API spec.
- [GRAPESTRAP_BUILD_PLAN_v4.md — Plugin Architecture](../GRAPESTRAP_BUILD_PLAN_v4.md#plugin-architecture) — high-level design.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — how the plugin host fits into the editor.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to submit a plugin to the curated list.
- [INSTALL.md](./INSTALL.md) — XDG paths, where user plugins live.
- [CREDITS.md](../CREDITS.md) — adapted patterns from Gramateria and CWALabs that informed the plugin model.
- [LICENSE](../LICENSE) — the host is MIT. Your plugin's license is your call (we strongly recommend MIT or another permissive license).
