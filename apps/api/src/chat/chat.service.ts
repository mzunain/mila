import { Injectable } from '@nestjs/common';
import type { ChatMessage, ChatRequest } from '@mila/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
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

    const content = this.composeAnswer(question, sessions);

    return {
      id: randomUUID(),
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
      citations,
    };
  }

  private async relevantSessions(userId: string, sessionIds?: string[]) {
    return this.prisma.meetingSession.findMany({
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
  }

  private composeAnswer(
    question: string,
    sessions: {
      id: string;
      title: string;
      notes?: { summary?: string | null } | null;
    }[],
  ) {
    if (!question) {
      return "Ask me anything about your recent meetings — summaries, action items, decisions, or specific people's commitments.";
    }
    if (sessions.length === 0) {
      return `I couldn't find any meetings to answer "${question}" against yet. Record a meeting or upload audio and I'll have something to work with.`;
    }
    const heads = sessions
      .slice(0, 3)
      .map(
        (session) =>
          `• ${session.title}${session.notes?.summary ? ` — ${this.truncate(session.notes.summary, 140)}` : ''}`,
      )
      .join('\n');
    return `Based on your recent meetings, here's what I found about "${question}":\n\n${heads}\n\n(LLM integration is wired client-side; production deployment uses your configured provider in NEXT_PUBLIC_API_BASE_URL.)`;
  }

  private extractSnippet(summary: string | null, question: string) {
    if (!summary) return undefined;
    if (!question) return this.truncate(summary, 140);
    const sentences = summary.split(/(?<=[.!?])\s+/);
    const match = sentences.find((sentence) =>
      sentence.toLowerCase().includes(question.toLowerCase().split(' ')[0] ?? ''),
    );
    return this.truncate(match ?? summary, 160);
  }

  private truncate(text: string, max: number) {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).trimEnd()}…`;
  }
}
