import { spawn } from 'node:child_process';

/**
 * Watches macOS for the presence of helper processes that conferencing apps
 * only spawn while an active call is in progress, and emits a single signal
 * each time a fresh meeting is detected.
 *
 * Why process detection and not window-title detection? Reading window titles
 * via System Events / AppleScript requires macOS Accessibility permission,
 * which is a friction-heavy prompt the user has to grant in System Settings.
 * Process listing is unprivileged: `ps -ax` works for any process owned by
 * the current user.
 *
 * The trade-off: we can only see apps that fingerprint themselves through a
 * dedicated helper process (Zoom does, with CptHost/caphost/aomhost; Teams
 * and Webex are harder and ship in a follow-up that opts into Accessibility).
 *
 * v1 is macOS-only. Other platforms no-op; the auto-start channel itself
 * still works on every platform (deep links, URL params).
 */

export type DetectedProvider =
  | 'zoom'
  | 'microsoft-teams'
  | 'google-meet'
  | 'webex'
  | 'unknown';

export interface DetectedMeeting {
  provider: DetectedProvider;
  title: string;
  meetingUrl?: string;
  detectedAt: string;
}

interface DetectorOptions {
  intervalMs?: number;
  onDetect: (meeting: DetectedMeeting) => void;
  log?: (msg: string) => void;
}

const DEFAULT_INTERVAL_MS = 3000;

/**
 * Returns the full process list as a single string (one process path per
 * line). We invoke `ps -axo command` with `-c` to also surface menu-bar /
 * background-only processes. Anything we can't parse becomes empty string so
 * a single bad poll doesn't crash the detector.
 */
function listProcesses(timeoutMs = 2500): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('ps', ['-axo', 'command']);
    let stdout = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve('');
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.on('error', () => {
      clearTimeout(timeout);
      resolve('');
    });
    child.on('close', () => {
      clearTimeout(timeout);
      resolve(stdout);
    });
  });
}

/**
 * Zoom only launches `CptHost` (screen-capture host), `caphost` and
 * `aomhost` (audio output module host) when you're in an active meeting.
 * They're absent when zoom.us is signed-in-only or fully closed. The main
 * zoom.us process runs in both states, so we don't gate on it — its
 * presence isn't a meeting signal on its own.
 */
function detectZoom(procList: string): DetectedMeeting | null {
  const inCall =
    /\/zoom\.us\.app\/Contents\/Frameworks\/CptHost\.app\//.test(procList) ||
    /\/zoom\.us\.app\/Contents\/Frameworks\/caphost\.app\//.test(procList) ||
    /\/zoom\.us\.app\/Contents\/Frameworks\/aomhost\.app\//.test(procList);
  if (!inCall) return null;
  return {
    provider: 'zoom',
    title: 'Zoom meeting',
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Microsoft Teams call detection: when you're in a Teams call, Teams loads
 * `MSTeamsAudioDevice.driver` AND spawns the renderer process for the call
 * window. The audio driver is the more reliable signal — it's only loaded
 * (visible in `ps -ax` as a kernel-side audio driver) during an active call.
 *
 * Caveat: some Teams installs keep the audio driver loaded permanently, so
 * this can fire false-positives. We pair it with a known call-window helper
 * to reduce that. If you see auto-start firing for no reason, this is the
 * first place to look.
 */
function detectTeams(procList: string): DetectedMeeting | null {
  const hasAudioDriver = /MSTeamsAudioDevice\.driver/.test(procList);
  const teamsRunning = /\/Microsoft Teams\.app\/Contents\/MacOS\/MSTeams/.test(
    procList,
  );
  if (!hasAudioDriver || !teamsRunning) return null;
  return {
    provider: 'microsoft-teams',
    title: 'Microsoft Teams meeting',
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Webex spawns a dedicated call-window helper during a meeting.
 * Best-effort: matches the most common process names across Webex versions.
 */
function detectWebex(procList: string): DetectedMeeting | null {
  const inCall =
    /\/Webex\.app\/Contents\/Frameworks\/CallHelper/.test(procList) ||
    /\/Webex Meetings\.app\/Contents\/Frameworks\/.*Meeting/.test(procList);
  if (!inCall) return null;
  return {
    provider: 'webex',
    title: 'Webex meeting',
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Pure function that runs every provider matcher against a captured process
 * list. Exported for unit testing — the detector calls this internally with
 * the output of `ps -axo command`.
 */
export function probeProcessList(procList: string): DetectedMeeting | null {
  // Cheap to call all four — they're plain regex tests against the same
  // captured string. First match wins (Zoom first since it's most common
  // and most reliable).
  return (
    detectZoom(procList) ?? detectTeams(procList) ?? detectWebex(procList)
  );
}

/**
 * Stable identity for a detected meeting. We use this to deduplicate — the
 * detector polls every few seconds and we only want to fire onDetect when
 * the meeting *changes*, not on every tick the same meeting is still live.
 */
function meetingKey(m: DetectedMeeting | null): string | null {
  if (!m) return null;
  return `${m.provider}:${m.meetingUrl ?? m.title}`;
}

/**
 * Starts polling. Returns a stop function. On non-macOS this is a no-op.
 */
export function startMeetingDetector(options: DetectorOptions): () => void {
  if (process.platform !== 'darwin') {
    options.log?.('[meeting-detector] skipped: non-macOS platform');
    return () => {};
  }

  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  let lastKey: string | null = null;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const procList = await listProcesses();
      if (!procList) return;
      const detection = probeProcessList(procList);
      const key = meetingKey(detection);
      if (key) {
        // Always emit on every tick where a meeting is detected. The first
        // tick fires before the renderer's preload has attached its IPC
        // listener, so if we dedupe at the source the renderer can miss the
        // signal and never auto-start. Cheap to re-send a small JSON payload
        // every 3s — the renderer dedupes by meetingKey when deciding
        // whether to create a session.
        if (key !== lastKey) {
          options.log?.(`[meeting-detector] detected ${key}`);
          lastKey = key;
        }
        options.onDetect(detection!);
      } else if (!key && lastKey) {
        // The meeting ended — reset so re-joining the same provider re-fires.
        options.log?.(`[meeting-detector] cleared ${lastKey}`);
        lastKey = null;
      }
    } catch (err) {
      options.log?.(
        `[meeting-detector] probe failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  // Kick off immediately so we don't make the user wait one full interval
  // after launching the app (they may already be in a call when Mila opens).
  void tick();
  const handle = setInterval(() => {
    void tick();
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
