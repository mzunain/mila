import Constants from "expo-constants";

interface ApiInit extends RequestInit {
  token?: string | null;
}

export function getApiBaseUrl(): string {
  const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)
    ?.apiBaseUrl;
  return fromExtra ?? "http://localhost:4000";
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
