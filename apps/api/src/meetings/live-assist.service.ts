import { Injectable, Logger } from '@nestjs/common';
import {
  buildAssistPrompt,
  parseAssistSuggestion,
  shouldRequestAssist,
  type AssistContext,
  type AssistSuggestion,
  type AssistTurn,
} from '@mila/shared';
import { NotesEngineService } from './notes-engine.service';

export interface AssistRequest {
  turns: AssistTurn[];
  context?: AssistContext;
  maxPoints?: number;
  /** Explicit user ask (e.g. a hotkey): skip the "is the tail worth answering" gate. */
  manual?: boolean;
}

export type AssistOutcomeReason =
  | 'ok'
  | 'not-triggered'
  | 'no-model'
  | 'no-suggestion';

export interface AssistOutcome {
  suggestion: AssistSuggestion | null;
  reason: AssistOutcomeReason;
}

// Slightly warmer than notes (0.2) so talking points read naturally rather than
// like boilerplate, while staying grounded in what was actually said. The reply
// is a few short points, so a small token budget keeps latency down.
const ASSIST_TEMPERATURE = 0.4;
const ASSIST_MAX_TOKENS = 500;

/**
 * The live conversation copilot. Given the recent turns of a conversation
 * between "Me" (the user) and "Them" (the other party), it decides whether a
 * suggestion is warranted and, if so, asks the shared LLM stack for talking
 * points. All routing/provider logic lives in NotesEngineService — this service
 * only owns the assist-specific prompt, gating, and parsing, so it stays
 * DB-free and trivial to unit test.
 */
@Injectable()
export class LiveAssistService {
  private readonly logger = new Logger(LiveAssistService.name);

  constructor(private readonly notesEngine: NotesEngineService) {}

  /**
   * Produce talking points for the latest turn, or explain why there are none.
   * Automatic requests are gated by shouldRequestAssist so we only spend a
   * model call when the other party actually handed the floor over; manual
   * requests always run against the model.
   */
  async suggest(request: AssistRequest): Promise<AssistOutcome> {
    const turns = request.turns ?? [];

    if (!request.manual && !shouldRequestAssist(turns)) {
      return { suggestion: null, reason: 'not-triggered' };
    }

    if (!this.notesEngine.hasLlmRoutes()) {
      return { suggestion: null, reason: 'no-model' };
    }

    const { system, user } = buildAssistPrompt({
      turns,
      context: request.context,
      maxPoints: request.maxPoints,
    });

    const raw = await this.notesEngine.completeChat(
      { system, user },
      { temperature: ASSIST_TEMPERATURE, maxTokens: ASSIST_MAX_TOKENS },
    );
    if (!raw) {
      return { suggestion: null, reason: 'no-suggestion' };
    }

    const suggestion = parseAssistSuggestion(raw);
    if (!suggestion) {
      this.logger.warn('Live assist model response was not parseable');
      return { suggestion: null, reason: 'no-suggestion' };
    }

    return { suggestion, reason: 'ok' };
  }
}
