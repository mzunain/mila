import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  MeetingStatus,
  TranscriptSegment,
  ActionItem,
  ExternalMeetingContext,
} from '@mila/shared';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotesEngineService } from './notes-engine.service';
import type { AsrProvider } from './providers/asr-provider';
import { ASR_PROVIDER } from './providers/asr-provider.token';

const KNOWN_LANGUAGES = new Set<SupportedLanguageCode>([
  'en',
  'ur',
  'hi',
  'fi',
  'mixed',
  'unknown',
]);

const KNOWN_STATUSES = new Set<MeetingStatus>([
  'scheduled',
  'live',
  'processing',
  'completed',
  'failed',
]);

@Injectable()
export class MeetingsService {
  private readonly processedChunkCache = new Map<string, Set<string>>();

  constructor(
    @Inject(ASR_PROVIDER) private readonly asrProvider: AsrProvider,
    private readonly notesEngine: NotesEngineService,
    private readonly prisma: PrismaService,
  ) {}

  async createSession(
    userId: string,
    request: CreateMeetingRequest = {},
  ): Promise<CreateMeetingResponse> {
    const outputLanguage = request.outputLanguage ?? 'en';
    const now = new Date();
    const sessionId = randomUUID();
    const notesId = randomUUID();

    const created = await this.prisma.$transaction(async (tx) => {
      const session = await tx.meetingSession.create({
        data: {
          id: sessionId,
          userId,
          title: request.title?.trim() || 'Untitled multilingual meeting',
          status: 'live',
          source: request.source ?? 'manual',
          autoStarted: request.autoStarted ?? false,
          outputLanguage,
          externalMeeting: request.externalMeeting
            ? (request.externalMeeting as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          templateId: request.templateId ?? null,
          startedAt: now,
        },
      });
      const notes = await tx.meetingNotes.create({
        data: {
          id: notesId,
          sessionId: session.id,
          summary: '',
          keyPoints: [],
          actionItems: [],
          decisions: [],
          outputLanguage,
          version: 1,
        },
      });
      return { session, notes };
    });

    return {
      session: this.toSession(created.session),
      notes: this.toNotes(created.notes),
    };
  }

  async listSessions(userId: string): Promise<MeetingSession[]> {
    const rows = await this.prisma.meetingSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toSession(row));
  }

  async getSessionDetail(userId: string, sessionId: string) {
    const session = await this.prisma.meetingSession.findUnique({
      where: { id: sessionId },
      include: {
        segments: { orderBy: { startMs: 'asc' } },
        notes: true,
      },
    });
    if (!session) return null;
    if (session.userId !== userId) throw new ForbiddenException();

    const notes = session.notes
      ? this.toNotes(session.notes)
      : createEmptyNotes(this.parseLanguage(session.outputLanguage));

    return {
      session: this.toSession(session),
      segments: session.segments.map((s) => this.toSegment(s)),
      notes,
    };
  }

  async ingestAudioChunk(
    userId: string,
    event: Extract<ClientMeetingEvent, { type: 'audio-chunk' }>,
  ) {
    const session = await this.loadOwnedSession(userId, event.sessionId);
    if (await this.alreadyProcessed(session.id, event.chunkId)) {
      const notes = await this.requireNotes(session.id);
      return { segment: null, notes };
    }

    const segmentIndex = await this.prisma.transcriptSegment.count({
      where: { sessionId: session.id },
    });
    const segment = await this.asrProvider.transcribe({
      sessionId: event.sessionId,
      chunkId: event.chunkId,
      mimeType: event.mimeType,
      audioBase64: event.audioBase64,
      outputLanguage: this.parseLanguage(session.outputLanguage),
      segmentIndex,
    });

    this.rememberChunk(session.id, event.chunkId);

    if (!segment) {
      const notes = await this.requireNotes(session.id);
      return { segment: null, notes };
    }

    await this.persistSegment(session.id, segment);
    const notes = await this.regenerateIncrementalNotes(session.id);
    return { segment, notes };
  }

  async ingestTranscriptChunk(
    userId: string,
    event: Extract<ClientMeetingEvent, { type: 'transcript-chunk' }>,
  ) {
    const session = await this.loadOwnedSession(userId, event.sessionId);
    if (await this.alreadyProcessed(session.id, event.chunkId)) {
      const notes = await this.requireNotes(session.id);
      return { segment: null, notes };
    }

    const originalText = event.text.trim();
    if (!originalText) {
      const notes = await this.requireNotes(session.id);
      return { segment: null, notes };
    }

    this.rememberChunk(session.id, event.chunkId);

    const segmentIndex = await this.prisma.transcriptSegment.count({
      where: { sessionId: session.id },
    });
    const detectedLanguage =
      this.parseLanguageOrNull(event.detectedLanguage) ??
      detectLanguage(originalText);
    const startMs = segmentIndex * 4200;
    const sessionLanguage = this.parseLanguage(session.outputLanguage);
    const segment: TranscriptSegment = {
      id: event.chunkId,
      sessionId: session.id,
      speakerId: event.speakerId ?? `speaker-${(segmentIndex % 2) + 1}`,
      originalText,
      normalizedText: originalText,
      translatedText: this.translateTranscriptText(
        originalText,
        sessionLanguage,
      ),
      detectedLanguage,
      direction: detectDirection(originalText),
      confidence: 0.99,
      startMs,
      endMs: startMs + 3800,
      isFinal: event.isFinal ?? true,
    };

    await this.persistSegment(session.id, segment);
    const notes = await this.regenerateIncrementalNotes(session.id);
    return { segment, notes };
  }

  async completeSession(userId: string, sessionId: string) {
    const session = await this.loadOwnedSession(userId, sessionId);
    const endedAt = new Date();

    await this.prisma.meetingSession.update({
      where: { id: session.id },
      data: { status: 'completed', endedAt },
    });

    return this.regenerateFinalNotes(session.id);
  }

  /**
   * Used by the gateway's `start` event to send the connecting client the
   * current view without any side effects. Treats forbidden as not-found so
   * the WS handshake never reveals whether a session id belongs to someone else.
   */
  async getSessionForClient(userId: string, sessionId: string) {
    try {
      return await this.getSessionDetail(userId, sessionId);
    } catch (error) {
      if (error instanceof ForbiddenException) return null;
      throw error;
    }
  }

  private async loadOwnedSession(userId: string, sessionId: string) {
    const session = await this.prisma.meetingSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        outputLanguage: true,
        status: true,
      },
    });
    if (!session) throw new NotFoundException('Meeting session not found');
    if (session.userId !== userId) throw new ForbiddenException();
    return session;
  }

  private async persistSegment(sessionId: string, segment: TranscriptSegment) {
    await this.prisma.transcriptSegment.create({
      data: {
        id: segment.id,
        sessionId,
        speakerId: segment.speakerId,
        originalText: segment.originalText,
        normalizedText: segment.normalizedText,
        translatedText: segment.translatedText,
        detectedLanguage: segment.detectedLanguage,
        direction: segment.direction,
        confidence: segment.confidence,
        startMs: segment.startMs,
        endMs: segment.endMs,
        isFinal: segment.isFinal,
      },
    });
  }

  private async regenerateIncrementalNotes(
    sessionId: string,
  ): Promise<MeetingNotes> {
    const session = await this.prisma.meetingSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { segments: { orderBy: { startMs: 'asc' } } },
    });
    const language = this.parseLanguage(session.outputLanguage);
    const segments = session.segments.map((s) => this.toSegment(s));
    const next = await this.notesEngine.generateIncrementalNotes(
      segments,
      language,
    );
    return this.upsertNotes(sessionId, next);
  }

  private async regenerateFinalNotes(sessionId: string): Promise<MeetingNotes> {
    const session = await this.prisma.meetingSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { segments: { orderBy: { startMs: 'asc' } } },
    });
    const language = this.parseLanguage(session.outputLanguage);
    const segments = session.segments.map((s) => this.toSegment(s));
    const next = await this.notesEngine.generateFinalNotes(segments, language);
    return this.upsertNotes(sessionId, next);
  }

  private async upsertNotes(
    sessionId: string,
    notes: MeetingNotes,
  ): Promise<MeetingNotes> {
    const updated = await this.prisma.meetingNotes.upsert({
      where: { sessionId },
      update: {
        summary: notes.summary,
        keyPoints: notes.keyPoints as Prisma.InputJsonValue,
        actionItems: notes.actionItems as unknown as Prisma.InputJsonValue,
        decisions: notes.decisions as Prisma.InputJsonValue,
        outputLanguage: notes.outputLanguage,
        version: { increment: 1 },
      },
      create: {
        sessionId,
        summary: notes.summary,
        keyPoints: notes.keyPoints as Prisma.InputJsonValue,
        actionItems: notes.actionItems as unknown as Prisma.InputJsonValue,
        decisions: notes.decisions as Prisma.InputJsonValue,
        outputLanguage: notes.outputLanguage,
      },
    });
    return this.toNotes(updated);
  }

  private async requireNotes(sessionId: string): Promise<MeetingNotes> {
    const row = await this.prisma.meetingNotes.findUnique({
      where: { sessionId },
    });
    if (row) return this.toNotes(row);
    const session = await this.prisma.meetingSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { outputLanguage: true },
    });
    return createEmptyNotes(this.parseLanguage(session.outputLanguage));
  }

  private async alreadyProcessed(sessionId: string, chunkId: string) {
    const cached = this.processedChunkCache.get(sessionId);
    if (cached?.has(chunkId)) return true;
    const existing = await this.prisma.transcriptSegment.findUnique({
      where: { id: chunkId },
      select: { id: true },
    });
    if (existing) {
      this.rememberChunk(sessionId, chunkId);
      return true;
    }
    return false;
  }

  private rememberChunk(sessionId: string, chunkId: string) {
    let set = this.processedChunkCache.get(sessionId);
    if (!set) {
      set = new Set();
      this.processedChunkCache.set(sessionId, set);
    }
    set.add(chunkId);
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

  private parseLanguage(value: string): SupportedLanguageCode {
    return KNOWN_LANGUAGES.has(value as SupportedLanguageCode)
      ? (value as SupportedLanguageCode)
      : 'en';
  }

  private parseLanguageOrNull(
    value: string | undefined,
  ): SupportedLanguageCode | null {
    if (!value) return null;
    return KNOWN_LANGUAGES.has(value as SupportedLanguageCode)
      ? (value as SupportedLanguageCode)
      : null;
  }

  private parseStatus(value: string): MeetingStatus {
    return KNOWN_STATUSES.has(value as MeetingStatus)
      ? (value as MeetingStatus)
      : 'live';
  }

  private toSession(row: {
    id: string;
    title: string;
    status: string;
    source: string;
    autoStarted: boolean;
    outputLanguage: string;
    externalMeeting: Prisma.JsonValue;
    templateId?: string | null;
    shareToken?: string | null;
    createdAt: Date;
    startedAt: Date | null;
    endedAt: Date | null;
  }): MeetingSession {
    return {
      id: row.id,
      title: row.title,
      status: this.parseStatus(row.status),
      source: row.source as MeetingSession['source'],
      autoStarted: row.autoStarted,
      outputLanguage: this.parseLanguage(row.outputLanguage),
      externalMeeting:
        row.externalMeeting === null
          ? undefined
          : (row.externalMeeting as unknown as ExternalMeetingContext),
      templateId: row.templateId ?? undefined,
      shareToken: row.shareToken ?? null,
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString(),
      endedAt: row.endedAt?.toISOString(),
    };
  }

  async createShareToken(userId: string, sessionId: string) {
    const session = await this.prisma.meetingSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, shareToken: true },
    });
    if (!session) throw new NotFoundException('Meeting session not found');
    if (session.userId !== userId) throw new ForbiddenException();
    if (session.shareToken) return session.shareToken;
    const token = randomUUID().replace(/-/g, '');
    await this.prisma.meetingSession.update({
      where: { id: session.id },
      data: { shareToken: token },
    });
    return token;
  }

  async revokeShareToken(userId: string, sessionId: string) {
    const session = await this.prisma.meetingSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, shareToken: true },
    });
    if (!session) throw new NotFoundException('Meeting session not found');
    if (session.userId !== userId) throw new ForbiddenException();
    if (!session.shareToken) return;
    await this.prisma.meetingSession.update({
      where: { id: session.id },
      data: { shareToken: null },
    });
  }

  async getSharedSession(shareToken: string) {
    const session = await this.prisma.meetingSession.findUnique({
      where: { shareToken },
      include: { notes: true },
    });
    if (!session) return null;
    const notes = session.notes
      ? this.toNotes(session.notes)
      : createEmptyNotes(this.parseLanguage(session.outputLanguage));
    return {
      id: session.id,
      title: session.title,
      outputLanguage: this.parseLanguage(session.outputLanguage),
      createdAt: session.createdAt.toISOString(),
      notes: {
        summary: notes.summary,
        keyPoints: notes.keyPoints,
        actionItems: notes.actionItems,
        decisions: notes.decisions,
      },
    };
  }

  private toSegment(row: {
    id: string;
    sessionId: string;
    speakerId: string | null;
    originalText: string;
    normalizedText: string;
    translatedText: string;
    detectedLanguage: string;
    direction: string;
    confidence: number;
    startMs: number;
    endMs: number;
    isFinal: boolean;
  }): TranscriptSegment {
    return {
      id: row.id,
      sessionId: row.sessionId,
      speakerId: row.speakerId ?? undefined,
      originalText: row.originalText,
      normalizedText: row.normalizedText,
      translatedText: row.translatedText,
      detectedLanguage: this.parseLanguage(row.detectedLanguage),
      direction: row.direction === 'rtl' ? 'rtl' : 'ltr',
      confidence: row.confidence,
      startMs: row.startMs,
      endMs: row.endMs,
      isFinal: row.isFinal,
    };
  }

  private toNotes(row: {
    summary: string;
    keyPoints: Prisma.JsonValue;
    actionItems: Prisma.JsonValue;
    decisions: Prisma.JsonValue;
    outputLanguage: string;
    updatedAt: Date;
  }): MeetingNotes {
    return {
      summary: row.summary,
      keyPoints: Array.isArray(row.keyPoints)
        ? (row.keyPoints as string[])
        : [],
      actionItems: Array.isArray(row.actionItems)
        ? (row.actionItems as unknown as ActionItem[])
        : [],
      decisions: Array.isArray(row.decisions)
        ? (row.decisions as string[])
        : [],
      outputLanguage: this.parseLanguage(row.outputLanguage),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
