import { BrowserWindow } from 'electron';
import { backendSplashDataUrl, type SplashOptions } from './backend-splash';

// A small frameless window shown while the backend comes up after a restart.
// Kept as a singleton so repeated calls are idempotent.

let splash: BrowserWindow | null = null;

export function showBackendSplash(opts?: SplashOptions): BrowserWindow {
  if (splash && !splash.isDestroyed()) return splash;

  const win = new BrowserWindow({
    width: 420,
    height: 240,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    backgroundColor: '#0a0a0a',
    show: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => {
    if (splash === win && !win.isDestroyed()) win.show();
  });
  win.on('closed', () => {
    if (splash === win) splash = null;
  });

  void win.loadURL(backendSplashDataUrl(opts));
  splash = win;
  return win;
}

export function closeBackendSplash(): void {
  if (splash && !splash.isDestroyed()) {
    splash.close();
  }
  splash = null;
}
