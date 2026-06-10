import { Injectable, Logger } from '@nestjs/common';
import type { ChatMessage, ChatRequest } from '@mila/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  embedTextLocally,
  toPgVectorLiteral,
} from '../embeddings/local-embedding';

type SessionContext = {
  id: string;
  title: string;
  createdAt: Date;
  notes?: {
    summary?: string | null;
    keyPoints: string[];
    actionItems: { text: string; owner?: string | null }[];
    decisions: string[];
  } | null;
  segments: {
    originalText: string;
    normalizedText: string;
    translatedText: string;
    startMs: number;
  }[];
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly prisma: PrismaService) {}

  async respond(userId: string, request: ChatRequest): Promise<ChatMessage> {
    const lastUserMessage = [...request.messages]
      .reverse()
      .find((message) => message.role === 'user');
    const question = lastUserMessage?.content.trim() ?? '';

    const sessions = await this.relevantSessions(
      userId,
      request.sessionIds,
      question,
    );

    const citations = sessions.map((session) => ({
      sessionId: session.id,
      title: session.title,
      snippet: this.extractSessionSnippet(session, question),
    }));

    const content = await this.generateAnswer(
      question,
      sessions,
      request.messages,
    );

    return {
      id: randomUUID(),
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
      citations,
    };
  }

  private async generateAnswer(
    question: string,
    sessions: SessionContext[],
    history: ChatRequest['messages'],
  ): Promise<string> {
    if (!question) {
      return "Ask me anything about your recent meetings — summaries, action items, decisions, or specific people's commitments.";
    }
    if (sessions.length === 0) {
      return `I couldn't find any meetings to answer "${question}" against yet. Record a meeting or upload audio and I'll have something to work with.`;
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return this.composeAnswer(question, sessions);

    try {
      return await this.askGemini(apiKey, question, sessions, history);
    } catch (err) {
      this.logger.warn(
        `Gemini call failed, falling back to stub: ${err instanceof Error ? err.message : err}`,
      );
      return this.composeAnswer(question, sessions);
    }
  }

  private async askGemini(
    apiKey: string,
    question: string,
    sessions: SessionContext[],
    history: ChatRequest['messages'],
  ): Promise<string> {
    const baseUrl =
      process.env.GOOGLE_BASE_URL ??
      'https://generativelanguage.googleapis.com/v1beta/openai';
    const model = process.env.GOOGLE_CHAT_MODEL ?? 'gemini-2.5-flash';

    const systemPrompt = `You are Mila, an assistant that answers questions about a user's recent meetings. Answer concisely and ground every claim in the meeting context below. If the context doesn't cover the question, say so plainly. Don't invent details.\n\n--- MEETING CONTEXT ---\n${this.formatSessionsForPrompt(sessions)}\n--- END CONTEXT ---`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    ];
    if (
      !history.some((m) => m.role === 'user' && m.content.trim() === question)
    ) {
      messages.push({ role: 'user', content: question });
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: 600,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Gemini ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Gemini returned empty content');
    return text;
  }

  private formatSessionsForPrompt(sessions: SessionContext[]): string {
    return sessions
      .map((session, index) => {
        const notes = session.notes;
        const parts: string[] = [
          `[Meeting ${index + 1}] ${session.title} (${session.createdAt.toISOString().slice(0, 10)})`,
        ];
        if (notes?.summary) parts.push(`Summary: ${notes.summary}`);
        if (notes?.keyPoints?.length)
          parts.push(
            `Key points:\n${notes.keyPoints.map((p) => `- ${p}`).join('\n')}`,
          );
        if (notes?.actionItems?.length)
          parts.push(
            `Action items:\n${notes.actionItems.map((a) => `- ${a.text}${a.owner ? ` (owner: ${a.owner})` : ''}`).join('\n')}`,
          );
        if (notes?.decisions?.length)
          parts.push(
            `Decisions:\n${notes.decisions.map((d) => `- ${d}`).join('\n')}`,
          );
        if (session.segments.length)
          parts.push(
            `Transcript excerpts:\n${session.segments
              .slice(0, 8)
              .map(
                (segment) =>
                  `- [${formatOffset(segment.startMs)}] ${segment.normalizedText}`,
              )
              .join('\n')}`,
          );
        return parts.join('\n');
      })
      .join('\n\n');
  }

  private async relevantSessions(
    userId: string,
    sessionIds?: string[],
    question = '',
  ): Promise<SessionContext[]> {
    const explicitScope = Boolean(sessionIds && sessionIds.length > 0);
    const rows = await this.prisma.meetingSession.findMany({
      where: {
        userId,
        ...(explicitScope ? { id: { in: sessionIds } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: explicitScope ? sessionIds!.length : 50,
      select: {
        id: true,
        title: true,
        createdAt: true,
        notes: {
          select: {
            summary: true,
            keyPoints: true,
            actionItems: true,
            decisions: true,
          },
        },
        segments: {
          orderBy: { startMs: 'asc' },
          take: 80,
          select: {
            originalText: true,
            normalizedText: true,
            translatedText: true,
            startMs: true,
          },
        },
      },
    });
    const sessions = rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      notes: row.notes
        ? {
            summary: row.notes.summary,
            keyPoints: (row.notes.keyPoints as string[]) ?? [],
            actionItems:
              (row.notes.actionItems as {
                text: string;
                owner?: string | null;
              }[]) ?? [],
            decisions: readDecisionTexts(row.notes.decisions),
          }
        : null,
      segments: row.segments ?? [],
    }));

    if (explicitScope) {
      return sessions;
    }

    const terms = searchTerms(question);
    if (!terms.length) {
      return sessions.slice(0, 8);
    }

    const ranked = sessions
      .map((session) => ({ session, score: scoreSession(session, terms) }))
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.session.createdAt.getTime() - a.session.createdAt.getTime(),
      )
      .map((item) => item.session);

    if (ranked.length) {
      return ranked.slice(0, 8);
    }

    const vectorSessionIds = await this.vectorSessionIds(userId, question);
    if (vectorSessionIds.length) {
      return this.relevantSessions(userId, vectorSessionIds, '');
    }

    return sessions.slice(0, 8);
  }

  private async vectorSessionIds(userId: string, question: string) {
    const prisma = this.prisma as PrismaService & {
      $queryRawUnsafe?: <T = unknown>(
        query: string,
        ...values: unknown[]
      ) => Promise<T>;
    };
    if (typeof prisma.$queryRawUnsafe !== 'function' || !question.trim()) {
      return [];
    }

    try {
      const embedding = toPgVectorLiteral(embedTextLocally(question));
      const rows = await prisma.$queryRawUnsafe<Array<{ sessionId: string }>>(
        `SELECT DISTINCT ms.id::text AS "sessionId",
                MIN(me.embedding <=> $1::vector) AS distance
           FROM meeting_embeddings me
           JOIN meeting_sessions ms ON ms.id = me.session_id
          WHERE ms.user_id = $2::uuid
          GROUP BY ms.id
          ORDER BY distance ASC
          LIMIT 8`,
        embedding,
        userId,
      );
      return rows.map((row) => row.sessionId).filter(Boolean);
    } catch (error) {
      this.logger.warn(
        `Vector meeting search failed, falling back to keyword search: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return [];
    }
  }

  private composeAnswer(question: string, sessions: SessionContext[]): string {
    const heads = sessions
      .slice(0, 3)
      .map(
        (session) =>
          `• ${session.title}${session.notes?.summary ? ` — ${this.truncate(session.notes.summary, 140)}` : ''}`,
      )
      .join('\n');
    return `Based on your recent meetings, here's what I found about "${question}":\n\n${heads}`;
  }

  private extractSessionSnippet(session: SessionContext, question: string) {
    const transcriptMatch = this.extractSnippet(
      session.segments.map((segment) => segment.normalizedText).join(' '),
      question,
    );
    if (transcriptMatch) return transcriptMatch;
    return this.extractSnippet(session.notes?.summary ?? null, question);
  }

  private extractSnippet(summary: string | null, question: string) {
    if (!summary) return undefined;
    if (!question) return this.truncate(summary, 140);
    const sentences = summary.split(/(?<=[.!?])\s+/);
    const match = sentences.find((sentence) =>
      sentence
        .toLowerCase()
        .includes(question.toLowerCase().split(' ')[0] ?? ''),
    );
    return this.truncate(match ?? summary, 160);
  }

  private truncate(text: string, max: number) {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).trimEnd()}…`;
  }
}

function searchTerms(question: string): string[] {
  const stopWords = new Set([
    'about',
    'after',
    'again',
    'anything',
    'decide',
    'decided',
    'does',
    'from',
    'have',
    'meeting',
    'status',
    'that',
    'what',
    'when',
    'where',
    'which',
    'with',
  ]);
  const seen = new Set<string>();
  return question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 2 && !stopWords.has(term))
    .filter((term) => {
      if (seen.has(term)) return false;
      seen.add(term);
      return true;
    })
    .slice(0, 8);
}

function scoreSession(session: SessionContext, terms: string[]) {
  const haystack = [
    session.title,
    session.notes?.summary ?? '',
    ...(session.notes?.keyPoints ?? []),
    ...(session.notes?.actionItems.map((item) => item.text) ?? []),
    ...(session.notes?.decisions ?? []),
    ...session.segments.flatMap((segment) => [
      segment.originalText,
      segment.normalizedText,
      segment.translatedText,
    ]),
  ]
    .join(' ')
    .toLowerCase();

  return terms.reduce((score, term) => {
    const occurrences = haystack.split(term).length - 1;
    return score + occurrences;
  }, 0);
}

function readDecisionTexts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const text = (item as { text?: unknown }).text;
        return typeof text === 'string' ? text : null;
      }
      return null;
    })
    .filter((item): item is string => Boolean(item?.trim()));
}

function formatOffset(startMs: number) {
  const totalSeconds = Math.floor(startMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}
