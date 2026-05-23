import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import path from 'node:path';
import { ASSETS_DIR } from './config';
import { prefs, setPrefs } from './store';
import { checkForUpdatesInteractive } from './updater';

let tray: Tray | null = null;

export function setupTray(getWindow: () => BrowserWindow | null) {
  if (tray) return tray;
  const iconPath = path.join(
    ASSETS_DIR,
    process.platform === 'darwin' ? 'tray-Template.png' : 'tray.png',
  );
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('Mila — Meeting notes');

  const rebuild = () => {
    if (!tray) return;
    const launchAtLogin = prefs.get('launchAtLogin');

    const menu = Menu.buildFromTemplate([
      {
        label: 'Open Mila',
        accelerator: process.platform === 'darwin' ? 'Cmd+Shift+M' : undefined,
        click: () => focusWindow(getWindow()),
      },
      {
        label: 'New Meeting',
        accelerator: 'CmdOrCtrl+N',
        click: () => sendCommand(getWindow(), 'mila:cmd:new-meeting'),
      },
      {
        label: 'Quick Note',
        click: () => sendCommand(getWindow(), 'mila:cmd:quick-note'),
      },
      { type: 'separator' },
      {
        label: 'Start Listening',
        click: () => sendCommand(getWindow(), 'mila:cmd:start-mic'),
      },
      {
        label: 'Stop Listening',
        click: () => sendCommand(getWindow(), 'mila:cmd:stop-mic'),
      },
      { type: 'separator' },
      {
        label: 'Preferences…',
        accelerator: 'CmdOrCtrl+,',
        click: () => sendCommand(getWindow(), 'mila:cmd:preferences'),
      },
      {
        label: 'Launch at login',
        type: 'checkbox',
        checked: launchAtLogin,
        click: (item) => {
          setPrefs({ launchAtLogin: item.checked });
          try {
            app.setLoginItemSettings({ openAtLogin: item.checked });
          } catch {
            // Linux/CI may not support this; ignore silently.
          }
          rebuild();
        },
      },
      {
        label: 'Check for Updates…',
        click: () => checkForUpdatesInteractive(getWindow),
      },
      { type: 'separator' },
      {
        label: `Mila ${app.getVersion()}`,
        enabled: false,
      },
      { label: 'Quit Mila', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
  };

  rebuild();
  tray.on('click', () => {
    const win = getWindow();
    if (!win) return;
    if (win.isVisible()) win.hide();
    else focusWindow(win);
  });
  return tray;
}

function focusWindow(win: BrowserWindow | null) {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function sendCommand(win: BrowserWindow | null, channel: string) {
  focusWindow(win);
  win?.webContents.send(channel);
}
