"use client";

import { useMemo, useSyncExternalStore } from "react";

export type Theme = "dark" | "light" | "system";
export type LinkSharing = "private" | "workspace" | "public";
export type TranscriptRetention = "off" | "30d" | "90d" | "1y";

export interface Preferences {
  theme: Theme;
  outputLanguage: string;
  transcriptionLanguage: string;
  summaryLanguage: string;
  apiUrl: string;
  wsUrl: string;
  autoLaunch: boolean;
  liveMeetingIndicator: boolean;
  moveAsideInMeetings: boolean;
  openSharedLinksInDesktop: boolean;
  useDataForModelImprovement: boolean;
  transcriptRetention: TranscriptRetention;
  defaultLinkSharing: LinkSharing;
  shareableLinksDefault: boolean;
  internalJargon: string;
  scheduledMeetingNotifications: boolean;
  autoDetectedMeetingNotifications: boolean;
  // Fire an alert (in-app banner when MILA is focused, OS notification when it
  // is backgrounded) the moment someone says your name in a live meeting.
  mentionAlerts: boolean;
  // Extra names/nicknames to listen for, beyond your account name. Comma- or
  // newline-separated. Useful because ASR mangles proper nouns — adding the
  // way your name is usually misheard (or short forms) widens the net.
  mentionAliases: string;
  mutedMeetingApps: string[];
  marketingEmails: boolean;
  showUpcomingInMenuBar: boolean;
  showEventsWithoutParticipants: boolean;
  visibleCalendars: Record<string, boolean>;
  workspaceName: string;
}

export const STORAGE_KEY = "mila:preferences";

export const defaultPreferences: Preferences = {
  theme: "dark",
  outputLanguage: "en",
  transcriptionLanguage: "en",
  summaryLanguage: "en",
  apiUrl: "",
  wsUrl: "",
  autoLaunch: true,
  liveMeetingIndicator: true,
  moveAsideInMeetings: true,
  openSharedLinksInDesktop: true,
  useDataForModelImprovement: false,
  transcriptRetention: "off",
  defaultLinkSharing: "workspace",
  shareableLinksDefault: false,
  internalJargon: "",
  scheduledMeetingNotifications: true,
  autoDetectedMeetingNotifications: true,
  mentionAlerts: true,
  mentionAliases: "",
  mutedMeetingApps: [],
  marketingEmails: true,
  showUpcomingInMenuBar: true,
  showEventsWithoutParticipants: true,
  visibleCalendars: {},
  workspaceName: "Mila workspace",
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

// The backend moved off :4000 (web 3000→7300, api 4000→7400). A preference
// persisted before that move can still pin apiUrl/wsUrl to the retired port;
// that is stale config, not a deliberate choice, so we drop it back to the
// current default on read instead of letting the renderer dial a dead port.
const RETIRED_API_URL = "http://localhost:4000";
const RETIRED_WS_URL = "ws://localhost:4000/meetings/live";

function healRetiredPorts(preferences: Preferences): Preferences {
  let healed = preferences;
  if (healed.apiUrl.trim().replace(/\/$/, "") === RETIRED_API_URL) {
    healed = { ...healed, apiUrl: "" };
  }
  if (healed.wsUrl.trim() === RETIRED_WS_URL) {
    healed = { ...healed, wsUrl: "" };
  }
  return healed;
}

function parsePreferences(raw: string): Preferences {
  if (!raw) return defaultPreferences;
  try {
    return healRetiredPorts({
      ...defaultPreferences,
      ...(JSON.parse(raw) as Partial<Preferences>),
    });
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

// Intentionally empty by default: the browser calls its own same-origin
// `/api/*` route handlers (a BFF that injects the session token and proxies to
// the backend at MILA_API_INTERNAL_URL server-side). Non-browser shells like
// Electron set `preferences.apiUrl` so they hit the backend directly instead.
// A hosted browser deploy can set NEXT_PUBLIC_API_BASE_URL to bypass the BFF.
const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const DEFAULT_WS_URL =
  process.env.NEXT_PUBLIC_API_WS_URL ?? "ws://localhost:7400/meetings/live";

export function resolveApiUrl(preferences: Preferences): string {
  // In the desktop shell every HTTP call goes through the same-origin embedded
  // BFF (the Next route handlers proxy to MILA_API_INTERNAL_URL server-side).
  // The renderer is served from a random http://127.0.0.1:<port> origin that the
  // API's CORS allowlist does not include, so a direct renderer→backend call is
  // blocked. Force relative so we always use the BFF, regardless of whatever
  // apiUrl a previous build may have synced from the native store.
  if (typeof window !== "undefined" && "mila" in window) {
    return "";
  }
  const trimmed = preferences.apiUrl.trim().replace(/\/$/, "");
  return trimmed || DEFAULT_API_URL;
}

export function resolveWsUrl(preferences: Preferences): string {
  const trimmed = preferences.wsUrl.trim();
  return trimmed || DEFAULT_WS_URL;
}
