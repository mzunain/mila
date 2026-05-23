import { BrowserWindow, shell, nativeTheme } from 'electron';
import path from 'node:path';
import { DEFAULT_WINDOW, isDev, ASSETS_DIR } from './config';
import { prefs } from './store';

const PRELOAD_PATH = path.join(__dirname, 'preload.js');

export function createMainWindow(loadUrl: string): BrowserWindow {
  const bounds = prefs.get('windowBounds');
  const theme = prefs.get('theme');
  if (theme === 'light' || theme === 'dark') {
    nativeTheme.themeSource = theme;
  } else {
    nativeTheme.themeSource = 'system';
  }

  const win = new BrowserWindow({
    width: bounds?.width ?? DEFAULT_WINDOW.width,
    height: bounds?.height ?? DEFAULT_WINDOW.height,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: DEFAULT_WINDOW.minWidth,
    minHeight: DEFAULT_WINDOW.minHeight,
    title: 'Mila',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#fafafa',
    icon: getIcon(),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 16 } : undefined,
    autoHideMenuBar: process.platform !== 'darwin',
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => {
    if (!prefs.get('startMinimized')) {
      win.show();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    const allowed = new URL(loadUrl);
    if (parsed.origin !== allowed.origin) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.on('close', () => {
    const next = win.getBounds();
    prefs.set('windowBounds', next);
  });

  win.loadURL(loadUrl);
  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

function getIcon(): string | undefined {
  if (process.platform === 'win32') {
    return path.join(ASSETS_DIR, 'icon.ico');
  }
  if (process.platform === 'linux') {
    return path.join(ASSETS_DIR, 'icon.png');
  }
  return undefined;
}
