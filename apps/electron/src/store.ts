import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type Preferences = {
  apiUrl: string;
  wsUrl: string;
  startMinimized: boolean;
  launchAtLogin: boolean;
  theme: 'system' | 'light' | 'dark';
  windowBounds: { x?: number; y?: number; width: number; height: number };
};

const DEFAULTS: Preferences = {
  apiUrl: process.env.MILA_API_INTERNAL_URL ?? 'http://localhost:4000',
  wsUrl: process.env.NEXT_PUBLIC_API_WS_URL ?? 'ws://localhost:4000/meetings/live',
  startMinimized: false,
  launchAtLogin: false,
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
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    next = { ...DEFAULTS, ...parsed };
  } catch {
    next = { ...DEFAULTS };
  }
  cache = next;
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
    cache = next;
    persist();
  },
};

export function getPrefs(): Preferences {
  return { ...load() };
}

export function setPrefs(patch: Partial<Preferences>): Preferences {
  cache = { ...load(), ...patch };
  persist();
  return getPrefs();
}
