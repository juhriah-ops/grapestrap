/**
 * @grapestrap/lang-en
 *
 * English message catalog. The i18n runtime in v0.1.0 will pump these into
 * i18next; v0.0.1 ships them but the runtime that consumes them lands later.
 * Registered now so plugin authors writing translation packs have a reference
 * to mirror.
 *
 * Loads `messages.json` via a relative ES module import. This works because
 * plugins are loaded under the `gstrap-plugin://` privileged protocol scheme
 * (registered in src/main/main.js) — a hierarchical URL, so the import
 * resolves against the plugin's directory just like a normal module.
 */

import messages from './messages.json' with { type: 'json' }

export default function register(api) {
  api.registerLanguage({
    code: 'en',
    name: 'English',
    messages
  })
}
