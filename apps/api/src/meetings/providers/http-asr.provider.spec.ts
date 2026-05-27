import { AsrTimeoutError, HttpAsrProvider } from './http-asr.provider';

describe('HttpAsrProvider', () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.ASR_BASE_URL;
  const originalTimeout = process.env.ASR_TIMEOUT_MS;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ASR_BASE_URL = originalBaseUrl;
    process.env.ASR_TIMEOUT_MS = originalTimeout;
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

  it('throws AsrTimeoutError when fetch aborts with TimeoutError', async () => {
    process.env.ASR_BASE_URL = 'http://asr.test';
    process.env.ASR_TIMEOUT_MS = '50';
    const fetchMock = jest.fn().mockImplementation(() => {
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      return Promise.reject(error);
    });
    global.fetch = fetchMock;

    const provider = new HttpAsrProvider();

    await expect(
      provider.transcribe({
        sessionId: 'session-1',
        chunkId: 'chunk-timeout',
        mimeType: 'audio/ogg',
        audioBase64: 'ZmFrZQ==',
        outputLanguage: 'en',
        segmentIndex: 0,
      }),
    ).rejects.toMatchObject({
      name: 'AsrTimeoutError',
      chunkId: 'chunk-timeout',
      timeoutMs: 50,
    });
  });

  it('throws AsrTimeoutError when fetch aborts with AbortError', async () => {
    process.env.ASR_BASE_URL = 'http://asr.test';
    const fetchMock = jest.fn().mockImplementation(() => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });
    global.fetch = fetchMock;

    const provider = new HttpAsrProvider();
    let caught: unknown;
    try {
      await provider.transcribe({
        sessionId: 'session-1',
        chunkId: 'chunk-abort',
        mimeType: 'audio/ogg',
        audioBase64: 'ZmFrZQ==',
        outputLanguage: 'en',
        segmentIndex: 0,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AsrTimeoutError);
    expect((caught as AsrTimeoutError).chunkId).toBe('chunk-abort');
  });

  it('falls back to the default 30s timeout when ASR_TIMEOUT_MS is unset', async () => {
    process.env.ASR_BASE_URL = 'http://asr.test';
    delete process.env.ASR_TIMEOUT_MS;
    const fetchMock = jest.fn().mockImplementation(() => {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      return Promise.reject(error);
    });
    global.fetch = fetchMock;

    const provider = new HttpAsrProvider();

    await expect(
      provider.transcribe({
        sessionId: 'session-1',
        chunkId: 'chunk-default-timeout',
        mimeType: 'audio/ogg',
        audioBase64: 'ZmFrZQ==',
        outputLanguage: 'en',
        segmentIndex: 0,
      }),
    ).rejects.toMatchObject({
      name: 'AsrTimeoutError',
      timeoutMs: 30_000,
    });
  });

  it('ignores a malformed ASR_TIMEOUT_MS and uses the default', async () => {
    process.env.ASR_BASE_URL = 'http://asr.test';
    process.env.ASR_TIMEOUT_MS = 'not-a-number';
    const fetchMock = jest.fn().mockImplementation(() => {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      return Promise.reject(error);
    });
    global.fetch = fetchMock;

    const provider = new HttpAsrProvider();

    await expect(
      provider.transcribe({
        sessionId: 'session-1',
        chunkId: 'chunk-bad-env',
        mimeType: 'audio/ogg',
        audioBase64: 'ZmFrZQ==',
        outputLanguage: 'en',
        segmentIndex: 0,
      }),
    ).rejects.toMatchObject({
      name: 'AsrTimeoutError',
      timeoutMs: 30_000,
    });
  });

  it('propagates non-timeout fetch errors unchanged', async () => {
    process.env.ASR_BASE_URL = 'http://asr.test';
    const fetchMock = jest
      .fn()
      .mockRejectedValue(new Error('connection refused'));
    global.fetch = fetchMock;

    const provider = new HttpAsrProvider();

    await expect(
      provider.transcribe({
        sessionId: 'session-1',
        chunkId: 'chunk-conn',
        mimeType: 'audio/ogg',
        audioBase64: 'ZmFrZQ==',
        outputLanguage: 'en',
        segmentIndex: 0,
      }),
    ).rejects.toThrow('connection refused');
  });
});
