import { autoUpdater } from 'electron-updater';
import { BrowserWindow, dialog, app } from 'electron';
import { isDev } from './config';

let initialized = false;

export function initAutoUpdater(getWindow: () => BrowserWindow | null) {
  if (initialized || isDev) return;
  initialized = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const broadcast = (status: string, info?: unknown) => {
    const win = getWindow();
    win?.webContents.send('mila:updates:status', status, info);
  };

  autoUpdater.on('checking-for-update', () => broadcast('checking'));
  autoUpdater.on('update-available', (info) => broadcast('available', info));
  autoUpdater.on('update-not-available', (info) =>
    broadcast('not-available', info),
  );
  autoUpdater.on('download-progress', (progress) =>
    broadcast('downloading', progress),
  );
  autoUpdater.on('update-downloaded', (info) => {
    broadcast('downloaded', info);
    const win = getWindow();
    if (!win) return;
    void dialog
      .showMessageBox(win, {
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update ready',
        message: `Mila ${info.version} is ready to install.`,
        detail: 'The app will restart to apply the update.',
      })
      .then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall();
      });
  });
  autoUpdater.on('error', (err) => {
    broadcast('error', { message: err?.message ?? String(err) });
    console.error('[updater]', err);
  });

  // Schedule once an hour after launch — release host is set via publish config.
  void checkForUpdatesQuiet();
  setInterval(() => void checkForUpdatesQuiet(), 60 * 60 * 1000);
}

export async function checkForUpdatesInteractive(getWindow: () => BrowserWindow | null) {
  if (isDev) {
    const win = getWindow();
    if (win)
      void dialog.showMessageBox(win, {
        type: 'info',
        message: 'Auto-updates are disabled in dev builds.',
      });
    return;
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result || !result.updateInfo) {
      const win = getWindow();
      if (win)
        void dialog.showMessageBox(win, {
          type: 'info',
          message: `Mila is up to date (${app.getVersion()}).`,
        });
    }
  } catch (err) {
    console.error('[updater] manual check failed', err);
  }
}

async function checkForUpdatesQuiet() {
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('[updater] background check failed', err);
  }
}

export function installUpdateAndRestart() {
  autoUpdater.quitAndInstall();
}
