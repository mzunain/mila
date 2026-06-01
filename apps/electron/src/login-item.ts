type LoginItemSettings = {
  openAtLogin?: boolean;
  openAsHidden?: boolean;
  wasOpenedAtLogin?: boolean;
  wasOpenedAsHidden?: boolean;
};

type LoginItemOptions = {
  openAtLogin: boolean;
  openAsHidden?: boolean;
};

type LoginItemApp = {
  getLoginItemSettings: () => LoginItemSettings;
  setLoginItemSettings: (settings: LoginItemOptions) => void;
};

export function buildLoginItemSettings(
  launchAtLogin: boolean,
  platform: NodeJS.Platform = process.platform,
): LoginItemOptions {
  if (platform === 'darwin') {
    return {
      openAtLogin: launchAtLogin,
      openAsHidden: launchAtLogin,
    };
  }

  return { openAtLogin: launchAtLogin };
}

export function readLoginItemSettings(app: LoginItemApp): LoginItemSettings {
  try {
    return app.getLoginItemSettings();
  } catch {
    return {};
  }
}

export function syncLaunchAtLoginPreference(
  app: LoginItemApp,
  launchAtLogin: boolean,
  log: (message: string, error?: unknown) => void = () => undefined,
) {
  try {
    app.setLoginItemSettings(buildLoginItemSettings(launchAtLogin));
    return true;
  } catch (error) {
    log('[login-item] could not update launch-at-login setting', error);
    return false;
  }
}

export function shouldShowMainWindowOnReady(
  preferences: { startMinimized: boolean },
  loginSettings: LoginItemSettings,
) {
  if (preferences.startMinimized) return false;
  if (loginSettings.wasOpenedAtLogin || loginSettings.wasOpenedAsHidden) {
    return false;
  }
  return true;
}
