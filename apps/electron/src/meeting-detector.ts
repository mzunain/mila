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
  | 'whatsapp'
  | 'facetime'
  | 'discord'
  | 'slack'
  | 'telegram'
  | 'signal'
  | 'skype'
  | 'unknown';

export interface DetectedMeeting {
  provider: DetectedProvider;
  title: string;
  detectedAppName?: string;
  meetingUrl?: string;
  detectedAt: string;
}

interface DetectorOptions {
  intervalMs?: number;
  onDetect: (meeting: DetectedMeeting) => void;
  onClear?: (meetingKey: string) => void;
  log?: (msg: string) => void;
}

const DEFAULT_INTERVAL_MS = 3000;

/**
 * Tiny helper around `spawn` that resolves with stdout as a string and
 * never rejects — a single bad invocation must not crash the detector
 * loop. Times out after `timeoutMs` and returns whatever buffered.
 */
function runCommand(
  command: string,
  args: string[],
  timeoutMs = 2500,
): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(command, args);
    let stdout = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(stdout);
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
 * Returns the full process list as a single string (one process path per
 * line). We invoke `ps -axo command` to surface every user-owned process
 * including menu-bar / background-only ones.
 */
function listProcesses(timeoutMs = 2500): Promise<string> {
  return runCommand('/bin/ps', ['-axo', 'command'], timeoutMs);
}

/**
 * Returns the current macOS power-assertion table. We parse this for
 * `coreaudiod` audio-in assertions which fire when any app is using the
 * microphone — the only reliable signal for Catalyst apps like WhatsApp
 * and FaceTime, which don't spawn distinct call-helper processes.
 */
function getPmsetAssertions(timeoutMs = 2500): Promise<string> {
  return runCommand('/usr/bin/pmset', ['-g', 'assertions'], timeoutMs);
}

/**
 * Resolves a PID to its short Comm name (the value in `ps -p <pid> -o
 * comm=`). On macOS this is the bundle's main executable name without
 * the path — e.g. "WhatsApp", "Google Chrome", "FaceTime". Returns empty
 * string if the PID is gone by the time we look it up.
 */
async function getProcessCommName(pid: number): Promise<string> {
  const out = await runCommand(
    '/bin/ps',
    ['-p', String(pid), '-o', 'comm='],
    1500,
  );
  // The Comm value can be a full path on macOS (e.g.
  // "/Applications/WhatsApp.app/Contents/MacOS/WhatsApp"). We want the
  // last path segment.
  const trimmed = out.trim();
  if (!trimmed) return '';
  const lastSlash = trimmed.lastIndexOf('/');
  return lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
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
 * Browser-based calls do not expose a clean "Google Meet is active" process.
 * Chrome does, however, spin up media utility helpers when a tab is actively
 * using camera/video capture. That is the same class of desktop signal Granola
 * surfaces as "Meeting detected — Chrome".
 */
function detectChromiumMediaUse(procList: string): DetectedMeeting | null {
  const hasChrome = /\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome/.test(
    procList,
  );
  const hasVideoCapture =
    /Google Chrome Helper.*--utility-sub-type=video_capture\.mojom\.VideoCaptureService/.test(
      procList,
    );

  if (!hasChrome || !hasVideoCapture) return null;

  return {
    provider: 'google-meet',
    title: 'Chrome call',
    detectedAppName: 'Chrome',
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
    detectZoom(procList) ??
    detectTeams(procList) ??
    detectWebex(procList) ??
    detectChromiumMediaUse(procList)
  );
}

/**
 * Some Catalyst/desktop apps expose app-owned power assertions while a call is
 * active. WhatsApp, for example, publishes `net.whatsapp.idletimer` while a
 * call screen is live. This catches the case where another recorder already
 * owns the macOS mic assertion, so `coreaudiod` does not point directly at
 * WhatsApp even though the user has joined a WhatsApp call.
 */
export function probePowerAssertions(
  pmsetOutput: string,
): DetectedMeeting | null {
  const hasWhatsAppCall =
    /\bpid \d+\(WhatsApp\):[\s\S]*?net\.whatsapp\.idletimer/.test(
      pmsetOutput,
    );
  if (hasWhatsAppCall) {
    return {
      provider: 'whatsapp',
      title: 'WhatsApp call',
      detectedAt: new Date().toISOString(),
    };
  }
  return null;
}

/**
 * Catalyst apps (WhatsApp, FaceTime) don't spawn distinct call helpers —
 * the call lives inside the main app process, so `ps`-based detection
 * misses them entirely. Fortunately macOS surfaces in-call apps a second
 * way: when an app holds the microphone, `coreaudiod` takes out a
 * `PreventUserIdleSystemSleep` power assertion on its behalf with
 * `Resources: audio-in ...` and a `Created for PID:` line pointing at
 * the actual app.
 *
 * We parse `pmset -g assertions` for those assertion blocks and look up
 * each PID's app name. Only apps in {@link CALL_APP_PROVIDER_MAP} fire a
 * detection — that allowlist exists to avoid firing on Voice Memos,
 * macOS Dictation, QuickTime audio capture, and (critically) Mila's own
 * mic use, which would loop forever.
 *
 * For an unknown call app we still fire `provider: 'unknown'` with the
 * app's display name in the title, so the user gets a session started
 * even if we haven't catalogued the app yet.
 */
const CALL_APP_PROVIDER_MAP: Record<string, DetectedProvider> = {
  zoom: 'zoom',
  'zoom.us': 'zoom',
  whatsapp: 'whatsapp',
  facetime: 'facetime',
  discord: 'discord',
  slack: 'slack',
  telegram: 'telegram',
  signal: 'signal',
  skype: 'skype',
  // Chromium-based meeting apps (Google Meet in browser) — Chrome holds
  // the mic when in a Meet call. Best-effort: we can't tell Meet from
  // any other Chrome mic use, but in practice it's almost always a
  // meeting.
  'google chrome': 'google-meet',
  chromium: 'google-meet',
};

/**
 * Apps we explicitly do NOT fire on, even if they hold the mic. Mila
 * itself is the critical one: if we auto-start when Mila opens the mic,
 * the very act of recording would re-trigger detection forever.
 */
const CALL_APP_DENYLIST = new Set([
  'mila',
  'mila helper',
  'mila helper (renderer)',
  'mila helper (gpu)',
  'mila helper (plugin)',
  'voicememos',
  'voice memos',
  'quicktime player',
  'photo booth',
  'screen recording',
  'logi tune',
  'audio midi setup',
]);

/**
 * Parse a single block of `pmset -g assertions` output looking for
 * coreaudiod entries that indicate an app is actively using the
 * microphone. Returns the list of PIDs that own a mic-in assertion.
 *
 * Example block we're matching:
 *
 *   pid 408(coreaudiod): [0x...] 01:58:16 PreventUserIdleSystemSleep
 *     named: "com.apple.audio.VPAUAggregateAudioDevice-0x...preventuseridlesleep"
 *     Created for PID: 64440.
 *     Resources: audio-in audio-out BuiltInMicrophoneDevice
 */
export function parseAudioAssertionPids(pmsetOutput: string): number[] {
  const pids: number[] = [];
  // Split into per-assertion blocks. Each assertion's continuation lines
  // are indented with whitespace; split on a line that starts with
  // non-whitespace to break blocks cleanly.
  const lines = pmsetOutput.split('\n');
  let current: string[] = [];
  const flush = () => {
    if (!current.length) return;
    const block = current.join('\n');
    // Only consider blocks owned by coreaudiod (filters out the app's
    // own PreventUserIdleDisplaySleep assertions, which aren't a call
    // signal).
    if (!/\bcoreaudiod\b/.test(block)) return;
    // Mic-in resource is the gating signal. "audio-out" alone happens
    // for normal playback (music, video) and isn't a call.
    if (!/\baudio-in\b/.test(block)) return;
    const pidMatch = /Created for PID:\s*(\d+)/.exec(block);
    if (pidMatch) pids.push(Number(pidMatch[1]));
  };
  for (const line of lines) {
    // A new top-level assertion starts with optional whitespace then `pid`.
    // We treat any line starting with non-space as a fresh block header,
    // but the assertion lines all start with 3-spaces of indent so the
    // simpler heuristic is: a line starting with "   pid " begins a block.
    if (/^\s{0,3}pid \d+\(/.test(line)) {
      flush();
      current = [line];
    } else {
      current.push(line);
    }
  }
  flush();
  // Dedup — same PID can hold multiple audio assertions.
  return Array.from(new Set(pids));
}

/**
 * Map an executable / Comm name (as returned by `ps -p <pid> -o comm=`)
 * to a {@link DetectedMeeting} via the allowlist. Returns null if the
 * app isn't a known call app or is in the denylist.
 */
export function classifyCallApp(commName: string): DetectedMeeting | null {
  const normalized = commName.trim().toLowerCase();
  if (!normalized) return null;
  if (CALL_APP_DENYLIST.has(normalized)) return null;

  // Try exact match first, then substring (handles "WhatsApp Helper").
  const provider =
    CALL_APP_PROVIDER_MAP[normalized] ??
    Object.entries(CALL_APP_PROVIDER_MAP).find(([key]) =>
      normalized.includes(key),
    )?.[1];

  if (provider) {
    return {
      provider,
      title: titleForProvider(provider, commName),
      ...(provider === 'google-meet' ? { detectedAppName: 'Chrome' } : {}),
      detectedAt: new Date().toISOString(),
    };
  }
  return null;
}

function titleForProvider(provider: DetectedProvider, commName: string): string {
  switch (provider) {
    case 'zoom':
      return 'Zoom meeting';
    case 'whatsapp':
      return 'WhatsApp call';
    case 'facetime':
      return 'FaceTime call';
    case 'discord':
      return 'Discord call';
    case 'slack':
      return 'Slack huddle';
    case 'telegram':
      return 'Telegram call';
    case 'signal':
      return 'Signal call';
    case 'skype':
      return 'Skype call';
    case 'google-meet':
      return 'Google Meet';
    default:
      return `${commName} call`;
  }
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
      // Fetch both signals in parallel — `ps` and `pmset` are independent.
      const [procList, pmsetOutput] = await Promise.all([
        listProcesses(),
        getPmsetAssertions(),
      ]);
      let detection = procList ? probeProcessList(procList) : null;
      // Process-name detection is preferred (we know exactly which
      // provider it is and there's zero chance of false positives), but
      // it can't see Catalyst apps. Fall through to audio-assertion
      // detection only if the process list didn't yield a match.
      if (!detection && pmsetOutput) {
        detection = probePowerAssertions(pmsetOutput);
      }
      if (!detection && pmsetOutput) {
        const pids = parseAudioAssertionPids(pmsetOutput);
        for (const pid of pids) {
          const commName = await getProcessCommName(pid);
          const candidate = classifyCallApp(commName);
          if (candidate) {
            detection = candidate;
            break;
          }
        }
      }
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
        options.onClear?.(lastKey);
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
