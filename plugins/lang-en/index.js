/**
 * @grapestrap/lang-en
 *
 * English message catalog. The i18n runtime in v0.1.0 will pump these into
 * i18next; v0.0.1 ships them but the runtime that consumes them lands later.
 * Registered now so plugin authors writing translation packs have a reference
 * to mirror.
 */

import messages from './messages.json' assert { type: 'json' }

export default function register(api) {
  api.registerLanguage({
    code: 'en',
    name: 'English',
    messages
  })
}
