import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { APP_NAME, APP_PROTOCOL, ENTRY_PATH, isDev, DEV_URL } from './config';

// Pin userData to ~/Library/Application Support/Mila (or platform equivalent)
// BEFORE requestSingleInstanceLock. The package is published as @mila/electron;
// without this, Electron falls back to the default "Electron" path, which
// collides with any other Electron dev app on the machine and silently
// loses the single-instance lock.
app.setPath('userData', path.join(app.getPath('appData'), APP_NAME));
import { createMainWindow } from './window';
import { buildMenu } from './menu';
import {
  clearDetectedCallInTray,
  setupTray,
  showDetectedCallInTray,
} from './tray';
import {
  initAutoUpdater,
  checkForUpdatesInteractive,
} from './updater';
import { registerIpcHandlers } from './ipc';
import { startEmbeddedServer, stopEmbeddedServer } from './server';
import { getPrefs, setPrefs } from './store';
import { startMeetingDetector } from './meeting-detector';
import {
  MeetingNotificationPolicy,
  isMeetingNotificationAllowed,
  meetingNotificationBody,
  meetingNotificationKey,
} from './meeting-notification-policy';
import { showCallDetectedNotification } from './meeting-notifier';
import {
  closeMeetingDetectionWindow,
  showMeetingDetectionWindow,
} from './meeting-detection-window';
import type { DetectedMeeting } from './meeting-detector';
import { syncLaunchAtLoginPreference } from './login-item';

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
const meetingNotificationPolicy = new MeetingNotificationPolicy();
const ignoredDetectedCallKeys = new Set<string>();
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
  syncLaunchAtLoginPreference(app, getPrefs().launchAtLogin, console.warn);
  registerIpcHandlers(getMainWindow);
  buildMenu({
    onCheckForUpdates: () => checkForUpdatesInteractive(getMainWindow),
    onPreferences: () => getMainWindow()?.webContents.send('mila:cmd:preferences'),
  });
  setupTray(getMainWindow);

  try {
    await ensureMainWindow();
    initAutoUpdater(getMainWindow);

    // Watch for calls and surface a single desktop affordance. On macOS the
    // custom compact window matches the menu-bar workflow; native notifications
    // remain a fallback on other platforms.
    stopMeetingDetector = startMeetingDetector({
      onDetect: (meeting) => {
        const win = getMainWindow();
        win?.webContents.send('mila:auto-start-signal', meeting);

        const meetingKey = meetingNotificationKey(meeting);
        const prefState = getPrefs();
        const shouldSurfaceCall =
          !ignoredDetectedCallKeys.has(meetingKey) &&
          isMeetingNotificationAllowed(meeting, prefState);

        if (shouldSurfaceCall) {
          showMeetingDetectionWindow(meeting, {
            onTakeNotes: () => {
              void takeNotesForDetectedMeeting(meeting);
            },
            onIgnore: () => {
              ignoredDetectedCallKeys.add(meetingKey);
              clearDetectedCallInTray(meetingKey);
              closeMeetingDetectionWindow(meetingKey);
            },
            onMuteApp: () => {
              muteDetectedMeetingApp(meeting);
              ignoredDetectedCallKeys.add(meetingKey);
              clearDetectedCallInTray(meetingKey);
              closeMeetingDetectionWindow(meetingKey);
            },
          });
          showDetectedCallInTray(meeting, {
            onTakeNotes: () => {
              void takeNotesForDetectedMeeting(meeting);
            },
            onIgnore: () => {
              ignoredDetectedCallKeys.add(meetingKey);
              clearDetectedCallInTray(meetingKey);
            },
            onMuteApp: () => {
              muteDetectedMeetingApp(meeting);
              ignoredDetectedCallKeys.add(meetingKey);
              clearDetectedCallInTray(meetingKey);
            },
          });
        } else {
          clearDetectedCallInTray(meetingKey);
          closeMeetingDetectionWindow(meetingKey);
        }

        if (
          process.platform !== 'darwin' &&
          shouldSurfaceCall &&
          meetingNotificationPolicy.shouldShow(meeting, prefState)
        ) {
          showCallDetectedNotification(meeting, {
            onTakeNotes: () => {
              void takeNotesForDetectedMeeting(meeting);
            },
            log: (msg) => console.log(msg),
          });
        }
      },
      onClear: (meetingKey) => {
        ignoredDetectedCallKeys.delete(meetingKey);
        meetingNotificationPolicy.clear(meetingKey);
        clearDetectedCallInTray(meetingKey);
        closeMeetingDetectionWindow(meetingKey);
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

async function takeNotesForDetectedMeeting(meeting: DetectedMeeting) {
  const win = await ensureMainWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  await waitForMainFrameLoad(win);
  sendDetectedMeetingStartCommand(win, meeting);
  await navigateMainWindowToWorkspace(win);
  await waitForMainFrameLoad(win);
  sendDetectedMeetingStartCommand(win, meeting);
}

function sendDetectedMeetingStartCommand(win: BrowserWindow, meeting: DetectedMeeting) {
  if (win.isDestroyed()) return;
  win.webContents.send('mila:auto-start-signal', meeting);
  win.webContents.send('mila:cmd:start-mic');
}

async function navigateMainWindowToWorkspace(win: BrowserWindow) {
  if (win.isDestroyed() || isWorkspaceUrl(win.webContents.getURL())) return;
  await win.loadURL(await workspaceUrlFor(win));
}

async function workspaceUrlFor(win: BrowserWindow) {
  const currentUrl = win.webContents.getURL();
  if (currentUrl && currentUrl !== 'about:blank') {
    try {
      const parsed = new URL(currentUrl);
      parsed.pathname = ENTRY_PATH;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    } catch {
      // Fall back to the configured entry URL below.
    }
  }

  return resolveLoadUrl();
}

function isWorkspaceUrl(rawUrl: string) {
  try {
    return new URL(rawUrl).pathname === ENTRY_PATH;
  } catch {
    return false;
  }
}

async function waitForMainFrameLoad(win: BrowserWindow) {
  if (
    win.isDestroyed() ||
    (win.webContents.getURL() && !win.webContents.isLoadingMainFrame())
  ) {
    return;
  }

  await new Promise<void>((resolve) => {
    const cleanup = () => {
      win.webContents.off('did-finish-load', done);
      win.webContents.off('did-fail-load', done);
      win.off('closed', done);
    };
    const done = () => {
      cleanup();
      resolve();
    };

    win.webContents.once('did-finish-load', done);
    win.webContents.once('did-fail-load', done);
    win.once('closed', done);
  });
}

function muteDetectedMeetingApp(meeting: DetectedMeeting) {
  const appName = meetingNotificationBody(meeting);
  const prefState = getPrefs();
  if (prefState.mutedMeetingApps.includes(appName)) return;
  setPrefs({
    mutedMeetingApps: [...prefState.mutedMeetingApps, appName],
  });
}
