import { app } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { autostartScriptCandidates } from './backend-paths';

// Impure glue around the headless autostart script. The pure path math lives in
// ./backend-paths and the health math in ./backend-health so this thin layer
// stays out of the unit tests (it touches electron, fs, child_process, fetch).

/** First existing autostart script path, or null (e.g. a packaged .app). */
export function resolveAutostartScript(): string | null {
  for (const candidate of autostartScriptCandidates(app.getAppPath())) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore unreadable candidates
    }
  }
  return null;
}

/** Whether running the backend from the app is possible here (macOS + source run). */
export function backendAutostartAvailable(): boolean {
  return process.platform === 'darwin' && resolveAutostartScript() !== null;
}

/** Probe the backend health endpoint once. Resolves true on a 2xx response. */
export async function probeBackendHealth(
  healthUrl: string,
  timeoutMs = 3_000,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Launch the headless autostart script detached so it can bring the Docker
 * stack up while the app waits for health. Returns true if it was spawned.
 */
export function runBackendAutostartNow(
  log: (message: string) => void = () => undefined,
): boolean {
  const script = resolveAutostartScript();
  if (!script) {
    log('[backend] autostart script not found; skipping recovery.');
    return false;
  }
  try {
    const child = spawn('/bin/bash', [script], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    log(`[backend] launched ${script}`);
    return true;
  } catch (err) {
    log(`[backend] failed to launch autostart script: ${String(err)}`);
    return false;
  }
}
