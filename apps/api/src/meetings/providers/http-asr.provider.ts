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

@Injectable()
export class HttpAsrProvider implements AsrProvider {
  private readonly logger = new Logger(HttpAsrProvider.name);
  private readonly baseUrl =
    process.env.ASR_BASE_URL ?? 'http://localhost:9000';

  async transcribe(
    input: TranscribeChunkInput,
  ): Promise<TranscriptSegment | null> {
    if (!input.audioBase64) {
      return null;
    }

    const response = await fetch(`${this.baseUrl}/v1/transcribe`, {
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
    });

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
