// Pure builders for the macOS LaunchAgent that brings the MILA backend stack up
// at login. No electron imports here so the logic stays unit-testable under
// `node --test`. This mirrors scripts/install-launch-agent.sh exactly so the
// in-app toggle and the shell installer produce an identical plist.

import path from 'node:path';

export const BACKEND_LAUNCH_AGENT_LABEL = 'com.mila.backend';

// Re-ensure the stack every 30 min so a crashed runtime self-heals. The script
// is idempotent and a no-op when the stack is already up, so this is cheap.
export const DEFAULT_BACKEND_START_INTERVAL_SECONDS = 1800;

// Login shells aren't sourced for LaunchAgents, so spell out where colima/docker
// live (Apple Silicon + Intel Homebrew) plus the system defaults.
const DEFAULT_LAUNCH_AGENT_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';

export type BackendLaunchAgentOptions = {
  /** Absolute path to scripts/mila-autostart.sh. */
  scriptPath: string;
  /** Repo root, used as the agent's working directory. */
  workingDirectory: string;
  /** Directory for the agent's stdout/stderr logs. */
  logDir: string;
  /** Self-heal interval; defaults to 30 min. */
  startIntervalSeconds?: number;
  label?: string;
  pathEnv?: string;
};

/** Escape a value for safe inclusion in plist (XML) text. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** `~/Library/LaunchAgents/<label>.plist` for the given home directory. */
export function backendLaunchAgentPlistPath(
  home: string,
  label: string = BACKEND_LAUNCH_AGENT_LABEL,
): string {
  return path.join(home, 'Library', 'LaunchAgents', `${label}.plist`);
}

/** Build the launchd plist document that runs the autostart script at login. */
export function buildBackendLaunchAgentPlist(
  opts: BackendLaunchAgentOptions,
): string {
  const label = opts.label ?? BACKEND_LAUNCH_AGENT_LABEL;
  const interval = Math.max(
    0,
    Math.floor(opts.startIntervalSeconds ?? DEFAULT_BACKEND_START_INTERVAL_SECONDS),
  );
  const pathEnv = opts.pathEnv ?? DEFAULT_LAUNCH_AGENT_PATH;
  const outLog = path.join(opts.logDir, 'autostart.out.log');
  const errLog = path.join(opts.logDir, 'autostart.err.log');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${escapeXml(opts.scriptPath)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>${interval}</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>WorkingDirectory</key>
  <string>${escapeXml(opts.workingDirectory)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${escapeXml(pathEnv)}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${escapeXml(outLog)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(errLog)}</string>
</dict>
</plist>
`;
}
