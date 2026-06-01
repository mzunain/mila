/**
 * Single source of truth for which ASR provider the API is running.
 *
 * Real transcription only happens when `ASR_PROVIDER=http` (the faster-whisper
 * worker). Any other value — including unset — means the demo/mock provider,
 * which fabricates plausible transcripts so the product is explorable without a
 * worker. Keeping this in one place stops the capability report, the boot-time
 * warning, and the provider wiring from drifting apart: previously
 * `supportsRealAudio` used `!== 'mock'` while the provider only switched on
 * `=== 'http'`, so an unknown value would advertise real audio while silently
 * serving mock.
 */
export const REAL_ASR_PROVIDER = 'http';

export interface AsrMode {
  /** The configured provider name (defaults to `mock` when unset). */
  provider: string;
  /** True only when real audio transcription is actually wired up. */
  isReal: boolean;
  /** Operator-facing guidance shown when running in demo mode; null when real. */
  hint: string | null;
}

export function resolveAsrMode(env: NodeJS.ProcessEnv = process.env): AsrMode {
  const provider = env.ASR_PROVIDER?.trim() || 'mock';
  const isReal = provider === REAL_ASR_PROVIDER;

  return {
    provider,
    isReal,
    hint: isReal
      ? null
      : `ASR is in "${provider}" demo mode — transcripts are simulated, not real audio. ` +
        `Set ASR_PROVIDER=http with a running ASR worker (e.g. ./run.sh) to transcribe real audio.`,
  };
}
