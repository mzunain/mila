import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { APP_NAME, APP_PROTOCOL, isDev, DEV_URL } from './config';
import { createMainWindow } from './window';
import { buildMenu } from './menu';
import { setupTray } from './tray';
import {
  initAutoUpdater,
  checkForUpdatesInteractive,
} from './updater';
import { registerIpcHandlers } from './ipc';
import { startEmbeddedServer, stopEmbeddedServer } from './server';
import { getPrefs } from './store';

app.setName(APP_NAME);

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]!),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(APP_PROTOCOL);
}

const singleLock = app.requestSingleInstanceLock();
if (!singleLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
const getMainWindow = () => mainWindow;

app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  const deepLink = argv.find((arg) => arg.startsWith(`${APP_PROTOCOL}://`));
  if (deepLink) mainWindow?.webContents.send('mila:deep-link', deepLink);
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) mainWindow.webContents.send('mila:deep-link', url);
});

app.whenReady().then(async () => {
  registerIpcHandlers(getMainWindow);
  buildMenu({
    onCheckForUpdates: () => checkForUpdatesInteractive(getMainWindow),
    onPreferences: () => mainWindow?.webContents.send('mila:cmd:preferences'),
  });
  setupTray(getMainWindow);

  try {
    const url = await resolveLoadUrl();
    mainWindow = createMainWindow(url);
    initAutoUpdater(getMainWindow);
  } catch (err) {
    console.error('[main] fatal startup error', err);
    await dialog.showMessageBox({
      type: 'error',
      title: 'Mila failed to start',
      message: err instanceof Error ? err.message : String(err),
      buttons: ['Quit'],
    });
    app.quit();
    return;
  }
});

app.on('activate', () => {
  if (!mainWindow && app.isReady()) {
    void (async () => {
      const url = await resolveLoadUrl();
      mainWindow = createMainWindow(url);
    })();
  } else if (mainWindow) {
    mainWindow.show();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopEmbeddedServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopEmbeddedServer();
});

async function resolveLoadUrl(): Promise<string> {
  if (isDev) return DEV_URL;
  const { apiUrl, wsUrl } = getPrefs();
  return startEmbeddedServer({
    MILA_API_INTERNAL_URL: apiUrl,
    NEXT_PUBLIC_API_WS_URL: wsUrl,
    NODE_ENV: 'production',
  });
}
