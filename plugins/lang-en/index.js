/**
 * @grapestrap/lang-en
 *
 * English message catalog. The i18n runtime in v0.1.0 will pump these into
 * i18next; v0.0.1 ships them but the runtime that consumes them lands later.
 * Registered now so plugin authors writing translation packs have a reference
 * to mirror.
 *
 * v0.0.1 LIMITATION: Plugin entry modules are loaded as text via a Blob URL,
 * so relative imports (`./messages.json`) cannot resolve — blob: URLs have
 * no hierarchical base. Messages are inlined here for now. v0.0.2 will
 * replace the Blob loader with a `gstrap-plugin://` privileged protocol
 * scheme so multi-file plugins (with their own JSON, helpers, etc.) work.
 * When that lands, this can return to importing from messages.json.
 */

const messages = {
  'app.name': 'GrapeStrap',
  'app.tagline': 'Visual Bootstrap 5 editor',

  'menu.file': 'File',
  'menu.file.new-project': 'New Project…',
  'menu.file.new-page': 'New Page…',
  'menu.file.open-project': 'Open Project…',
  'menu.file.save': 'Save',
  'menu.file.save-as': 'Save As…',
  'menu.file.export': 'Export…',
  'menu.file.close-tab': 'Close Tab',
  'menu.file.quit': 'Quit',

  'menu.edit': 'Edit',
  'menu.edit.undo': 'Undo',
  'menu.edit.redo': 'Redo',
  'menu.edit.duplicate': 'Duplicate Element',
  'menu.edit.delete': 'Delete Element',
  'menu.edit.find': 'Find',
  'menu.edit.replace': 'Replace',
  'menu.edit.find-in-project': 'Find in Project',
  'menu.edit.preferences': 'Preferences…',
  'menu.edit.quick-tag': 'Quick Tag Editor',
  'menu.edit.wrap-tag': 'Wrap with Tag',

  'menu.view': 'View',
  'menu.view.design': 'Design',
  'menu.view.code': 'Code',
  'menu.view.split': 'Split',
  'menu.view.reset-layout': 'Reset Layout',

  'menu.insert': 'Insert',
  'menu.insert.common': 'Common',
  'menu.insert.layout': 'Layout',
  'menu.insert.forms': 'Forms',
  'menu.insert.text': 'Text',
  'menu.insert.media': 'Media',
  'menu.insert.sections': 'Sections',
  'menu.insert.library': 'Library',
  'menu.insert.snippets': 'Snippets',

  'menu.help': 'Help',
  'menu.help.docs': 'Documentation',
  'menu.help.shortcuts': 'Keyboard Shortcuts',
  'menu.help.plugin-dev': 'Plugin Development',
  'menu.help.github': 'GitHub',
  'menu.help.report-issue': 'Report Issue',
  'menu.help.about': 'About GrapeStrap',

  'panel.file-manager': 'Project',
  'panel.canvas': 'Canvas',
  'panel.properties': 'Properties',
  'panel.custom-css': 'Custom CSS',
  'panel.dom-tree': 'DOM',

  'device.desktop': 'Desktop',
  'device.tablet': 'Tablet',
  'device.mobile': 'Mobile',

  'empty.no-project': 'Open a project or create a new one.',
  'empty.no-tabs': 'Select a page from the file manager.',
  'empty.no-element': 'Select an element to edit its properties.',
  'empty.search-no-results': 'No blocks match your search.',

  'toast.saved': 'Saved.',
  'toast.export-success': 'Exported {count} page(s) to {dir}',
  'toast.command-not-wired': 'Command "{cmd}" not yet wired in v0.0.1.',

  'welcome.title': 'Welcome to GrapeStrap',
  'welcome.tagline': 'The Dreamweaver-style visual editor for Bootstrap 5 on Linux.',
  'welcome.dismiss': 'Don\'t show again',
  'welcome.docs': 'Open Docs'
}

export default function register(api) {
  api.registerLanguage({
    code: 'en',
    name: 'English',
    messages
  })
}
