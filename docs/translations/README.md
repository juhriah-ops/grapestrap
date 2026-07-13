<!-- =============================================================
PATH: docs/translations/README.md
ROLE: Contributor guide — how to write and ship a GrapeStrap translation
      (language pack plugin)
DEPENDS: plugins/lang-en/ (reference pack), src/renderer/i18n.js (runtime),
         src/main/menu-i18n.js (native-menu loader)
CREATED: 2026-07-12 (Wave 4 i18n sweep)
============================================================= -->

# Translating GrapeStrap

GrapeStrap ships English as a **language pack plugin** — `@grapestrap/lang-en`
— and community translations work exactly the same way. A language pack is a
tiny plugin: a manifest, an entry file, and one flat JSON catalog.

The bundled English pack at [`plugins/lang-en/`](../../plugins/lang-en/) is
the reference implementation and the authoritative key list.

## Anatomy of a language pack

```
lang-de/
├── grapestrap.json     plugin manifest (type: "language")
├── index.js            registers the catalog with the plugin API
└── messages.json       the translated catalog
```

### `grapestrap.json`

```json
{
  "name": "@yourname/lang-de",
  "version": "0.1.0",
  "displayName": "Deutsch (de)",
  "description": "German message catalog for GrapeStrap.",
  "author": "You",
  "license": "MIT",
  "type": "language",
  "main": "index.js",
  "grapestrapVersion": ">=0.1.0 <0.2.0",
  "permissions": []
}
```

### `index.js`

```js
import messages from './messages.json' with { type: 'json' }

export default function register(api) {
  api.registerLanguage({
    code: 'de',          // BCP-47-ish code the user picks
    name: 'Deutsch',     // shown in the language list
    messages
  })
}
```

### `messages.json`

Copy `plugins/lang-en/messages.json` and translate the **values**. Never
change the keys.

## Catalog rules

- **Flat dotted keys.** `"menu.file.save": "Save"` — there is no nesting and
  no namespace separator. Dots and colons are literal characters in the key
  (`"shortcut.file:save"` is one key).
- **`{x}` interpolation.** Placeholders use single braces:
  `"tpl.toast.in-use": "Template is used by {count} page(s). Detach them first."`
  Keep every placeholder from the English value; you may reorder them freely.
- **Plurals.** Keys with `_one` / `_other` suffixes are
  [i18next plural forms](https://www.i18next.com/translation-function/plurals)
  selected by the `count` value:
  `"recovery.pages-item_one": "{count} page"`,
  `"recovery.pages-item_other": "{count} pages"`.
  Add the suffixed forms your language needs (`_few`, `_many`, …) — the
  runtime uses `Intl.PluralRules` for your code.
- **`` `backticks` `` mark code spans.** In hint strings such as
  `"sm.flex-hint": "Flex utilities apply only when the element has `d-flex`."`
  the backticked text renders as `<code>`. Keep the technical token inside
  the backticks untranslated (`d-flex`, `style.css`, `:hover`, …); translate
  the prose around it. Everything else in a value is plain text — HTML in a
  catalog value is never interpreted (values land via `textContent` or are
  escaped first).
- **Don't translate identifiers.** Class-name tooltips, Bootstrap utility
  values, CSS keywords, file/folder names, and the workspace preset names
  (Designer / Coder / Compact) never pass through the catalog — if a string
  isn't in `lang-en/messages.json`, it is not meant to be translated.

## Fallback behavior

Missing keys are never an error: resolution is **your locale → English → the
raw key**. You can ship a partial catalog — untranslated strings simply show
in English. This also means a stale catalog keeps working after GrapeStrap
adds new keys.

## Native menus — directory name convention

The renderer resolves your catalog through the plugin API no matter what your
plugin directory is called. The **native (Electron) menu bar** is built in the
main process, which cannot use the renderer runtime — it reads
`<plugin-dir>/messages.json` from disk by convention:

```
plugins/lang-<code>/messages.json
```

So name your pack's directory `lang-de` (not `german-pack`) if you want the
File/Edit/View/Insert/Help menus translated too. The user plugin directory
(`$XDG_CONFIG_HOME/GrapeStrap/plugins/`) wins over the bundled one. Top-level
menu mnemonics (`&File` → Alt+F) are added outside the catalog; translate the
plain word.

## Installing and activating

1. Put your pack in `$XDG_CONFIG_HOME/GrapeStrap/plugins/lang-<code>/`.
2. Start GrapeStrap and accept the first-load trust prompt.
3. Set the language: `general.language` in
   `$XDG_CONFIG_HOME/GrapeStrap/preferences.json` (the Preferences UI picker
   arrives post-v1; the pref is honored today).
4. Restart — or note that a mid-session switch only affects things rendered
   *after* the switch (toasts, dialogs, repainted panels). Static chrome and
   the native menus refresh on their next natural rebuild. This
   later-renders-only posture is deliberate; there is no live re-render
   plumbing.

## Testing your pack

- Launch with your locale set and click around: panels, dialogs, toasts.
- Missing-key check: anything showing a raw dotted key (`menu.file.save`)
  means the key is absent in BOTH your catalog and English — usually a typo.
- The e2e suite has a catalog-injection example in
  `tests/e2e/i18n.spec.js` (registers a test locale through
  `plugin:language-registered` and asserts rendered text) if you want to
  automate checks.

## Key inventory

The full key list is `plugins/lang-en/messages.json` (~460 keys as of
v0.1.0). Rough map of prefixes:

| Prefix | Surface |
|---|---|
| `menu.*`, `device.*` | Native menu bar (also used by toolbar/panels where labels match) |
| `toolbar.*`, `statusbar.*`, `tabs.*` | Fixed chrome |
| `panel.*` | Golden Layout tab titles |
| `fm.*`, `insert.*`, `am.*`, `lib.*`, `snip.*`, `lf.*`, `dom.*`, `bp.*`, `props.*`, `strip.*` | Panels |
| `sm.*` | Style Manager (all sub-panels) |
| `dialog.*`, `pp.*`, `prefs.*`, `qt.*`, `recovery.*`, `welcome.*`, `workspace.*`, `prompt.*` | Dialogs |
| `toast.*`, `tpl.*`, `file.*`, `preview.*` | Toasts + template/system messages |
| `action.*`, `ctx.*`, `shortcut.*` | Shared buttons, context menu, shortcut names |
| `starter.*` | New Project starter labels |
