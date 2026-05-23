import { Injectable } from '@nestjs/common';
import { detectDirection, detectLanguage } from '@mila/shared';
import type { SupportedLanguageCode, TranscriptSegment } from '@mila/shared';
import type { AsrProvider, TranscribeChunkInput } from './asr-provider';

const mockConversation = [
  {
    originalText: "Kal meeting hai at 5 PM, don't forget.",
    normalizedText: 'The meeting is tomorrow at 5 PM. Do not forget.',
  },
  {
    originalText: 'ہمیں customer onboarding flow بہتر کرنا ہے.',
    normalizedText: 'We need to improve the customer onboarding flow.',
  },
  {
    originalText: 'कल Ravi action list भेजेगा और Sara design review करेगी.',
    normalizedText:
      'Ravi will send the action list tomorrow and Sara will do the design review.',
  },
  {
    originalText: 'Huomenna tiimi tekee päätös hinnoittelusta.',
    normalizedText: 'Tomorrow the team will make a decision about pricing.',
  },
  {
    originalText:
      'We will go with the lightweight desktop app first, then mobile.',
    normalizedText:
      'We decided to build the lightweight desktop app first, then mobile.',
  },
];

@Injectable()
export class MockAsrProvider implements AsrProvider {
  transcribe(input: TranscribeChunkInput): Promise<TranscriptSegment | null> {
    if (input.mimeType !== 'audio/mock') {
      return Promise.resolve(null);
    }

    const sample =
      mockConversation[input.segmentIndex % mockConversation.length];
    const detectedLanguage = detectLanguage(sample.originalText);
    const translatedText = this.translate(
      sample.normalizedText,
      input.outputLanguage,
    );
    const startMs = input.segmentIndex * 4200;

    return Promise.resolve({
      id: input.chunkId,
      sessionId: input.sessionId,
      speakerId: `speaker-${(input.segmentIndex % 2) + 1}`,
      originalText: sample.originalText,
      normalizedText: sample.normalizedText,
      translatedText,
      detectedLanguage,
      direction: detectDirection(sample.originalText),
      confidence: 0.91,
      startMs,
      endMs: startMs + 3800,
      isFinal: true,
    });
  }

  private translate(text: string, outputLanguage: SupportedLanguageCode) {
    if (
      outputLanguage === 'en' ||
      outputLanguage === 'mixed' ||
      outputLanguage === 'unknown'
    ) {
      return text;
    }

    return `[${outputLanguage}] ${text}`;
  }
}
