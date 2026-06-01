import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type Preferences = {
  apiUrl: string;
  wsUrl: string;
  startMinimized: boolean;
  launchAtLogin: boolean;
  launchAtLoginConfigured: boolean;
  showUpcomingInMenuBar: boolean;
  showEventsWithoutParticipants: boolean;
  visibleCalendars: Record<string, boolean>;
  autoDetectedMeetingNotifications: boolean;
  mutedMeetingApps: string[];
  theme: 'system' | 'light' | 'dark';
  windowBounds: { x?: number; y?: number; width: number; height: number };
};

const DEFAULTS: Preferences = {
  apiUrl: process.env.MILA_API_INTERNAL_URL ?? 'http://localhost:4000',
  wsUrl: process.env.NEXT_PUBLIC_API_WS_URL ?? 'ws://localhost:4000/meetings/live',
  startMinimized: false,
  launchAtLogin: true,
  launchAtLoginConfigured: false,
  showUpcomingInMenuBar: true,
  showEventsWithoutParticipants: true,
  visibleCalendars: {},
  autoDetectedMeetingNotifications: true,
  mutedMeetingApps: [],
  theme: 'system',
  windowBounds: { width: 1280, height: 840 },
};

let cache: Preferences | null = null;

function configPath(): string {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function load(): Preferences {
  if (cache) return cache;
  let next: Preferences;
  let shouldPersist = false;
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    next = { ...DEFAULTS, ...parsed };
    if (parsed.launchAtLoginConfigured !== true) {
      next.launchAtLogin = true;
      next.launchAtLoginConfigured = true;
      shouldPersist = true;
    }
  } catch {
    next = {
      ...DEFAULTS,
      launchAtLogin: true,
      launchAtLoginConfigured: true,
    };
    shouldPersist = true;
  }
  cache = next;
  if (shouldPersist) persist();
  return next;
}

function persist(): void {
  if (!cache) return;
  const target = configPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

export const prefs = {
  get<K extends keyof Preferences>(key: K): Preferences[K] {
    return load()[key];
  },
  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    const next = { ...load(), [key]: value };
    if (key === 'launchAtLogin') {
      next.launchAtLoginConfigured = true;
    }
    cache = next;
    persist();
  },
};

export function getPrefs(): Preferences {
  return { ...load() };
}

export function setPrefs(patch: Partial<Preferences>): Preferences {
  cache = {
    ...load(),
    ...patch,
    ...(patch.launchAtLogin !== undefined
      ? { launchAtLoginConfigured: true }
      : {}),
  };
  persist();
  return getPrefs();
}
