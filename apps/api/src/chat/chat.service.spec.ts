import { ChatService } from './chat.service';
import type { PrismaService } from '../prisma/prisma.service';

type FindManyResult = Array<{
  id: string;
  title: string;
  createdAt: Date;
  notes: null | {
    summary: string | null;
    keyPoints: unknown;
    actionItems: unknown;
    decisions: unknown;
  };
}>;

const buildPrisma = (rows: FindManyResult): PrismaService =>
  ({
    meetingSession: { findMany: jest.fn().mockResolvedValue(rows) },
  }) as unknown as PrismaService;

const sessionRow = {
  id: 'session-1',
  title: 'Q3 kickoff',
  createdAt: new Date('2026-05-01T10:00:00Z'),
  notes: {
    summary: 'Team agreed to ship invoicing by end of June.',
    keyPoints: ['Ship invoicing by end of June'],
    actionItems: [{ text: 'Draft pricing page', owner: 'Ravi' }],
    decisions: ['Move launch to June 30'],
  },
};

describe('ChatService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_BASE_URL;
    delete process.env.GOOGLE_CHAT_MODEL;
    global.fetch = originalFetch;
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('returns a prompt when the user has not asked anything yet', async () => {
    const service = new ChatService(buildPrisma([sessionRow]));
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    const reply = await service.respond('user-1', {
      messages: [],
    });

    expect(reply.role).toBe('assistant');
    expect(reply.content).toMatch(/Ask me anything/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('tells the user there are no meetings to ground against', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    const service = new ChatService(buildPrisma([]));
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    const reply = await service.respond('user-1', {
      messages: [
        { role: 'user', content: 'What did we decide about pricing?' },
      ],
    });

    expect(reply.content).toMatch(/couldn't find any meetings/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to the deterministic composer when no Google key is set', async () => {
    const service = new ChatService(buildPrisma([sessionRow]));
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    const reply = await service.respond('user-1', {
      messages: [{ role: 'user', content: 'Status on invoicing?' }],
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reply.content).toContain('Q3 kickoff');
    expect(reply.content).toContain('invoicing');
    expect(reply.citations?.[0]?.sessionId).toBe('session-1');
  });

  it('calls Gemini with the documented payload shape and returns its content', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    process.env.GOOGLE_BASE_URL = 'https://example.test/v1';
    process.env.GOOGLE_CHAT_MODEL = 'gemini-2.5-flash';
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'Invoicing ships by June 30.' } }],
        }),
    });
    global.fetch = fetchSpy;
    const service = new ChatService(buildPrisma([sessionRow]));

    const reply = await service.respond('user-1', {
      messages: [{ role: 'user', content: 'When does invoicing ship?' }],
    });

    expect(reply.content).toBe('Invoicing ships by June 30.');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-key',
    );

    const body = JSON.parse(init.body as string) as {
      model: string;
      temperature: number;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('gemini-2.5-flash');
    expect(body.temperature).toBe(0.4);
    expect(body.max_tokens).toBe(600);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('MEETING CONTEXT');
    expect(body.messages[0].content).toContain('Q3 kickoff');
    expect(body.messages.at(-1)).toEqual({
      role: 'user',
      content: 'When does invoicing ship?',
    });
  });

  it('falls back to the composer when Gemini returns 429', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    });
    const service = new ChatService(buildPrisma([sessionRow]));

    const reply = await service.respond('user-1', {
      messages: [{ role: 'user', content: 'Quick update on pricing?' }],
    });

    expect(reply.content).toContain('Q3 kickoff');
    expect(reply.content).not.toContain('Rate limited');
  });

  it('falls back to the composer when Gemini returns empty content', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ choices: [{ message: { content: '   ' } }] }),
    });
    const service = new ChatService(buildPrisma([sessionRow]));

    const reply = await service.respond('user-1', {
      messages: [{ role: 'user', content: 'Anything new?' }],
    });

    expect(reply.content).toContain('Q3 kickoff');
  });
});
