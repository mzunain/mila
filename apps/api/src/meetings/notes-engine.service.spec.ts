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
      json: async () => ({
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
    } as Response);

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
        text: async () => 'temporarily unavailable',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
      } as Response);

    const service = new NotesEngineService();
    const notes = await service.generateFinalNotes([baseSegment], 'en');

    expect(notes.summary).toBe('Fallback model generated the final summary.');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns heuristic notes when all LLM routes fail', async () => {
    process.env.LLM_PROVIDER = 'openrouter';
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'qwen/qwen3-coder:free';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      text: async () => 'rate limited',
    } as Response);

    const service = new NotesEngineService();
    const notes = await service.generateFinalNotes([baseSegment], 'en');

    expect(notes.summary).toContain('Final summary');
    expect(notes.keyPoints).toContain(
      'The meeting is tomorrow at 5 PM. Do not forget.',
    );
  });
});
