import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  createEmptyNotes,
  detectDirection,
  detectLanguage,
} from '@mila/shared';
import type {
  ClientMeetingEvent,
  CreateMeetingRequest,
  CreateMeetingResponse,
  MeetingNotes,
  SupportedLanguageCode,
  MeetingSession,
  TranscriptSegment,
} from '@mila/shared';
import { randomUUID } from 'node:crypto';
import { NotesEngineService } from './notes-engine.service';
import type { AsrProvider } from './providers/asr-provider';
import { ASR_PROVIDER } from './providers/asr-provider.token';

interface SessionRecord {
  session: MeetingSession;
  notes: MeetingNotes;
  segments: TranscriptSegment[];
  processedChunkIds: Set<string>;
}

@Injectable()
export class MeetingsService {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(
    @Inject(ASR_PROVIDER) private readonly asrProvider: AsrProvider,
    private readonly notesEngine: NotesEngineService,
  ) {}

  createSession(request: CreateMeetingRequest = {}): CreateMeetingResponse {
    const outputLanguage = request.outputLanguage ?? 'en';
    const now = new Date().toISOString();
    const session: MeetingSession = {
      id: randomUUID(),
      title: request.title?.trim() || 'Untitled multilingual meeting',
      status: 'live',
      source: request.source ?? 'manual',
      autoStarted: request.autoStarted ?? false,
      outputLanguage,
      externalMeeting: request.externalMeeting,
      createdAt: now,
      startedAt: now,
    };
    const notes = createEmptyNotes(outputLanguage);

    this.sessions.set(session.id, {
      session,
      notes,
      segments: [],
      processedChunkIds: new Set(),
    });

    return { session, notes };
  }

  listSessions() {
    return [...this.sessions.values()]
      .map((record) => record.session)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getSessionDetail(sessionId: string) {
    const record = this.sessions.get(sessionId);

    if (!record) {
      return null;
    }

    return {
      session: record.session,
      segments: record.segments,
      notes: record.notes,
    };
  }

  async ingestAudioChunk(
    event: Extract<ClientMeetingEvent, { type: 'audio-chunk' }>,
  ) {
    const record = this.sessions.get(event.sessionId);

    if (!record) {
      throw new NotFoundException('Meeting session not found');
    }

    if (record.processedChunkIds.has(event.chunkId)) {
      return { segment: null, notes: record.notes };
    }

    record.processedChunkIds.add(event.chunkId);

    const segment = await this.asrProvider.transcribe({
      sessionId: event.sessionId,
      chunkId: event.chunkId,
      mimeType: event.mimeType,
      audioBase64: event.audioBase64,
      outputLanguage: record.session.outputLanguage,
      segmentIndex: record.segments.length,
    });

    if (segment) {
      record.segments.push(segment);
      record.notes = await this.notesEngine.generateIncrementalNotes(
        record.segments,
        record.session.outputLanguage,
      );
    }

    return { segment, notes: record.notes };
  }

  async ingestTranscriptChunk(
    event: Extract<ClientMeetingEvent, { type: 'transcript-chunk' }>,
  ) {
    const record = this.sessions.get(event.sessionId);

    if (!record) {
      throw new NotFoundException('Meeting session not found');
    }

    if (record.processedChunkIds.has(event.chunkId)) {
      return { segment: null, notes: record.notes };
    }

    const originalText = event.text.trim();

    if (!originalText) {
      return { segment: null, notes: record.notes };
    }

    record.processedChunkIds.add(event.chunkId);

    const segmentIndex = record.segments.length;
    const detectedLanguage =
      parseSupportedLanguage(event.detectedLanguage) ??
      detectLanguage(originalText);
    const startMs = segmentIndex * 4200;
    const segment: TranscriptSegment = {
      id: event.chunkId,
      sessionId: event.sessionId,
      speakerId: event.speakerId ?? `speaker-${(segmentIndex % 2) + 1}`,
      originalText,
      normalizedText: originalText,
      translatedText: this.translateTranscriptText(
        originalText,
        record.session.outputLanguage,
      ),
      detectedLanguage,
      direction: detectDirection(originalText),
      confidence: 0.99,
      startMs,
      endMs: startMs + 3800,
      isFinal: event.isFinal ?? true,
    };

    record.segments.push(segment);
    record.notes = await this.notesEngine.generateIncrementalNotes(
      record.segments,
      record.session.outputLanguage,
    );

    return { segment, notes: record.notes };
  }

  async completeSession(sessionId: string) {
    const record = this.sessions.get(sessionId);

    if (!record) {
      throw new NotFoundException('Meeting session not found');
    }

    record.session = {
      ...record.session,
      status: 'completed',
      endedAt: new Date().toISOString(),
    };
    record.notes = await this.notesEngine.generateFinalNotes(
      record.segments,
      record.session.outputLanguage,
    );

    return record.notes;
  }

  private translateTranscriptText(
    text: string,
    outputLanguage: SupportedLanguageCode,
  ) {
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

function parseSupportedLanguage(
  value: SupportedLanguageCode | undefined,
): SupportedLanguageCode | null {
  if (
    value === 'en' ||
    value === 'ur' ||
    value === 'hi' ||
    value === 'fi' ||
    value === 'mixed' ||
    value === 'unknown'
  ) {
    return value;
  }

  return null;
}
