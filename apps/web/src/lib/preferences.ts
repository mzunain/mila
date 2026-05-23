"use client";

import { useMemo, useSyncExternalStore } from "react";

export type Theme = "dark" | "light" | "system";

export interface Preferences {
  theme: Theme;
  outputLanguage: string;
  apiUrl: string;
  wsUrl: string;
  autoLaunch: boolean;
  shareableLinksDefault: boolean;
}

export const STORAGE_KEY = "mila:preferences";

export const defaultPreferences: Preferences = {
  theme: "dark",
  outputLanguage: "en",
  apiUrl: "",
  wsUrl: "",
  autoLaunch: true,
  shareableLinksDefault: false,
};

let cachedSnapshot: string | null = null;

function readSnapshot(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => {
    cachedSnapshot = null;
    callback();
  };
  window.addEventListener("storage", handler);
  window.addEventListener("mila:preferences-changed", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("mila:preferences-changed", handler);
  };
}

function getSnapshot() {
  if (cachedSnapshot === null) cachedSnapshot = readSnapshot();
  return cachedSnapshot;
}

function getServerSnapshot() {
  return "";
}

function parsePreferences(raw: string): Preferences {
  if (!raw) return defaultPreferences;
  try {
    return {
      ...defaultPreferences,
      ...(JSON.parse(raw) as Partial<Preferences>),
    };
  } catch {
    return defaultPreferences;
  }
}

export function usePreferences(): {
  preferences: Preferences;
  hydrated: boolean;
} {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const preferences = useMemo(() => parsePreferences(stored), [stored]);
  const hydrated = stored !== "" || cachedSnapshot !== null;
  return { preferences, hydrated };
}

export function savePreferences(preferences: Preferences) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  cachedSnapshot = null;
  window.dispatchEvent(new Event("mila:preferences-changed"));
}

export function clearPreferences() {
  window.localStorage.removeItem(STORAGE_KEY);
  cachedSnapshot = null;
  window.dispatchEvent(new Event("mila:preferences-changed"));
}

const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const DEFAULT_WS_URL =
  process.env.NEXT_PUBLIC_API_WS_URL ?? "ws://localhost:4000/meetings/live";

export function resolveApiUrl(preferences: Preferences): string {
  const trimmed = preferences.apiUrl.trim().replace(/\/$/, "");
  return trimmed || DEFAULT_API_URL;
}

export function resolveWsUrl(preferences: Preferences): string {
  const trimmed = preferences.wsUrl.trim();
  return trimmed || DEFAULT_WS_URL;
}
