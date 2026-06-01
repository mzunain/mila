import { LiveAssistService } from './live-assist.service';
import { NotesEngineService } from './notes-engine.service';
import type { AssistTurn } from '@mila/shared';

const QUESTION_TURNS: AssistTurn[] = [
  { speaker: 'me', text: 'I led the migration to the new payments service.' },
  { speaker: 'them', text: 'How did you handle the database cutover?' },
];

// Last turn is mine, so the auto-trigger heuristic stays quiet.
const MY_TURN: AssistTurn[] = [
  { speaker: 'them', text: 'How would you design the queue?' },
  { speaker: 'me', text: 'I would start with a durable log…' },
];

const MODEL_JSON = JSON.stringify({
  headline: 'They want your cutover approach',
  talkingPoints: ['Dual-write then backfill', 'Cut over behind a flag'],
  followUps: ['What was the downtime budget?'],
  confidence: 'high',
});

describe('LiveAssistService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.LLM_IMPORT_FREE_CLAUDE_ENV;
    global.fetch = originalFetch;
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('stays silent for an automatic request when it is still my turn', async () => {
    const engine = new NotesEngineService();
    const hasRoutes = jest.spyOn(engine, 'hasLlmRoutes').mockReturnValue(true);
    const completeChat = jest.spyOn(engine, 'completeChat');
    const service = new LiveAssistService(engine);

    const outcome = await service.suggest({ turns: MY_TURN });

    expect(outcome).toEqual({ suggestion: null, reason: 'not-triggered' });
    // No model spend (and we never even check for routes) when nothing triggers.
    expect(completeChat).not.toHaveBeenCalled();
    expect(hasRoutes).not.toHaveBeenCalled();
  });

  it('asks the model and returns talking points on an auto-triggered question', async () => {
    const engine = new NotesEngineService();
    jest.spyOn(engine, 'hasLlmRoutes').mockReturnValue(true);
    const completeChat = jest
      .spyOn(engine, 'completeChat')
      .mockResolvedValue(MODEL_JSON);
    const service = new LiveAssistService(engine);

    const outcome = await service.suggest({
      turns: QUESTION_TURNS,
      context: { audience: 'interviewer' },
    });

    expect(outcome.reason).toBe('ok');
    expect(outcome.suggestion?.talkingPoints).toEqual([
      'Dual-write then backfill',
      'Cut over behind a flag',
    ]);
    expect(outcome.suggestion?.confidence).toBe('high');

    // The assist prompt and tuning reach the shared LLM stack.
    expect(completeChat).toHaveBeenCalledTimes(1);
    const [messages, opts] = completeChat.mock.calls[0];
    expect(messages.system).toContain('talkingPoints');
    expect(messages.user).toContain('database cutover');
    expect(opts).toEqual({ temperature: 0.4, maxTokens: 500 });
  });

  it('runs against the model even without a trigger when the request is manual', async () => {
    const engine = new NotesEngineService();
    jest.spyOn(engine, 'hasLlmRoutes').mockReturnValue(true);
    const completeChat = jest
      .spyOn(engine, 'completeChat')
      .mockResolvedValue(MODEL_JSON);
    const service = new LiveAssistService(engine);

    const outcome = await service.suggest({ turns: MY_TURN, manual: true });

    expect(outcome.reason).toBe('ok');
    expect(outcome.suggestion?.headline).toBe(
      'They want your cutover approach',
    );
    expect(completeChat).toHaveBeenCalledTimes(1);
  });

  it('reports no-model for a manual request when no LLM route is configured', async () => {
    const engine = new NotesEngineService();
    jest.spyOn(engine, 'hasLlmRoutes').mockReturnValue(false);
    const completeChat = jest.spyOn(engine, 'completeChat');
    const service = new LiveAssistService(engine);

    const outcome = await service.suggest({
      turns: QUESTION_TURNS,
      manual: true,
    });

    expect(outcome).toEqual({ suggestion: null, reason: 'no-model' });
    expect(completeChat).not.toHaveBeenCalled();
  });

  it('reports no-suggestion when the model returns nothing usable', async () => {
    const engine = new NotesEngineService();
    jest.spyOn(engine, 'hasLlmRoutes').mockReturnValue(true);
    jest.spyOn(engine, 'completeChat').mockResolvedValue('not json at all');
    const service = new LiveAssistService(engine);

    const outcome = await service.suggest({
      turns: QUESTION_TURNS,
      manual: true,
    });

    expect(outcome).toEqual({ suggestion: null, reason: 'no-suggestion' });
  });

  it('reports no-suggestion when every model route fails', async () => {
    const engine = new NotesEngineService();
    jest.spyOn(engine, 'hasLlmRoutes').mockReturnValue(true);
    jest.spyOn(engine, 'completeChat').mockResolvedValue(null);
    const service = new LiveAssistService(engine);

    const outcome = await service.suggest({
      turns: QUESTION_TURNS,
      manual: true,
    });

    expect(outcome).toEqual({ suggestion: null, reason: 'no-suggestion' });
  });

  it('flows an assist prompt through the real LLM routing to a parsed suggestion', async () => {
    process.env.LLM_PROVIDER = 'openrouter';
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'qwen/qwen3-coder:free';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: MODEL_JSON } }],
        }),
    });

    const engine = new NotesEngineService();
    const service = new LiveAssistService(engine);

    const outcome = await service.suggest({
      turns: QUESTION_TURNS,
      manual: true,
    });

    expect(outcome.reason).toBe('ok');
    expect(outcome.suggestion?.talkingPoints).toEqual([
      'Dual-write then backfill',
      'Cut over behind a flag',
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
