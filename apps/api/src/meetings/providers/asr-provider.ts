import { SupportedLanguageCode, TranscriptSegment } from '@mila/shared';

export interface TranscribeChunkInput {
  sessionId: string;
  chunkId: string;
  mimeType: string;
  audioBase64?: string;
  vocabulary?: string[];
  outputLanguage: SupportedLanguageCode;
  segmentIndex: number;
  /**
   * Source hint from the client capture pipeline ("self" = the user's mic,
   * "remote" = the system-audio loopback). Carried straight onto the segment
   * so the transcript labels who spoke by true source instead of guessing.
   */
  speakerId?: string;
}

export interface AsrProvider {
  transcribe(input: TranscribeChunkInput): Promise<TranscriptSegment | null>;
}
