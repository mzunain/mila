import {
  Menu,
  type MenuItemConstructorOptions,
  BrowserWindow,
  shell,
  app,
} from 'electron';
import { APP_NAME } from './config';

export function buildMenu(opts: {
  onCheckForUpdates: () => void;
  onPreferences: () => void;
}) {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Preferences…',
                accelerator: 'CmdOrCtrl+,',
                click: opts.onPreferences,
              },
              {
                label: 'Check for Updates…',
                click: opts.onCheckForUpdates,
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Meeting',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('mila:cmd:new-meeting');
          },
        },
        {
          label: 'Open Recent',
          submenu: [{ label: '(empty)', enabled: false }],
        },
        { type: 'separator' },
        ...(isMac
          ? [{ role: 'close' as const }]
          : [
              {
                label: 'Preferences…',
                accelerator: 'CmdOrCtrl+,',
                click: opts.onPreferences,
              },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/mzunain/mila'),
        },
        {
          label: 'Report an Issue',
          click: () =>
            shell.openExternal('https://github.com/mzunain/mila/issues/new'),
        },
        { type: 'separator' },
        {
          label: `Mila ${app.getVersion()}`,
          enabled: false,
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
