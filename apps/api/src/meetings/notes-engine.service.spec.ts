import { NotesEngineService } from './notes-engine.service';
import type { TranscriptSegment } from '@mila/shared';

const baseSegment: TranscriptSegment = {
  id: 'segment-1',
  sessionId: 'session-1',
  speakerId: 'Ravi',
  originalText: 'Kal meeting hai at 5 PM, do not forget.',
  normalizedText: 'The meeting is tomorrow at 5 PM. Do not forget.',
  translatedText: 'The meeting is tomorrow at 5 PM. Do not forget.',
  detectedLanguage: 'mixed',
  direction: 'ltr',
  confidence: 0.95,
  startMs: 0,
  endMs: 4000,
  isFinal: true,
};

describe('NotesEngineService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.NVIDIA_NIM_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.MOONSHOT_API_KEY;
    delete process.env.ZAI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.LLM_FALLBACK_MODELS;
    delete process.env.LLM_LIVE_NOTES_ENABLED;
    delete process.env.LLM_IMPORT_FREE_CLAUDE_ENV;
    delete process.env.FREE_CLAUDE_ENV_PATH;
    global.fetch = originalFetch;
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('uses heuristic notes when no LLM route is configured', async () => {
    const service = new NotesEngineService();
    const notes = await service.generateFinalNotes([baseSegment], 'en');

    expect(notes.summary).toContain('Final summary');
    expect(notes.actionItems[0]?.text).toContain('Do not forget');
  });

  it('uses an OpenRouter-compatible model response for final notes', async () => {
    process.env.LLM_PROVIDER = 'openrouter';
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'qwen/qwen3-coder:free';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'The team has a meeting tomorrow at 5 PM.',
                  keyPoints: ['Meeting is tomorrow at 5 PM'],
                  actionItems: [
                    {
                      text: 'Remember the 5 PM meeting',
                      owner: 'Ravi',
                    },
                  ],
                  decisions: [],
                }),
              },
            },
          ],
        }),
    });

    const service = new NotesEngineService();
    const notes = await service.generateFinalNotes([baseSegment], 'en');

    expect(notes.summary).toBe('The team has a meeting tomorrow at 5 PM.');
    expect(notes.actionItems[0]).toMatchObject({
      text: 'Remember the 5 PM meeting',
      owner: 'Ravi',
      status: 'open',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('falls back across configured LLM routes before using the response', async () => {
    process.env.LLM_PROVIDER = 'nvidia_nim';
    process.env.NVIDIA_NIM_API_KEY = 'test-nvidia-key';
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.LLM_MODEL = 'z-ai/glm4.7';
    process.env.LLM_FALLBACK_MODELS = 'openrouter/minimax/minimax-m2.5:free';
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('temporarily unavailable'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: 'Fallback model generated the final summary.',
                    keyPoints: ['Fallback succeeded'],
                    actionItems: [],
                    decisions: [],
                  }),
                },
              },
            ],
          }),
      });

    const service = new NotesEngineService();
    const notes = await service.generateFinalNotes([baseSegment], 'en');

    expect(notes.summary).toBe('Fallback model generated the final summary.');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('routes a google/ spec to the Gemini OpenAI-compatible endpoint', async () => {
    process.env.LLM_PROVIDER = 'google';
    process.env.GOOGLE_API_KEY = 'test-google-key';
    process.env.LLM_MODEL = 'google/gemini-2.5-flash';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'Gemini summarized the meeting.',
                  keyPoints: ['Meeting tomorrow at 5 PM'],
                  actionItems: [],
                  decisions: [],
                }),
              },
            },
          ],
        }),
    });

    const service = new NotesEngineService();
    const notes = await service.generateFinalNotes([baseSegment], 'en');

    expect(notes.summary).toBe('Gemini summarized the meeting.');
    const fetchMock = global.fetch as jest.Mock;
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstCall[0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    const requestInit = firstCall[1];
    expect((requestInit.headers as Record<string, string>).authorization).toBe(
      'Bearer test-google-key',
    );
    const requestBody = JSON.parse(requestInit.body as string) as {
      model: string;
    };
    expect(requestBody.model).toBe('gemini-2.5-flash');
  });

  it('falls back from Google to DeepSeek to xAI as keys/models cascade', async () => {
    process.env.LLM_PROVIDER = 'google';
    process.env.GOOGLE_API_KEY = 'test-google-key';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.XAI_API_KEY = 'test-xai-key';
    process.env.LLM_MODEL = 'google/gemini-2.5-flash';
    process.env.LLM_FALLBACK_MODELS =
      'deepseek/deepseek-chat,xai/grok-4-fast-non-reasoning';
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('quota exhausted'),
      })
      .mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('temporary failure'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: 'Grok caught the fallback.',
                    keyPoints: [],
                    actionItems: [],
                    decisions: [],
                  }),
                },
              },
            ],
          }),
      });

    const service = new NotesEngineService();
    const notes = await service.generateFinalNotes([baseSegment], 'en');

    expect(notes.summary).toBe('Grok caught the fallback.');
    const calls = (global.fetch as jest.Mock).mock.calls as Array<
      [string, RequestInit]
    >;
    expect(calls).toHaveLength(3);
    expect(calls[1][0]).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(calls[2][0]).toBe('https://api.x.ai/v1/chat/completions');
  });

  it('returns heuristic notes when all LLM routes fail', async () => {
    process.env.LLM_PROVIDER = 'openrouter';
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'qwen/qwen3-coder:free';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('rate limited'),
    });

    const service = new NotesEngineService();
    const notes = await service.generateFinalNotes([baseSegment], 'en');

    expect(notes.summary).toContain('Final summary');
    expect(notes.keyPoints).toContain(
      'The meeting is tomorrow at 5 PM. Do not forget.',
    );
  });
});
