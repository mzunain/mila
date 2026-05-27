import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { detectDirection, detectLanguage } from '@mila/shared';
import type { SupportedLanguageCode, TranscriptSegment } from '@mila/shared';
import type { AsrProvider, TranscribeChunkInput } from './asr-provider';

interface HttpAsrResponse {
  text: string;
  normalizedText?: string;
  translatedText?: string;
  detectedLanguage?: string;
  confidence?: number;
  startMs?: number;
  endMs?: number;
  speakerId?: string;
}

/**
 * Thrown when the ASR worker takes longer than `ASR_TIMEOUT_MS` to return.
 * The gateway distinguishes this from a hard error so the WS session keeps
 * running — the user can keep talking and the next chunk will be tried.
 */
export class AsrTimeoutError extends Error {
  constructor(
    readonly chunkId: string,
    readonly timeoutMs: number,
  ) {
    super(
      `ASR worker did not respond within ${timeoutMs}ms (chunk ${chunkId})`,
    );
    this.name = 'AsrTimeoutError';
  }
}

/**
 * Default per-chunk transcription budget. faster-whisper "base" on CPU
 * processes a 5-second chunk in a couple of seconds on a typical laptop;
 * `small` can take 5–15s; `medium`+ is too slow for live audio. 30s gives
 * headroom for the smaller models without letting a stuck worker hold the
 * gateway hostage for undici's 5-minute default.
 */
const DEFAULT_ASR_TIMEOUT_MS = 30_000;

@Injectable()
export class HttpAsrProvider implements AsrProvider {
  private readonly logger = new Logger(HttpAsrProvider.name);
  private readonly baseUrl =
    process.env.ASR_BASE_URL ?? 'http://localhost:9000';
  private readonly timeoutMs = parseTimeout(
    process.env.ASR_TIMEOUT_MS,
    DEFAULT_ASR_TIMEOUT_MS,
  );

  async transcribe(
    input: TranscribeChunkInput,
  ): Promise<TranscriptSegment | null> {
    if (!input.audioBase64) {
      return null;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/transcribe`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: input.sessionId,
          chunkId: input.chunkId,
          mimeType: input.mimeType,
          audioBase64: input.audioBase64,
          outputLanguage: input.outputLanguage,
          segmentIndex: input.segmentIndex,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new AsrTimeoutError(input.chunkId, this.timeoutMs);
      }
      throw error;
    }

    if (!response.ok) {
      const body = await response.text();
      this.logger.warn(
        `ASR worker rejected ${input.chunkId}: ${response.status} ${body}`,
      );
      return null;
    }

    const result = (await response.json()) as HttpAsrResponse;
    const originalText = result.text?.trim();

    if (!originalText) {
      return null;
    }

    const normalizedText = result.normalizedText?.trim() || originalText;
    const translatedText = result.translatedText?.trim() || normalizedText;
    const detectedLanguage =
      parseSupportedLanguage(result.detectedLanguage) ??
      detectLanguage(originalText);
    const startMs = result.startMs ?? input.segmentIndex * 4200;

    return {
      id: randomUUID(),
      sessionId: input.sessionId,
      speakerId: result.speakerId ?? `speaker-${(input.segmentIndex % 2) + 1}`,
      originalText,
      normalizedText,
      translatedText,
      detectedLanguage,
      direction: detectDirection(originalText),
      confidence: result.confidence ?? 0.8,
      startMs,
      endMs: result.endMs ?? startMs + 3800,
      isFinal: true,
    };
  }
}

function parseTimeout(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  return name === 'TimeoutError' || name === 'AbortError';
}

function parseSupportedLanguage(
  value: string | undefined,
): SupportedLanguageCode | null {
  if (
    value === 'en' ||
    value === 'ur' ||
    value === 'hi' ||
    value === 'fi' ||
    value === 'mixed' ||
    value === 'unknown'
  ) {
    return value;
  }

  return null;
}
