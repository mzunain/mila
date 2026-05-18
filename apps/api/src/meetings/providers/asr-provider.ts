import { SupportedLanguageCode, TranscriptSegment } from '@mila/shared';

export interface TranscribeChunkInput {
  sessionId: string;
  chunkId: string;
  mimeType: string;
  audioBase64?: string;
  outputLanguage: SupportedLanguageCode;
  segmentIndex: number;
}

export interface AsrProvider {
  transcribe(input: TranscribeChunkInput): Promise<TranscriptSegment | null>;
}
