import { contextBridge, ipcRenderer } from 'electron';

const COMMAND_CHANNELS = [
  'mila:cmd:new-meeting',
  'mila:cmd:quick-note',
  'mila:cmd:preferences',
  'mila:cmd:start-mic',
  'mila:cmd:stop-mic',
] as const;

type CommandChannel = (typeof COMMAND_CHANNELS)[number];

type WorkspaceCommand =
  | 'mila:desktop-new-meeting'
  | 'mila:desktop-start-mic'
  | 'mila:desktop-stop-mic';

// State the web workspace forwards to drive the floating coaching overlay. The
// suggestion is passed through opaquely (the overlay normalizes it); the main
// process decides whether to render based on the overlay preference.
type AssistOverlayState = {
  enabled?: boolean;
  live?: boolean;
  pending?: boolean;
  suggestion?: unknown;
  unavailable?: 'no-model' | 'no-suggestion' | null;
};

// Payload for raising an OS notification from the renderer (mention alerts).
type DesktopNotificationInput = {
  title: string;
  body: string;
  /** Echoed back on click so the renderer can jump to the exact mention. */
  tag?: string;
  silent?: boolean;
};

// State the workspace forwards so the menu-bar shows a live recording badge.
// `active` is the only thing the tray needs; `title` rides along for the tooltip.
type RecordingStateInput = {
  active: boolean;
  title?: string;
};

const PENDING_WORKSPACE_COMMAND_KEY = 'mila:pending-desktop-command';
const commandListenerCounts = new Map<CommandChannel, number>();

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
  getUpcomingCalendarEvents: () => ipcRenderer.invoke('mila:calendar:upcoming'),
  checkForUpdates: () => ipcRenderer.invoke('mila:updates:check'),
  installUpdateAndRestart: () => ipcRenderer.invoke('mila:updates:install'),
  openExternal: (url: string) => ipcRenderer.invoke('mila:open-external', url),
  showItemInFolder: (path: string) => ipcRenderer.invoke('mila:show-in-folder', path),
  // Live coaching copilot bridge. `assist.update` feeds the floating overlay;
  // `loopback.isSupported` lets the renderer know whether it can capture the
  // remote party's audio (system loopback) rather than mic-only.
  assist: {
    update: (state: AssistOverlayState) =>
      ipcRenderer.invoke('mila:assist:overlay-update', state),
  },
  loopback: {
    isSupported: (): Promise<boolean> =>
      ipcRenderer.invoke('mila:loopback:supported'),
  },
  // Tells the main process whether a live transcription is running, so the
  // menu-bar can show an unmistakable "🔴 REC" badge even while the Mila window
  // is hidden behind the call. Gated by the renderer on the user's "Live meeting
  // indicator" preference.
  recording: {
    setState: (state: RecordingStateInput) =>
      ipcRenderer.invoke('mila:recording:state', state),
  },
  // Generic OS notifications, used by mention alerts when the meeting window is
  // backgrounded. `show` resolves to whether the notification was actually
  // posted; `onActivated` fires when the user clicks one (the main process
  // focuses the window first, then passes back the notification's tag).
  notifications: {
    isSupported: (): Promise<boolean> =>
      ipcRenderer.invoke('mila:notify:supported'),
    show: (input: DesktopNotificationInput): Promise<boolean> =>
      ipcRenderer.invoke('mila:notify:show', input),
    onActivated: (cb: (tag: string | null) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, tag: string | null) => cb(tag);
      ipcRenderer.on('mila:notify:activated', handler);
      return () => ipcRenderer.removeListener('mila:notify:activated', handler);
    },
  },
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
    commandListenerCounts.set(channel, (commandListenerCounts.get(channel) ?? 0) + 1);
    const handler = () => cb();
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
      const nextCount = (commandListenerCounts.get(channel) ?? 1) - 1;
      if (nextCount <= 0) commandListenerCounts.delete(channel);
      else commandListenerCounts.set(channel, nextCount);
    };
  },
};

contextBridge.exposeInMainWorld('mila', milaBridge);

for (const channel of COMMAND_CHANNELS) {
  ipcRenderer.on(channel, () => {
    const command = toWorkspaceCommand(channel);
    if (!command) return;

    persistPendingWorkspaceCommand(command);

    // If React has not mounted the command router yet but the workspace is
    // already visible, send the DOM event directly. Once the router is mounted,
    // it owns live dispatch and this listener only provides the persisted
    // fallback for route changes and hydration gaps.
    if (!commandListenerCounts.has(channel) && window.location.pathname === '/app') {
      window.dispatchEvent(new Event(command));
    }
  });
}

function markDesktopShell() {
  const root = document.documentElement;
  if (!root) return false;
  root.dataset.milaShell = 'electron';
  root.dataset.milaPlatform = process.platform;
  return true;
}

if (!markDesktopShell()) {
  window.addEventListener('DOMContentLoaded', markDesktopShell, { once: true });
}

// Bridge meeting-detector signals from the main process into a window-scoped
// `message` event. The MeetingWorkspace already listens for postMessage events
// matching the `mila:meeting-joined` shape via `normalizeAutoStartSignal`, so
// this single re-broadcast wires Electron-side OS detection into the existing
// auto-start flow without touching any web code.
ipcRenderer.on('mila:auto-start-signal', (_event, signal: unknown) => {
  const event = toDesktopMeetingJoinedEvent(signal);
  persistMeetingSignal(event);
  window.postMessage(event, window.location.origin);
});

function persistMeetingSignal(signal: unknown) {
  try {
    window.localStorage.setItem('mila:meeting-signal', JSON.stringify(signal));
  } catch {
    // Storage can be unavailable in hardened or private contexts. The
    // postMessage path still works when the workspace is already mounted.
  }
}

function persistPendingWorkspaceCommand(command: WorkspaceCommand) {
  try {
    window.sessionStorage.setItem(PENDING_WORKSPACE_COMMAND_KEY, command);
  } catch {
    // The in-memory command route still works when the React bridge is mounted.
  }
}

function toWorkspaceCommand(channel: CommandChannel): WorkspaceCommand | null {
  switch (channel) {
    case 'mila:cmd:new-meeting':
      return 'mila:desktop-new-meeting';
    case 'mila:cmd:start-mic':
      return 'mila:desktop-start-mic';
    case 'mila:cmd:stop-mic':
      return 'mila:desktop-stop-mic';
    default:
      return null;
  }
}

function toDesktopMeetingJoinedEvent(signal: unknown) {
  const payload = isRecord(signal) ? signal : {};
  const mockAudio = readBoolean(payload.mockAudio) ?? false;

  return {
    type: 'mila:meeting-joined',
    payload: {
      ...payload,
      provider: normalizeDesktopProvider(readString(payload.provider)),
      source: 'auto-desktop',
      detectedAt: readString(payload.detectedAt) ?? new Date().toISOString(),
      captureAudio: readBoolean(payload.captureAudio) ?? !mockAudio,
      mockAudio,
    },
  };
}

function normalizeDesktopProvider(provider: string | undefined) {
  switch (provider) {
    case 'zoom':
    case 'microsoft-teams':
    case 'google-meet':
    case 'slack-huddle':
    case 'whatsapp-web':
      return provider;
    case 'slack':
      return 'slack-huddle';
    case 'whatsapp':
      return 'whatsapp-web';
    default:
      return 'unknown';
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export type MilaBridge = typeof milaBridge;
