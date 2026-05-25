import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { APP_NAME, APP_PROTOCOL, isDev, DEV_URL } from './config';

// Pin userData to ~/Library/Application Support/Mila (or platform equivalent)
// BEFORE requestSingleInstanceLock. The package is published as @mila/electron;
// without this, Electron falls back to the default "Electron" path, which
// collides with any other Electron dev app on the machine and silently
// loses the single-instance lock.
app.setPath('userData', path.join(app.getPath('appData'), APP_NAME));
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
import { startMeetingDetector } from './meeting-detector';

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
let stopMeetingDetector: (() => void) | null = null;
const getMainWindow = () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null);

const attachMainWindow = (win: BrowserWindow) => {
  mainWindow = win;
  win.on('closed', () => {
    mainWindow = null;
  });
};

const ensureMainWindow = async (): Promise<BrowserWindow> => {
  const existing = getMainWindow();
  if (existing) return existing;
  const url = await resolveLoadUrl();
  const win = createMainWindow(url);
  attachMainWindow(win);
  return win;
};

app.on('second-instance', (_event, argv) => {
  const win = getMainWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    const deepLink = argv.find((arg) => arg.startsWith(`${APP_PROTOCOL}://`));
    if (deepLink) win.webContents.send('mila:deep-link', deepLink);
  }
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  const win = getMainWindow();
  if (win) win.webContents.send('mila:deep-link', url);
});

app.whenReady().then(async () => {
  registerIpcHandlers(getMainWindow);
  buildMenu({
    onCheckForUpdates: () => checkForUpdatesInteractive(getMainWindow),
    onPreferences: () => getMainWindow()?.webContents.send('mila:cmd:preferences'),
  });
  setupTray(getMainWindow);

  try {
    await ensureMainWindow();
    initAutoUpdater(getMainWindow);

    // Watch for Zoom / Teams / Webex / Google Meet calls and notify the
    // renderer so it can auto-start a session. The renderer's preload script
    // converts each IPC event into a postMessage that the existing
    // MeetingWorkspace auto-start listener consumes — no web client changes
    // are needed for the producer side.
    stopMeetingDetector = startMeetingDetector({
      onDetect: (meeting) => {
        const win = getMainWindow();
        if (!win) return;
        win.webContents.send('mila:auto-start-signal', meeting);
      },
      log: (msg) => console.log(msg),
    });
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
  if (!app.isReady()) return;
  void ensureMainWindow().then((win) => {
    win.show();
  }).catch((err) => {
    console.error('[main] activate failed', err);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopEmbeddedServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopMeetingDetector?.();
  stopMeetingDetector = null;
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
