import "server-only";

export function getApiBaseUrl() {
  return process.env.MILA_API_INTERNAL_URL ?? "http://localhost:7400";
}

export async function apiFetch(
  path: string,
  init: RequestInit & { token?: string | null } = {},
) {
  const { token, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);
  if (token) finalHeaders.set("authorization", `Bearer ${token}`);
  return fetch(`${getApiBaseUrl()}${path}`, {
    ...rest,
    headers: finalHeaders,
    cache: "no-store",
  });
}
