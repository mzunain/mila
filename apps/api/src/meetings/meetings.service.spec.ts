import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MeetingsService } from './meetings.service';
import { ASR_PROVIDER } from './providers/asr-provider.token';
import { MockAsrProvider } from './providers/mock-asr.provider';
import { NotesEngineService } from './notes-engine.service';

describe('MeetingsService', () => {
  let service: MeetingsService;

  beforeEach(async () => {
    process.env.LLM_PROVIDER = 'mock';
    const moduleRef = await Test.createTestingModule({
      providers: [
        MeetingsService,
        MockAsrProvider,
        {
          provide: ASR_PROVIDER,
          useClass: MockAsrProvider,
        },
        NotesEngineService,
      ],
    }).compile();

    service = moduleRef.get(MeetingsService);
  });

  it('creates a live multilingual meeting session', () => {
    const result = service.createSession({
      title: 'Product sync',
      outputLanguage: 'en',
    });

    expect(result.session.title).toBe('Product sync');
    expect(result.session.status).toBe('live');
    expect(result.notes.outputLanguage).toBe('en');
  });

  it('stores auto-start meeting context for future calendar and desktop signals', () => {
    const detectedAt = new Date().toISOString();
    const result = service.createSession({
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
    const { session } = service.createSession({ outputLanguage: 'en' });
    const result = await service.ingestAudioChunk({
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
    const { session } = service.createSession({ outputLanguage: 'en' });
    const result = await service.ingestTranscriptChunk({
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
    const { session } = service.createSession({ outputLanguage: 'en' });
    const result = await service.ingestAudioChunk({
      type: 'audio-chunk',
      sessionId: session.id,
      chunkId: 'real-audio-1',
      capturedAt: new Date().toISOString(),
      mimeType: 'audio/ogg',
      audioBase64: 'ZmFrZS1vZ2ctZGF0YQ==',
    });

    expect(result.segment).toBeNull();
    expect(service.getSessionDetail(session.id)?.segments).toHaveLength(0);
  });

  it('ignores duplicate chunks by chunk id', async () => {
    const { session } = service.createSession({ outputLanguage: 'en' });
    const event = {
      type: 'audio-chunk' as const,
      sessionId: session.id,
      chunkId: 'chunk-1',
      capturedAt: new Date().toISOString(),
      mimeType: 'audio/mock',
    };

    await service.ingestAudioChunk(event);
    const duplicate = await service.ingestAudioChunk(event);

    expect(duplicate.segment).toBeNull();
    expect(service.getSessionDetail(session.id)?.segments).toHaveLength(1);
  });

  it('rejects chunks for missing sessions', async () => {
    await expect(
      service.ingestAudioChunk({
        type: 'audio-chunk',
        sessionId: 'missing',
        chunkId: 'chunk-1',
        capturedAt: new Date().toISOString(),
        mimeType: 'audio/webm',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
