// Pure helpers for probing the MILA backend API health from the desktop shell.
// No electron imports here so the logic stays unit-testable under `node --test`.

/**
 * Derive the API health endpoint from a configured API base URL. Accepts values
 * with or without a trailing slash or path and always returns
 * `${origin}/api/health` (the route run.sh and the Docker stack expose).
 */
export function healthUrlFromApiUrl(apiUrl: string): string {
  const trimmed = (apiUrl ?? '').trim();
  // Without a scheme, `new URL('localhost:7400')` treats "localhost" as the
  // protocol and yields an opaque (null) origin. Prepend http:// so a bare
  // host:port resolves to a usable origin — fetch needs a scheme regardless.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  try {
    return `${new URL(withScheme).origin}/api/health`;
  } catch {
    const base = trimmed.replace(/\/+$/, '');
    return `${base}/api/health`;
  }
}

export type PollHealthOptions = {
  /** Resolves true when the backend is healthy, false (or throws) otherwise. */
  probe: () => Promise<boolean>;
  /** Total time to keep trying before giving up. */
  timeoutMs: number;
  /** Delay between attempts. */
  intervalMs: number;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Optional cooperative cancellation. */
  signal?: { aborted: boolean };
};

/**
 * Poll `probe` until it reports healthy or the timeout elapses. Resolves true
 * if the backend came up in time, false otherwise. Never rejects — a throwing
 * probe is treated as "not yet healthy".
 */
export async function pollHealth(opts: PollHealthOptions): Promise<boolean> {
  const now = opts.now ?? (() => Date.now());
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + opts.timeoutMs;

  for (;;) {
    if (opts.signal?.aborted) return false;

    let healthy = false;
    try {
      healthy = await opts.probe();
    } catch {
      healthy = false;
    }
    if (healthy) return true;
    // Stop once there is no time for another attempt before the deadline, so we
    // never probe past the timeout.
    if (now() + opts.intervalMs >= deadline) return false;

    await sleep(opts.intervalMs);
  }
}
