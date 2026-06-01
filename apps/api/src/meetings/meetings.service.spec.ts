import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MeetingsService } from './meetings.service';
import { ASR_PROVIDER } from './providers/asr-provider.token';
import { MockAsrProvider } from './providers/mock-asr.provider';
import { NotesEngineService } from './notes-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { InMemoryPrisma } from './testing/in-memory-prisma';

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

describe('MeetingsService', () => {
  let service: MeetingsService;
  let prisma: InMemoryPrisma;

  beforeEach(async () => {
    process.env.LLM_PROVIDER = 'mock';
    prisma = new InMemoryPrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MeetingsService,
        MockAsrProvider,
        {
          provide: ASR_PROVIDER,
          useClass: MockAsrProvider,
        },
        NotesEngineService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(MeetingsService);
  });

  it('creates a live multilingual meeting session', async () => {
    const result = await service.createSession(USER_ID, {
      title: 'Product sync',
      outputLanguage: 'en',
    });

    expect(result.session.title).toBe('Product sync');
    expect(result.session.status).toBe('live');
    expect(result.notes.outputLanguage).toBe('en');
  });

  it('stores auto-start meeting context for future calendar and desktop signals', async () => {
    const detectedAt = new Date().toISOString();
    const result = await service.createSession(USER_ID, {
      title: 'Google Meet: Product sync',
      outputLanguage: 'en',
      source: 'auto-browser',
      autoStarted: true,
      externalMeeting: {
        provider: 'google-meet',
        title: 'Product sync',
        url: 'https://meet.google.com/abc-defg-hij',
        detectedAt,
        source: 'auto-browser',
      },
    });

    expect(result.session.autoStarted).toBe(true);
    expect(result.session.source).toBe('auto-browser');
    expect(result.session.externalMeeting?.provider).toBe('google-meet');
  });

  it('ingests an audio chunk and stores a transcript segment', async () => {
    const { session } = await service.createSession(USER_ID, {
      outputLanguage: 'en',
    });
    const result = await service.ingestAudioChunk(USER_ID, {
      type: 'audio-chunk',
      sessionId: session.id,
      chunkId: 'chunk-1',
      capturedAt: new Date().toISOString(),
      mimeType: 'audio/mock',
    });

    expect(result.segment?.originalText).toContain('Kal meeting hai');
    expect(result.segment?.detectedLanguage).toBe('mixed');
    expect(result.notes.keyPoints.length).toBeGreaterThan(0);
  });

  it('ingests browser caption text without requiring microphone access', async () => {
    const { session } = await service.createSession(USER_ID, {
      outputLanguage: 'en',
    });
    const result = await service.ingestTranscriptChunk(USER_ID, {
      type: 'transcript-chunk',
      sessionId: session.id,
      chunkId: 'caption-1',
      capturedAt: new Date().toISOString(),
      speakerId: 'Ravi',
      text: 'Kal meeting hai at 5 PM, do not forget.',
    });

    expect(result.segment?.speakerId).toBe('Ravi');
    expect(result.segment?.originalText).toContain('Kal meeting');
    expect(result.segment?.detectedLanguage).toBe('mixed');
    expect(result.notes.summary).toContain('Kal meeting');
  });

  it('does not invent transcript text for real audio when only mock ASR is configured', async () => {
    const { session } = await service.createSession(USER_ID, {
      outputLanguage: 'en',
    });
    const result = await service.ingestAudioChunk(USER_ID, {
      type: 'audio-chunk',
      sessionId: session.id,
      chunkId: 'real-audio-1',
      capturedAt: new Date().toISOString(),
      mimeType: 'audio/ogg',
      audioBase64: 'ZmFrZS1vZ2ctZGF0YQ==',
    });

    expect(result.segment).toBeNull();
    const detail = await service.getSessionDetail(USER_ID, session.id);
    expect(detail?.segments).toHaveLength(0);
  });

  it('ignores duplicate chunks by chunk id', async () => {
    const { session } = await service.createSession(USER_ID, {
      outputLanguage: 'en',
    });
    const event = {
      type: 'audio-chunk' as const,
      sessionId: session.id,
      chunkId: 'chunk-1',
      capturedAt: new Date().toISOString(),
      mimeType: 'audio/mock',
    };

    await service.ingestAudioChunk(USER_ID, event);
    const duplicate = await service.ingestAudioChunk(USER_ID, event);

    expect(duplicate.segment).toBeNull();
    const detail = await service.getSessionDetail(USER_ID, session.id);
    expect(detail?.segments).toHaveLength(1);
  });

  it('rejects chunks for missing sessions', async () => {
    await expect(
      service.ingestAudioChunk(USER_ID, {
        type: 'audio-chunk',
        sessionId: '00000000-0000-0000-0000-000000000000',
        chunkId: 'chunk-1',
        capturedAt: new Date().toISOString(),
        mimeType: 'audio/webm',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks another user from reading or mutating a foreign session', async () => {
    const { session } = await service.createSession(USER_ID, {
      outputLanguage: 'en',
    });

    await expect(
      service.getSessionDetail(OTHER_USER_ID, session.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.ingestAudioChunk(OTHER_USER_ID, {
        type: 'audio-chunk',
        sessionId: session.id,
        chunkId: 'chunk-1',
        capturedAt: new Date().toISOString(),
        mimeType: 'audio/mock',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only lists sessions owned by the calling user', async () => {
    const mine = await service.createSession(USER_ID, { title: 'Mine' });
    await service.createSession(OTHER_USER_ID, { title: 'Theirs' });

    const listed = await service.listSessions(USER_ID);
    expect(listed.map((s) => s.id)).toEqual([mine.session.id]);
  });

  it('includes notes intelligence in the session list', async () => {
    const { session } = await service.createSession(USER_ID, {
      title: 'Launch review',
      outputLanguage: 'en',
    });

    await service.ingestTranscriptChunk(USER_ID, {
      type: 'transcript-chunk',
      sessionId: session.id,
      chunkId: 'caption-1',
      capturedAt: new Date().toISOString(),
      text: 'We decided to publish the desktop build tomorrow.',
    });
    await service.ingestTranscriptChunk(USER_ID, {
      type: 'transcript-chunk',
      sessionId: session.id,
      chunkId: 'caption-2',
      capturedAt: new Date().toISOString(),
      text: 'Please send the production QA checklist before launch.',
    });
    await service.completeSession(USER_ID, session.id);

    const listed = await service.listSessions(USER_ID);
    const preview = listed[0]?.notesPreview;

    expect(listed[0]?.title).toBe('Launch review');
    expect(preview?.summary).toContain('Final summary');
    expect(preview?.decisionCount).toBe(1);
    expect(preview?.actionStats.total).toBe(1);
    expect(preview?.actionStats.open).toBe(1);
    expect(preview?.actionStats.riskLevel).toBe('needs-owners');
  });

  it('builds an action inbox across sessions owned by the calling user', async () => {
    const mine = await service.createSession(USER_ID, {
      title: 'Launch review',
      outputLanguage: 'en',
    });
    const theirs = await service.createSession(OTHER_USER_ID, {
      title: 'Other user review',
      outputLanguage: 'en',
    });

    await service.ingestTranscriptChunk(USER_ID, {
      type: 'transcript-chunk',
      sessionId: mine.session.id,
      chunkId: 'caption-1',
      capturedAt: new Date().toISOString(),
      text: 'Please send the launch checklist before release.',
    });
    await service.ingestTranscriptChunk(OTHER_USER_ID, {
      type: 'transcript-chunk',
      sessionId: theirs.session.id,
      chunkId: 'caption-1',
      capturedAt: new Date().toISOString(),
      text: 'Please send the private customer recap.',
    });

    const inbox = await service.getActionInbox(USER_ID);

    expect(inbox.totalOpen).toBe(1);
    expect(inbox.sessionsWithOpenActions).toBe(1);
    expect(inbox.missingOwner).toBe(1);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]?.sessionId).toBe(mine.session.id);
    expect(inbox.items[0]?.sessionTitle).toBe('Launch review');
    expect(inbox.items[0]?.text).toContain('launch checklist');
  });
});
