// Pure decisions for system-audio loopback capture.
//
// On a remote call the other party arrives through the speakers, not the mic —
// especially with headphones, where the mic never hears them at all. Electron's
// `setDisplayMediaRequestHandler` can answer a renderer `getDisplayMedia` call
// with `{ audio: 'loopback' }`, routing system audio in via ScreenCaptureKit.
// That path is macOS-only (ScreenCaptureKit) and needs a recent Electron.
//
// The capability gate and the handler response are pure so they can be
// unit-tested; the actual session wiring lives in `loopback.ts`.

export interface LoopbackEnv {
  platform: NodeJS.Platform;
  /** `process.versions.electron`, e.g. "33.2.0". */
  electronVersion?: string;
}

// System-audio loopback via setDisplayMediaRequestHandler stabilized well
// before the version we ship on (Electron 33); gate conservatively so older
// shells fall back to mic-only rather than throwing.
const MIN_ELECTRON_MAJOR = 31;

/** Parse the leading major version from an Electron version string. */
export function loopbackMajorVersion(version?: string): number {
  if (typeof version !== "string") return 0;
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : 0;
}

/** Whether system-audio loopback can be offered in this environment. */
export function loopbackCaptureSupported(env: LoopbackEnv): boolean {
  return (
    env.platform === "darwin" &&
    loopbackMajorVersion(env.electronVersion) >= MIN_ELECTRON_MAJOR
  );
}

export interface DisplayMediaDecision {
  audio?: "loopback";
}

/** Response for a renderer display-media request: hand back system-audio
 *  loopback only when it's both supported and actually asked for, otherwise an
 *  empty decision (the handler then cancels the request, mic-only continues). */
export function decideDisplayMediaResponse(input: {
  supported: boolean;
  audioRequested: boolean;
}): DisplayMediaDecision {
  if (input.supported && input.audioRequested) {
    return { audio: "loopback" };
  }
  return {};
}
