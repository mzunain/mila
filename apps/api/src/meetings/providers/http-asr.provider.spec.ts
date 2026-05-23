import { HttpAsrProvider } from './http-asr.provider';

describe('HttpAsrProvider', () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.ASR_BASE_URL;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ASR_BASE_URL = originalBaseUrl;
    jest.restoreAllMocks();
  });

  it('transcribes base64 audio through the ASR worker', async () => {
    process.env.ASR_BASE_URL = 'http://asr.test';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          text: 'Hello from a real audio file.',
          normalizedText: 'Hello from a real audio file.',
          translatedText: 'Hello from a real audio file.',
          detectedLanguage: 'en',
          confidence: 0.92,
          startMs: 0,
          endMs: 1800,
        }),
    });
    global.fetch = fetchMock;

    const provider = new HttpAsrProvider();
    const segment = await provider.transcribe({
      sessionId: 'session-1',
      chunkId: 'chunk-1',
      mimeType: 'audio/ogg',
      audioBase64: 'ZmFrZQ==',
      outputLanguage: 'en',
      segmentIndex: 0,
    });

    expect(segment?.originalText).toBe('Hello from a real audio file.');
    expect(segment?.detectedLanguage).toBe('en');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://asr.test/v1/transcribe',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('does not call ASR worker without audio payload', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const provider = new HttpAsrProvider();
    const segment = await provider.transcribe({
      sessionId: 'session-1',
      chunkId: 'chunk-1',
      mimeType: 'audio/ogg',
      outputLanguage: 'en',
      segmentIndex: 0,
    });

    expect(segment).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
