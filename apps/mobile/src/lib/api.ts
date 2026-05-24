import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

interface ApiInit extends RequestInit {
  token?: string | null;
}

const STORAGE_KEY = "mila_api_base_url";

let cachedBaseUrl: string | null = null;
let initialized = false;

function getDefaultBaseUrl(): string {
  const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)
    ?.apiBaseUrl;
  return fromExtra ?? "http://localhost:4000";
}

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Load the persisted API base URL from AsyncStorage on app boot. Must be
 * called before any apiFetch — wired up from app/_layout.tsx so it runs
 * exactly once, before any tab can mount.
 */
export async function initApi(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    cachedBaseUrl = stored ? normalize(stored) : getDefaultBaseUrl();
  } catch {
    cachedBaseUrl = getDefaultBaseUrl();
  }
}

export function getApiBaseUrl(): string {
  return cachedBaseUrl ?? getDefaultBaseUrl();
}

export function getDefaultApiBaseUrl(): string {
  return getDefaultBaseUrl();
}

export async function setApiBaseUrl(url: string): Promise<void> {
  cachedBaseUrl = normalize(url);
  await AsyncStorage.setItem(STORAGE_KEY, cachedBaseUrl);
}

export async function resetApiBaseUrl(): Promise<void> {
  cachedBaseUrl = getDefaultBaseUrl();
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function getMeetingsWsUrl(token: string): string {
  const base = getApiBaseUrl().replace(/^http/i, (m) =>
    m.toLowerCase() === "https" ? "wss" : "ws",
  );
  return `${base}/meetings/live?token=${encodeURIComponent(token)}`;
}

export async function apiFetch(path: string, init: ApiInit = {}) {
  const { token, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);
  if (token) finalHeaders.set("authorization", `Bearer ${token}`);
  if (!finalHeaders.has("accept")) finalHeaders.set("accept", "application/json");
  return fetch(`${getApiBaseUrl()}${path}`, {
    ...rest,
    headers: finalHeaders,
  });
}
