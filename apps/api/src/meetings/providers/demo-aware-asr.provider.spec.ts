import type { AsrProvider, TranscribeChunkInput } from './asr-provider';
import { DemoAwareAsrProvider } from './demo-aware-asr.provider';
import type { TranscriptSegment } from '@mila/shared';

const baseInput: TranscribeChunkInput = {
  sessionId: 'session-1',
  chunkId: 'chunk-1',
  mimeType: 'audio/wav',
  outputLanguage: 'en',
  segmentIndex: 0,
};

type TestAsrProvider = AsrProvider & {
  transcribe: jest.MockedFunction<AsrProvider['transcribe']>;
};

function provider(name: string): TestAsrProvider {
  const segment: TranscriptSegment = {
    id: `${name}-segment`,
    sessionId: baseInput.sessionId,
    speakerId: name,
    originalText: name,
    normalizedText: name,
    translatedText: name,
    detectedLanguage: 'en',
    direction: 'ltr',
    confidence: 1,
    startMs: 0,
    endMs: 1000,
    isFinal: true,
  };
  const transcribe: jest.MockedFunction<AsrProvider['transcribe']> = jest.fn(
    (input: TranscribeChunkInput) => {
      void input;
      return Promise.resolve(segment);
    },
  );

  return {
    transcribe,
  };
}

describe('DemoAwareAsrProvider', () => {
  it('routes demo chunks to the mock provider even when HTTP ASR is preferred', async () => {
    const mockProvider = provider('mock');
    const httpProvider = provider('http');
    const asr = new DemoAwareAsrProvider(mockProvider, httpProvider, true);

    const segment = await asr.transcribe({
      ...baseInput,
      mimeType: 'audio/mock',
    });

    expect(segment?.speakerId).toBe('mock');
    expect(mockProvider.transcribe.mock.calls).toHaveLength(1);
    expect(httpProvider.transcribe.mock.calls).toHaveLength(0);
  });

  it('routes real audio to HTTP when HTTP ASR is preferred', async () => {
    const mockProvider = provider('mock');
    const httpProvider = provider('http');
    const asr = new DemoAwareAsrProvider(mockProvider, httpProvider, true);

    const segment = await asr.transcribe(baseInput);

    expect(segment?.speakerId).toBe('http');
    expect(httpProvider.transcribe.mock.calls).toHaveLength(1);
    expect(mockProvider.transcribe.mock.calls).toHaveLength(0);
  });

  it('keeps non-HTTP environments on the mock provider', async () => {
    const mockProvider = provider('mock');
    const httpProvider = provider('http');
    const asr = new DemoAwareAsrProvider(mockProvider, httpProvider, false);

    const segment = await asr.transcribe(baseInput);

    expect(segment?.speakerId).toBe('mock');
    expect(mockProvider.transcribe.mock.calls).toHaveLength(1);
    expect(httpProvider.transcribe.mock.calls).toHaveLength(0);
  });
});
