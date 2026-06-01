import {
  Tray,
  Menu,
  nativeImage,
  BrowserWindow,
  app,
  shell,
  type MenuItemConstructorOptions,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ASSETS_DIR } from './config';
import { prefs, setPrefs } from './store';
import { checkForUpdatesInteractive } from './updater';
import {
  dayBucketLabel,
  formatTimeRange,
  formatTrayTitle,
  isCallInProgress,
  readUpcomingScheduledCalls,
  type ScheduledCall,
} from './calendar-schedule';
import type { DetectedMeeting } from './meeting-detector';
import { detectedCallActionCopy } from './detected-call-actions';
import { meetingNotificationKey } from './meeting-notification-policy';
import { syncLaunchAtLoginPreference } from './login-item';
import { backendAutostartAvailable, runBackendAutostartNow } from './backend-runner';
import {
  installBackendLaunchAgent,
  isBackendLaunchAgentInstalled,
  uninstallBackendLaunchAgent,
} from './launch-agent-installer';
import { applyAssistOverlayEnabled } from './assist-overlay-window';

let tray: Tray | null = null;
let scheduledCalls: ScheduledCall[] = [];
let scheduleRefreshRunning = false;
let rebuildTrayMenu: (() => void) | null = null;
let activeDetectedCall: {
  meeting: DetectedMeeting;
  actions: DetectedCallTrayActions;
} | null = null;

const SCHEDULE_REFRESH_MS = 60 * 1000;
const TRAY_CLOCK_REFRESH_MS = 30 * 1000;

type DetectedCallTrayActions = {
  onTakeNotes: () => void;
  onIgnore: () => void;
  onMuteApp: () => void;
};

export function setupTray(getWindow: () => BrowserWindow | null) {
  if (tray) return tray;
  const iconPath = path.join(
    ASSETS_DIR,
    process.platform === 'darwin' ? 'tray-Template.png' : 'tray.png',
  );
  tray = new Tray(fs.existsSync(iconPath) ? iconPath : nativeImage.createEmpty());
  tray.setToolTip('Mila — Meeting notes');

  const rebuild = () => {
    if (!tray) return;
    const launchAtLogin = prefs.get('launchAtLogin');
    updateTrayTitle();

    const menu = Menu.buildFromTemplate([
      ...buildDetectedCallItems(activeDetectedCall),
      ...buildScheduledCallItems(scheduledCalls, getWindow),
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
      {
        label: 'Coaching overlay',
        type: 'checkbox',
        checked: prefs.get('assistOverlay'),
        click: (item) => {
          setPrefs({ assistOverlay: item.checked });
          applyAssistOverlayEnabled(item.checked);
          rebuild();
        },
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
          const next = setPrefs({ launchAtLogin: item.checked });
          syncLaunchAtLoginPreference(app, next.launchAtLogin, console.warn);
          rebuild();
        },
      },
      ...buildBackendControlItems(rebuild),
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
  rebuildTrayMenu = rebuild;

  rebuild();
  void refreshScheduledCalls(rebuild);
  const scheduleInterval = setInterval(() => {
    void refreshScheduledCalls(rebuild);
  }, SCHEDULE_REFRESH_MS);
  scheduleInterval.unref?.();
  const clockInterval = setInterval(rebuild, TRAY_CLOCK_REFRESH_MS);
  clockInterval.unref?.();

  tray.on('click', () => {
    const win = getWindow();
    if (!win) return;
    if (win.isVisible()) win.hide();
    else focusWindow(win);
  });
  return tray;
}

async function refreshScheduledCalls(onChange: () => void) {
  if (scheduleRefreshRunning) return;
  scheduleRefreshRunning = true;
  try {
    scheduledCalls = await readUpcomingScheduledCalls({
      includeEventsWithoutMeetingUrl: prefs.get('showEventsWithoutParticipants'),
      visibleCalendars: prefs.get('visibleCalendars'),
    });
  } catch {
    scheduledCalls = [];
  } finally {
    scheduleRefreshRunning = false;
    onChange();
  }
}

export function refreshTrayForPreferences() {
  rebuildTrayMenu?.();
  void refreshScheduledCalls(() => rebuildTrayMenu?.());
}

export function showDetectedCallInTray(
  meeting: DetectedMeeting,
  actions: DetectedCallTrayActions,
) {
  if (
    activeDetectedCall &&
    meetingNotificationKey(activeDetectedCall.meeting) ===
      meetingNotificationKey(meeting)
  ) {
    return;
  }
  activeDetectedCall = { meeting, actions };
  rebuildTrayMenu?.();
}

export function clearDetectedCallInTray(meetingKey?: string) {
  if (
    meetingKey &&
    activeDetectedCall &&
    meetingNotificationKey(activeDetectedCall.meeting) !== meetingKey
  ) {
    return;
  }
  activeDetectedCall = null;
  rebuildTrayMenu?.();
}

// "Launch at login" governs the desktop shell; these govern the Docker backend
// the shell talks to. Only shown where we can actually run it (macOS + a source
// checkout where the autostart script ships) so the menu stays clean for a
// packaged app.
function buildBackendControlItems(
  onChange: () => void,
): MenuItemConstructorOptions[] {
  if (!backendAutostartAvailable()) return [];

  return [
    {
      label: 'Start backend at login',
      type: 'checkbox',
      checked: isBackendLaunchAgentInstalled(),
      click: (item) => {
        if (item.checked) installBackendLaunchAgent(console.log);
        else uninstallBackendLaunchAgent(console.log);
        onChange();
      },
    },
    {
      label: 'Start backend now',
      click: () => {
        runBackendAutostartNow(console.log);
      },
    },
  ];
}

function buildDetectedCallItems(
  detectedCall: typeof activeDetectedCall,
): MenuItemConstructorOptions[] {
  if (!detectedCall) return [];

  const copy = detectedCallActionCopy(detectedCall.meeting);
  return [
    {
      label: copy.title,
      sublabel: copy.providerLabel,
      enabled: false,
    },
    {
      label: copy.takeNotesLabel,
      click: detectedCall.actions.onTakeNotes,
    },
    {
      label: copy.ignoreLabel,
      click: detectedCall.actions.onIgnore,
    },
    {
      label: copy.muteLabel,
      click: detectedCall.actions.onMuteApp,
    },
    { type: 'separator' },
  ];
}

function buildScheduledCallItems(
  calls: ScheduledCall[],
  getWindow: () => BrowserWindow | null,
): MenuItemConstructorOptions[] {
  if (process.platform !== 'darwin' || calls.length === 0) return [];

  const now = new Date();
  const items: MenuItemConstructorOptions[] = [];
  let lastBucket = '';

  for (const call of calls.slice(0, 3)) {
    const bucket = dayBucketLabel(call, now);
    if (bucket !== lastBucket) {
      if (items.length > 0) items.push({ type: 'separator' });
      items.push({ label: bucket, enabled: false });
      lastBucket = bucket;
    }

    items.push({
      label: call.title,
      sublabel: formatTimeRange(call),
      click: () => openScheduledCall(call, getWindow()),
    });
  }

  items.push({ type: 'separator' });
  return items;
}

function updateTrayTitle() {
  if (!tray || process.platform !== 'darwin') return;
  const now = new Date();
  const inProgressCall = scheduledCalls.find((call) =>
    isCallInProgress(call, now),
  );
  if (prefs.get('showUpcomingInMenuBar') && inProgressCall) {
    tray.setTitle(formatTrayTitle(inProgressCall, now));
    return;
  }
  if (activeDetectedCall) {
    tray.setTitle(detectedCallActionCopy(activeDetectedCall.meeting).trayTitle);
    return;
  }
  if (!prefs.get('showUpcomingInMenuBar')) {
    tray.setTitle('');
    return;
  }
  const [nextCall] = scheduledCalls;
  tray.setTitle(nextCall ? formatTrayTitle(nextCall, now) : '');
}

function openScheduledCall(
  call: ScheduledCall,
  win: BrowserWindow | null,
) {
  if (call.meetingUrl) {
    void shell.openExternal(call.meetingUrl);
    return;
  }
  focusWindow(win);
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
