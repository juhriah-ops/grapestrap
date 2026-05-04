/**
 * GrapeStrap — Native menu structure
 *
 * Built per the v4 plan menu spec. Most items dispatch via IPC menu:action with a
 * stable string key the renderer routes to a command handler.
 *
 * Items marked v0.0.2/v0.1.0 are present in the menu but their handlers in the
 * renderer may show a "coming soon" toast in v0.0.1. Listing them in the menu now
 * means tutorials and screenshots match the final UX from the start.
 */

import { Menu, app } from 'electron'

export function buildMenu({ onAction }) {
  const isMac = process.platform === 'darwin'

  const send = (action, ...args) => () => onAction(action, ...args)

  const fileMenu = {
    label: '&File',
    submenu: [
      { label: 'New Project…',       accelerator: 'CmdOrCtrl+N',      click: send('file:new-project') },
      { label: 'New Page…',          accelerator: 'CmdOrCtrl+Shift+N', click: send('file:new-page') },
      { label: 'Open Project…',      accelerator: 'CmdOrCtrl+O',      click: send('file:open-project') },
      { label: 'Import Folder…',                                       click: send('file:import-folder') },
      { label: 'Open Recent', role: 'recentDocuments', submenu: [{ role: 'clearRecentDocuments' }] },
      { type: 'separator' },
      { label: 'Save',               accelerator: 'CmdOrCtrl+S',       click: send('file:save') },
      { label: 'Save As…',           accelerator: 'CmdOrCtrl+Shift+S', click: send('file:save-as') },
      { type: 'separator' },
      { label: 'Page Properties…',                                     click: send('file:page-properties') },
      { label: 'Project Settings…',                                    click: send('file:project-settings') },
      { type: 'separator' },
      { label: 'Export…',            accelerator: 'CmdOrCtrl+E',       click: send('file:export') },
      { type: 'separator' },
      { label: 'Close Tab',          accelerator: 'CmdOrCtrl+W',       click: send('file:close-tab') },
      { type: 'separator' },
      isMac ? { role: 'close' } : { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
    ]
  }

  const editMenu = {
    label: '&Edit',
    submenu: [
      { label: 'Undo',           accelerator: 'CmdOrCtrl+Z',       click: send('edit:undo') },
      { label: 'Redo',           accelerator: 'CmdOrCtrl+Shift+Z', click: send('edit:redo') },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      { type: 'separator' },
      { label: 'Duplicate Element', accelerator: 'CmdOrCtrl+D',     click: send('edit:duplicate') },
      { label: 'Delete Element',    accelerator: 'Delete',          click: send('edit:delete') },
      { type: 'separator' },
      { label: 'Quick Tag Editor',  accelerator: 'CmdOrCtrl+T',         click: send('edit:quick-tag') },        // v0.0.2
      { label: 'Wrap with Tag',     accelerator: 'CmdOrCtrl+Shift+W',   click: send('edit:wrap-tag') },         // v0.0.2
      { type: 'separator' },
      { label: 'Find',                accelerator: 'CmdOrCtrl+F',         click: send('edit:find') },
      { label: 'Replace',             accelerator: 'CmdOrCtrl+H',         click: send('edit:replace') },
      { label: 'Find in Project',     accelerator: 'CmdOrCtrl+Shift+F',   click: send('edit:find-in-project') }, // v0.0.2
      { type: 'separator' },
      { label: 'Preferences…',        accelerator: 'CmdOrCtrl+,',         click: send('edit:preferences') }
    ]
  }

  const viewMenu = {
    label: '&View',
    submenu: [
      { label: 'Design',  accelerator: 'CmdOrCtrl+1', click: send('view:mode-design') },
      { label: 'Code',    accelerator: 'CmdOrCtrl+2', click: send('view:mode-code') },
      { label: 'Split',   accelerator: 'CmdOrCtrl+3', click: send('view:mode-split') },
      { type: 'separator' },
      { label: 'Toggle File Manager',          accelerator: 'CmdOrCtrl+B',     click: send('view:toggle-file-manager') },
      { label: 'Toggle DOM Tree',              accelerator: 'CmdOrCtrl+Shift+O', click: send('view:toggle-dom-tree') },   // v0.0.2
      { label: 'Toggle Properties Panel',      accelerator: 'CmdOrCtrl+J',     click: send('view:toggle-properties') },
      { label: 'Toggle Property Inspector',    accelerator: 'CmdOrCtrl+`',     click: send('view:toggle-strip') },
      { label: 'Toggle Insert Panel',          accelerator: 'CmdOrCtrl+I',     click: send('view:toggle-insert') },
      { label: 'Toggle Status Bar',                                           click: send('view:toggle-status') },
      { label: 'Toggle Linked Files',                                         click: send('view:toggle-linked-files') },
      { label: 'Toggle Breakpoint Slider',                                    click: send('view:toggle-breakpoints') },
      { label: 'Toggle Custom CSS',                                           click: send('view:toggle-custom-css') },
      { type: 'separator' },
      {
        label: 'Responsive Preview',
        submenu: [
          { label: 'Desktop', accelerator: 'CmdOrCtrl+Alt+1', click: send('view:device-desktop') },
          { label: 'Tablet',  accelerator: 'CmdOrCtrl+Alt+2', click: send('view:device-tablet') },
          { label: 'Mobile',  accelerator: 'CmdOrCtrl+Alt+3', click: send('view:device-mobile') }
        ]
      },
      { label: 'Preview in Browser', accelerator: 'CmdOrCtrl+F12', click: send('view:preview-browser') }, // v0.1.0
      { type: 'separator' },
      { label: 'Reset Layout',                                       click: send('view:reset-layout') },
      { label: 'Workspace Layouts',                                  submenu: [{ label: '(coming in v0.1.0)', enabled: false }] },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }

  // Insert menu mirrors Insert panel categories. Renderer fills in the per-block
  // submenu items dynamically based on registered blocks (via plugin host).
  const insertMenu = {
    label: '&Insert',
    submenu: [
      { label: 'Common',   click: send('insert:focus-tab', 'common') },
      { label: 'Layout',   click: send('insert:focus-tab', 'layout') },
      { label: 'Forms',    click: send('insert:focus-tab', 'forms') },
      { label: 'Text',     click: send('insert:focus-tab', 'text') },
      { label: 'Media',    click: send('insert:focus-tab', 'media') },
      { label: 'Sections', click: send('insert:focus-tab', 'sections') },
      { label: 'Library',  click: send('insert:focus-tab', 'library') },   // v0.0.2
      { label: 'Snippets', click: send('insert:focus-tab', 'snippets') }   // v0.0.2
    ]
  }

  const helpMenu = {
    label: '&Help',
    submenu: [
      { label: 'Documentation',     click: send('help:docs') },
      { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+/', click: send('help:shortcuts') },
      { label: 'Plugin Development', click: send('help:plugin-dev') },
      { type: 'separator' },
      { label: 'GitHub',             click: send('help:github') },
      { label: 'Report Issue',       click: send('help:report-issue') },
      { type: 'separator' },
      { label: 'About GrapeStrap',   click: send('help:about') }
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
