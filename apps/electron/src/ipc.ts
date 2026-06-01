import { ipcMain, shell, BrowserWindow, app } from 'electron';
import { getPrefs, setPrefs, type Preferences } from './store';
import { readUpcomingScheduledCalls } from './calendar-schedule';
import { refreshTrayForPreferences } from './tray';
import { syncLaunchAtLoginPreference } from './login-item';
import {
  checkForUpdatesInteractive,
  installUpdateAndRestart,
} from './updater';

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
}
