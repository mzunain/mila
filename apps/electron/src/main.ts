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
  refreshTrayForPreferences,
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
import { readLoginItemSettings, syncLaunchAtLoginPreference } from './login-item';
import { healthUrlFromApiUrl, pollHealth } from './backend-health';
import { probeBackendHealth, runBackendAutostartNow } from './backend-runner';
import { closeBackendSplash, showBackendSplash } from './splash-window';
import { enableLoopbackAudioCapture } from './loopback';
import {
  applyAssistOverlayEnabled,
  setAssistOverlayHideHandler,
} from './assist-overlay-window';

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

// Pull the workspace to the foreground hard enough to clear a fullscreen call
// app. A bare `win.show()/focus()` loses to a fullscreen Zoom/Meet Space — the
// window stays hidden and "Take Notes" looks dead. Activating the app with
// `steal` switches to the window's Space and raises it above the call.
function surfaceMainWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.moveTop();
  app.focus({ steal: true });
  win.focus();
}

app.on('second-instance', (_event, argv) => {
  const win = getMainWindow();
  if (win) {
    surfaceMainWindow(win);
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

  // Dismissing the floating coaching overlay from its own × button turns the
  // preference off so the tray checkbox and the next launch agree.
  setAssistOverlayHideHandler(() => {
    setPrefs({ assistOverlay: false });
    refreshTrayForPreferences();
  });
  applyAssistOverlayEnabled(getPrefs().assistOverlay);

  try {
    try {
      await gateBackendOnStartup();
    } catch (gateErr) {
      console.error('[main] backend gate failed', gateErr);
      closeBackendSplash();
    }

    const win = await ensureMainWindow();
    // Let the workspace capture the remote party's audio (system loopback) for
    // the live copilot, not just the mic. No-op off macOS / older Electron.
    enableLoopbackAudioCapture(win);
    // Hand off from the splash to the workspace once it has content.
    win.webContents.once('did-finish-load', () => closeBackendSplash());
    win.webContents.once('did-fail-load', () => closeBackendSplash());
    const splashSafety = setTimeout(() => closeBackendSplash(), 8_000);
    splashSafety.unref?.();

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
    closeBackendSplash();
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
    surfaceMainWindow(win);
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

// The desktop app launches at login but is a thin client — without the Docker
// backend up, the workspace loads into a 500. When the user actively opens the
// app and the API is down, show a splash, bring the stack up, and wait for
// health before loading the workspace. This is best-effort: it never blocks
// startup longer than the timeout and never makes things worse than today.
const BACKEND_GATE_TIMEOUT_MS = 90_000;

async function gateBackendOnStartup(): Promise<void> {
  // In dev the developer runs the API + web themselves (pnpm dev / run.sh).
  if (isDev) return;

  // On a hidden login launch the LaunchAgent brings the backend up on its own;
  // a splash popping up unprompted would be intrusive. Only intervene when the
  // user is actually opening the app to the foreground.
  const loginSettings = readLoginItemSettings(app);
  if (loginSettings.wasOpenedAtLogin || loginSettings.wasOpenedAsHidden) return;

  const healthUrl = healthUrlFromApiUrl(getPrefs().apiUrl);
  if (await probeBackendHealth(healthUrl)) return; // already healthy — no splash

  showBackendSplash();
  runBackendAutostartNow((message) => console.log(message));
  await pollHealth({
    probe: () => probeBackendHealth(healthUrl),
    timeoutMs: BACKEND_GATE_TIMEOUT_MS,
    intervalMs: 2_000,
  });
  // Healthy or timed out — fall through and load the workspace either way. The
  // splash is dismissed once the main window has content (see whenReady).
}

async function takeNotesForDetectedMeeting(meeting: DetectedMeeting) {
  const win = await ensureMainWindow();
  surfaceMainWindow(win);
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
