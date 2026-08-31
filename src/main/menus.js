/**
 * GrapeStrap — Native menu structure
 *
 * Built per the v4 plan menu spec. Most items dispatch via IPC menu:action with a
 * stable string key the renderer routes to a command handler.
 *
 * Items marked v0.0.2/v0.1.0 are present in the menu but their handlers in the
 * renderer may show a "coming soon" toast in v0.0.1. Listing them in the menu now
 * means tutorials and screenshots match the final UX from the start.
 *
 * Labels resolve through tMenu() (Wave 4 sweep) — menu-i18n.js reads the lang
 * plugin's messages.json from disk, since main can't use the renderer i18next.
 * refreshMenuCatalog() runs on every buildMenu() call, so a changed language
 * pref is picked up on the next natural rebuild (boot or menu:set-workspaces)
 * — deliberately no live relabel, matching the renderer's later-renders
 * posture. Top-level labels get their Alt-mnemonic '&' prefixed here, outside
 * the catalog. Deliberately NOT translated: Electron role items (cut/copy/
 * paste/selectAll/close/togglefullscreen, recentDocuments — OS-labelled) and
 * the workspace preset names Designer/Coder/Compact (the name IS the
 * workspace:apply identifier; renderer presets are keyed by it).
 */

import { Menu, app } from 'electron'
import { tMenu, refreshMenuCatalog } from './menu-i18n.js'

export function buildMenu({ onAction, workspaceNames = [] }) {
  refreshMenuCatalog()
  const isMac = process.platform === 'darwin'

  const send = (action, ...args) => () => onAction(action, ...args)

  // View → Workspace Layouts (Wave 3). Native menus are static, so main.js
  // rebuilds the whole menu whenever the renderer pushes a new name list via
  // the one-way `menu:set-workspaces` IPC (boot + every save/delete/rename).
  // Presets are code-built in the renderer (never files, never deletable);
  // saved names apply through the same `workspace:apply <name>` action.
  const workspaceSubmenu = [
    { label: 'Designer', click: send('workspace:apply', 'Designer') },
    { label: 'Coder',    click: send('workspace:apply', 'Coder') },
    { label: 'Compact',  click: send('workspace:apply', 'Compact') },
    ...(workspaceNames.length > 0
      ? [{ type: 'separator' },
         ...workspaceNames.map(name => ({ label: name, click: send('workspace:apply', name) }))]
      : []),
    { type: 'separator' },
    { label: tMenu('menu.view.workspace-save-as'), click: send('workspace:save-as') },
    { label: tMenu('menu.view.workspace-manage'),  click: send('workspace:manage') }
  ]

  const fileMenu = {
    label: '&' + tMenu('menu.file'),
    submenu: [
      { label: tMenu('menu.file.new-project'),      accelerator: 'CmdOrCtrl+N',      click: send('file:new-project') },
      { label: tMenu('menu.file.new-page'),         accelerator: 'CmdOrCtrl+Shift+N', click: send('file:new-page') },
      { label: tMenu('menu.file.open-project'),     accelerator: 'CmdOrCtrl+O',      click: send('file:open-project') },
      { label: tMenu('menu.file.import-folder'),                                      click: send('file:import-folder') },
      { label: tMenu('menu.file.open-recent'), role: 'recentDocuments', submenu: [{ role: 'clearRecentDocuments' }] },
      { type: 'separator' },
      { label: tMenu('menu.file.save'),             accelerator: 'CmdOrCtrl+S',       click: send('file:save') },
      { label: tMenu('menu.file.save-as'),          accelerator: 'CmdOrCtrl+Shift+S', click: send('file:save-as') },
      { type: 'separator' },
      { label: tMenu('menu.file.page-properties'),                                    click: send('file:page-properties') },
      { label: tMenu('menu.file.project-settings'),                                   click: send('file:project-settings') },
      { type: 'separator' },
      { label: tMenu('menu.file.export'),           accelerator: 'CmdOrCtrl+E',       click: send('file:export') },
      { type: 'separator' },
      { label: tMenu('menu.file.close-tab'),        accelerator: 'CmdOrCtrl+W',       click: send('file:close-tab') },
      { type: 'separator' },
      isMac ? { role: 'close' } : { label: tMenu('menu.file.quit'), accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
    ]
  }

  const editMenu = {
    label: '&' + tMenu('menu.edit'),
    submenu: [
      { label: tMenu('menu.edit.undo'),          accelerator: 'CmdOrCtrl+Z',       click: send('edit:undo') },
      { label: tMenu('menu.edit.redo'),          accelerator: 'CmdOrCtrl+Shift+Z', click: send('edit:redo') },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      { type: 'separator' },
      { label: tMenu('menu.edit.duplicate'),     accelerator: 'CmdOrCtrl+D',     click: send('edit:duplicate') },
      { label: tMenu('menu.edit.delete'),        accelerator: 'Delete',          click: send('edit:delete') },
      { type: 'separator' },
      { label: tMenu('menu.edit.quick-tag'),     accelerator: 'CmdOrCtrl+T',         click: send('edit:quick-tag') },        // v0.0.2
      { label: tMenu('menu.edit.wrap-tag'),      accelerator: 'CmdOrCtrl+Shift+W',   click: send('edit:wrap-tag') },         // v0.0.2
      { type: 'separator' },
      { label: tMenu('menu.edit.find'),            accelerator: 'CmdOrCtrl+F',         click: send('edit:find') },
      { label: tMenu('menu.edit.replace'),         accelerator: 'CmdOrCtrl+H',         click: send('edit:replace') },
      { label: tMenu('menu.edit.find-in-project'), accelerator: 'CmdOrCtrl+Shift+F',   click: send('edit:find-in-project') }, // v0.0.2
      { type: 'separator' },
      { label: tMenu('menu.edit.preferences'),     accelerator: 'CmdOrCtrl+,',         click: send('edit:preferences') }
    ]
  }

  const viewMenu = {
    label: '&' + tMenu('menu.view'),
    submenu: [
      { label: tMenu('menu.view.design'),  accelerator: 'CmdOrCtrl+1', click: send('view:mode-design') },
      { label: tMenu('menu.view.code'),    accelerator: 'CmdOrCtrl+2', click: send('view:mode-code') },
      { label: tMenu('menu.view.split'),   accelerator: 'CmdOrCtrl+3', click: send('view:mode-split') },
      { type: 'separator' },
      { label: tMenu('menu.view.toggle-file-manager'), accelerator: 'CmdOrCtrl+B',       click: send('view:toggle-file-manager') },
      { label: tMenu('menu.view.toggle-dom-tree'),     accelerator: 'CmdOrCtrl+Shift+O', click: send('view:toggle-dom-tree') },   // v0.0.2
      { label: tMenu('menu.view.toggle-properties'),   accelerator: 'CmdOrCtrl+J',       click: send('view:toggle-properties') },
      { label: tMenu('menu.view.toggle-strip'),        accelerator: 'CmdOrCtrl+`',       click: send('view:toggle-strip') },
      { label: tMenu('menu.view.toggle-insert'),       accelerator: 'CmdOrCtrl+I',       click: send('view:toggle-insert') },
      { label: tMenu('menu.view.toggle-status'),                                         click: send('view:toggle-status') },
      { label: tMenu('menu.view.toggle-linked-files'),                                   click: send('view:toggle-linked-files') },
      { label: tMenu('menu.view.toggle-breakpoints'),                                    click: send('view:toggle-breakpoints') },
      { label: tMenu('menu.view.toggle-custom-css'),                                     click: send('view:toggle-custom-css') },
      { label: tMenu('menu.view.toggle-bootstrap-css'),                                  click: send('view:toggle-bootstrap-css') },
      { label: tMenu('menu.view.toggle-ai'),                                             click: send('view:toggle-ai') },
      { type: 'separator' },
      {
        label: tMenu('menu.view.responsive-preview'),
        submenu: [
          { label: tMenu('device.desktop'), accelerator: 'CmdOrCtrl+Alt+1', click: send('view:device-desktop') },
          { label: tMenu('device.tablet'),  accelerator: 'CmdOrCtrl+Alt+2', click: send('view:device-tablet') },
          { label: tMenu('device.mobile'),  accelerator: 'CmdOrCtrl+Alt+3', click: send('view:device-mobile') }
        ]
      },
      { label: tMenu('menu.view.preview-browser'), accelerator: 'CmdOrCtrl+F12', click: send('view:preview-browser') }, // v0.1.0
      { type: 'separator' },
      { label: tMenu('menu.view.reset-layout'),                                    click: send('view:reset-layout') },
      { label: tMenu('menu.view.workspace-layouts'),                               submenu: workspaceSubmenu },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }

  // Insert menu mirrors Insert panel categories. Renderer fills in the per-block
  // submenu items dynamically based on registered blocks (via plugin host).
  const insertMenu = {
    label: '&' + tMenu('menu.insert'),
    submenu: [
      { label: tMenu('menu.insert.common'),   click: send('insert:focus-tab', 'common') },
      { label: tMenu('menu.insert.layout'),   click: send('insert:focus-tab', 'layout') },
      { label: tMenu('menu.insert.forms'),    click: send('insert:focus-tab', 'forms') },
      { label: tMenu('menu.insert.text'),     click: send('insert:focus-tab', 'text') },
      { label: tMenu('menu.insert.media'),    click: send('insert:focus-tab', 'media') },
      { label: tMenu('menu.insert.sections'), click: send('insert:focus-tab', 'sections') },
      { label: tMenu('menu.insert.library'),  click: send('insert:focus-tab', 'library') },   // v0.0.2
      { label: tMenu('menu.insert.snippets'), click: send('insert:focus-tab', 'snippets') }   // v0.0.2
    ]
  }

  const helpMenu = {
    label: '&' + tMenu('menu.help'),
    submenu: [
      { label: tMenu('menu.help.docs'),       click: send('help:docs') },
      { label: tMenu('menu.help.shortcuts'),  accelerator: 'CmdOrCtrl+/', click: send('help:shortcuts') },
      { label: tMenu('menu.help.plugin-dev'), click: send('help:plugin-dev') },
      { type: 'separator' },
      { label: tMenu('menu.help.github'),       click: send('help:github') },
      { label: tMenu('menu.help.report-issue'), click: send('help:report-issue') },
      { type: 'separator' },
      { label: tMenu('menu.help.about'),        click: send('help:about') }
    ]
  }

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    fileMenu,
    editMenu,
    viewMenu,
    insertMenu,
    helpMenu
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
