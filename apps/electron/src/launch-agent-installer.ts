import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveAutostartScript } from './backend-runner';
import {
  BACKEND_LAUNCH_AGENT_LABEL,
  backendLaunchAgentPlistPath,
  buildBackendLaunchAgentPlist,
} from './launch-agent';

// Impure glue around launchd. The pure plist math lives in ./launch-agent so
// this thin layer (fs + child_process + os.homedir) stays out of the unit
// tests, mirroring backend-runner.ts. Installing here is equivalent to running
// scripts/install-launch-agent.sh — same plist, same launchctl dance.

function plistPath(): string {
  return backendLaunchAgentPlistPath(os.homedir());
}

function launchAgentLogDir(): string {
  return path.join(os.homedir(), 'Library', 'Logs', 'mila');
}

/** True when the backend LaunchAgent plist is present on disk. */
export function isBackendLaunchAgentInstalled(): boolean {
  try {
    return fs.existsSync(plistPath());
  } catch {
    return false;
  }
}

/**
 * Write the backend LaunchAgent plist and (re)load it so the stack comes up at
 * every login. No-op off macOS or when the autostart script can't be found
 * (e.g. a packaged app). Returns true if the agent was installed.
 */
export function installBackendLaunchAgent(
  log: (message: string) => void = () => undefined,
): boolean {
  if (process.platform !== 'darwin') return false;

  const script = resolveAutostartScript();
  if (!script) {
    log('[backend] autostart script not found; cannot install launch agent.');
    return false;
  }

  const target = plistPath();
  const logDir = launchAgentLogDir();
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(
      target,
      buildBackendLaunchAgentPlist({
        scriptPath: script,
        // Repo root is the parent of scripts/; used as the agent's cwd.
        workingDirectory: path.resolve(script, '..', '..'),
        logDir,
      }),
      'utf8',
    );
  } catch (err) {
    log(`[backend] failed to write launch agent plist: ${String(err)}`);
    return false;
  }

  reloadLaunchAgent(target, log);
  log(`[backend] installed launch agent at ${target}`);
  return true;
}

/**
 * Unload and delete the backend LaunchAgent. No-op off macOS. Returns true if
 * the plist is gone afterwards.
 */
export function uninstallBackendLaunchAgent(
  log: (message: string) => void = () => undefined,
): boolean {
  if (process.platform !== 'darwin') return false;

  runLaunchctl(['bootout', serviceTarget()], log); // best-effort unload

  const target = plistPath();
  try {
    if (fs.existsSync(target)) fs.rmSync(target);
  } catch (err) {
    log(`[backend] failed to remove launch agent plist: ${String(err)}`);
    return false;
  }
  log('[backend] removed launch agent');
  return true;
}

function uid(): number {
  return typeof process.getuid === 'function' ? process.getuid() : 0;
}

function serviceTarget(): string {
  return `gui/${uid()}/${BACKEND_LAUNCH_AGENT_LABEL}`;
}

function reloadLaunchAgent(target: string, log: (m: string) => void): void {
  const domain = `gui/${uid()}`;
  const service = serviceTarget();
  // Reload via the modern API, falling back to the legacy one — same order as
  // install-launch-agent.sh. Bootout first so a stale definition is replaced.
  runLaunchctl(['bootout', service], log);
  if (!runLaunchctl(['bootstrap', domain, target], log)) {
    runLaunchctl(['load', '-w', target], log);
  }
  // Start it once now so the backend comes up without waiting for a reboot.
  runLaunchctl(['kickstart', service], log);
}

function runLaunchctl(argv: string[], log: (m: string) => void): boolean {
  try {
    execFileSync('launchctl', argv, { stdio: 'ignore' });
    return true;
  } catch {
    // launchctl returns non-zero for benign cases (e.g. booting out a service
    // that isn't loaded); callers treat each step as best-effort.
    log(`[backend] launchctl ${argv.join(' ')} did not succeed`);
    return false;
  }
}
