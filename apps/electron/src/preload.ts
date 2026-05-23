import { contextBridge, ipcRenderer } from 'electron';

const COMMAND_CHANNELS = [
  'mila:cmd:new-meeting',
  'mila:cmd:quick-note',
  'mila:cmd:preferences',
  'mila:cmd:start-mic',
  'mila:cmd:stop-mic',
] as const;

type CommandChannel = (typeof COMMAND_CHANNELS)[number];

const milaBridge = {
  platform: process.platform as NodeJS.Platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  getPreferences: () => ipcRenderer.invoke('mila:prefs:get'),
  setPreferences: (patch: Record<string, unknown>) =>
    ipcRenderer.invoke('mila:prefs:set', patch),
  checkForUpdates: () => ipcRenderer.invoke('mila:updates:check'),
  installUpdateAndRestart: () => ipcRenderer.invoke('mila:updates:install'),
  openExternal: (url: string) => ipcRenderer.invoke('mila:open-external', url),
  showItemInFolder: (path: string) => ipcRenderer.invoke('mila:show-in-folder', path),
  onUpdateStatus: (cb: (status: string, info?: unknown) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, status: string, info?: unknown) =>
      cb(status, info);
    ipcRenderer.on('mila:updates:status', handler);
    return () => ipcRenderer.removeListener('mila:updates:status', handler);
  },
  onDeepLink: (cb: (url: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, url: string) => cb(url);
    ipcRenderer.on('mila:deep-link', handler);
    return () => ipcRenderer.removeListener('mila:deep-link', handler);
  },
  onCommand: (channel: CommandChannel, cb: () => void) => {
    if (!COMMAND_CHANNELS.includes(channel)) {
      throw new Error(`Unknown Mila command channel: ${channel}`);
    }
    const handler = () => cb();
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
};

contextBridge.exposeInMainWorld('mila', milaBridge);

export type MilaBridge = typeof milaBridge;
