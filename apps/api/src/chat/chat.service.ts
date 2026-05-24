import { Injectable, Logger } from '@nestjs/common';
import type { ChatMessage, ChatRequest } from '@mila/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

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

    const sessions = await this.relevantSessions(userId, request.sessionIds);

    const citations = sessions.map((session) => ({
      sessionId: session.id,
      title: session.title,
      snippet: this.extractSnippet(session.notes?.summary ?? null, question),
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
        return parts.join('\n');
      })
      .join('\n\n');
  }

  private async relevantSessions(
    userId: string,
    sessionIds?: string[],
  ): Promise<SessionContext[]> {
    const rows = await this.prisma.meetingSession.findMany({
      where: {
        userId,
        ...(sessionIds && sessionIds.length > 0
          ? { id: { in: sessionIds } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: sessionIds && sessionIds.length > 0 ? sessionIds.length : 8,
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
      },
    });
    return rows.map((row) => ({
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
            decisions: (row.notes.decisions as string[]) ?? [],
          }
        : null,
    }));
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
