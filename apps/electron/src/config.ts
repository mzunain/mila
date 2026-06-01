import { app } from 'electron';
import path from 'node:path';

export const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

export const APP_NAME = 'Mila';
export const APP_PROTOCOL = 'mila';
export const APP_BUNDLE_ID = 'app.mila.desktop';

// Entry route for the desktop shell. The marketing landing lives at "/"
// and stays web-only — the desktop app opens straight into the workspace,
// which redirects signed-out users to /login.
export const ENTRY_PATH = '/app';

export const DEV_URL =
  process.env.MILA_DEV_URL ?? `http://localhost:7300${ENTRY_PATH}`;

export const RESOURCES_DIR = isDev
  ? path.join(__dirname, '..')
  : process.resourcesPath;

export const WEB_BUNDLE_DIR = path.join(RESOURCES_DIR, 'web');

export const ASSETS_DIR = isDev
  ? path.join(__dirname, '..', 'assets')
  : path.join(process.resourcesPath, 'assets');

export const DEFAULT_WINDOW = {
  width: 1280,
  height: 840,
  minWidth: 980,
  minHeight: 640,
} as const;
