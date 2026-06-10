import { ipcMain, shell, BrowserWindow, app, Notification } from 'electron';
import { getPrefs, setPrefs, type Preferences } from './store';
import { readUpcomingScheduledCalls } from './calendar-schedule';
import { refreshTrayForPreferences, setRecordingState } from './tray';
import { syncLaunchAtLoginPreference } from './login-item';
import {
  checkForUpdatesInteractive,
  installUpdateAndRestart,
} from './updater';
import { ingestAssistState } from './assist-overlay-window';
import { loopbackSupportedHere } from './loopback';
import type { AssistStateInput } from './assist-overlay-content';

// Payload the renderer sends to raise an OS notification (mention alerts).
type DesktopNotificationInput = {
  title: string;
  body: string;
  // Echoed back on click so the renderer can jump to the exact mention.
  tag?: string;
  silent?: boolean;
};

export function registerIpcHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('mila:prefs:get', () => getPrefs());
  ipcMain.handle('mila:prefs:set', (_e, patch: Partial<Preferences>) => {
    const next = setPrefs(patch);
    if (patch.launchAtLogin !== undefined) {
      syncLaunchAtLoginPreference(app, !!next.launchAtLogin, console.warn);
    }
    refreshTrayForPreferences();
    return next;
  });

  ipcMain.handle('mila:calendar:upcoming', () => {
    const prefState = getPrefs();
    return readUpcomingScheduledCalls({
      lookaheadHours: 72,
      limit: 8,
      includeEventsWithoutMeetingUrl: prefState.showEventsWithoutParticipants,
      visibleCalendars: prefState.visibleCalendars,
    });
  });

  ipcMain.handle('mila:updates:check', () =>
    checkForUpdatesInteractive(getWindow),
  );
  ipcMain.handle('mila:updates:install', () => installUpdateAndRestart());

  ipcMain.handle('mila:open-external', (_e, url: string) => {
    if (typeof url !== 'string') return;
    if (!/^https?:\/\//i.test(url) && !url.startsWith('mailto:')) return;
    return shell.openExternal(url);
  });

  ipcMain.handle('mila:show-in-folder', (_e, target: string) => {
    if (typeof target !== 'string' || !target) return;
    shell.showItemInFolder(target);
  });

  // The web workspace forwards live coaching state; the overlay renders it only
  // when the user has the floating overlay enabled (driven from the tray).
  ipcMain.handle('mila:assist:overlay-update', (_e, state: AssistStateInput) => {
    ingestAssistState(state ?? {});
  });

  ipcMain.handle('mila:loopback:supported', () => loopbackSupportedHere());

  // Drives the menu-bar recording badge. The renderer already decides whether
  // the indicator should show (it folds in the "Live meeting indicator"
  // preference), so the tray just reflects whatever active state it's handed.
  ipcMain.handle('mila:recording:state', (_e, state: unknown) => {
    const active = Boolean((state as { active?: unknown } | null)?.active);
    const rawTitle = (state as { title?: unknown } | null)?.title;
    const title = typeof rawTitle === 'string' ? rawTitle : undefined;
    setRecordingState({ active, title });
  });

  // Generic OS notification bridge for the renderer. Mention alerts use this so
  // the user is pinged natively even when the meeting window is backgrounded —
  // the in-app banner only helps when MILA is already in front. Clicking the
  // notification surfaces the window and tells the renderer which mention fired
  // (via the echoed tag) so it can scroll straight to it.
  ipcMain.handle('mila:notify:supported', () => Notification.isSupported());
  ipcMain.handle('mila:notify:show', (_e, input: DesktopNotificationInput) => {
    if (
      !input ||
      typeof input.title !== 'string' ||
      typeof input.body !== 'string' ||
      !Notification.isSupported()
    ) {
      return false;
    }

    const tag = typeof input.tag === 'string' ? input.tag : null;
    const notification = new Notification({
      title: input.title,
      body: input.body,
      silent: input.silent === true,
    });

    notification.on('click', () => {
      const win = getWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        win.flashFrame(false);
      }
      win?.webContents.send('mila:notify:activated', tag);
    });
    notification.show();

    // Draw attention in the dock/taskbar even if the user never clicks.
    const win = getWindow();
    if (win && !win.isFocused()) win.flashFrame(true);
    return true;
  });
}
