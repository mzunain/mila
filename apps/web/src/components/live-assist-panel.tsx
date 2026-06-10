"use client";

import {
  ArrowRight,
  CheckCircle2,
  History,
  Lightbulb,
  ListTodo,
  Loader2,
  MessageSquareQuote,
  Sparkles,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useMemo } from "react";
import type {
  AssistMode,
  AssistSuggestion,
  AssistTurn,
  TranscriptSegment,
} from "@mila/shared";

// Only the tail of the conversation matters for "what do I say next".
const MAX_TURNS = 12;

const pillButtonClass =
  "mila-secondary inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

export interface LiveAssistPanelProps {
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  segments: TranscriptSegment[];
  isLive: boolean;
  pending: boolean;
  suggestion: AssistSuggestion | null;
  unavailableReason: "no-model" | "no-suggestion" | null;
  onRequest: (turns: AssistTurn[], manual: boolean, mode?: AssistMode) => void;
}

export function LiveAssistPanel({
  enabled,
  onEnabledChange,
  segments,
  isLive,
  pending,
  suggestion,
  unavailableReason,
  onRequest,
}: LiveAssistPanelProps) {
  const turns = useMemo(() => buildAssistTurns(segments), [segments]);

  const canRequest = isLive && !pending && turns.length > 0;

  return (
    <div className="mila-surface-soft border-b border-[var(--border)] px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md border border-[var(--accent-border)] bg-[var(--accent-faint)] text-[var(--accent)]">
            <Sparkles size={15} />
          </span>
          <div>
            <div className="text-sm font-semibold text-[var(--foreground)]">
              Live coaching
            </div>
            <div className="mila-muted text-xs">
              On-demand talking points — what to say next
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={enabled}
            onClick={() => onEnabledChange(!enabled)}
            className="text-[var(--accent)] transition hover:text-[var(--foreground)]"
            title={enabled ? "Turn off live coaching" : "Turn on live coaching"}
          >
            {enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
          </button>
        </div>
      </div>

      {enabled && (
        <div className="mt-3">
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <PromptButton
              label="Suggest reply"
              title="Suggest talking points for what to say next"
              icon={MessageSquareQuote}
              pending={pending}
              disabled={!canRequest}
              onClick={() => onRequest(turns, true, "reply")}
            />
            <PromptButton
              label="Catch up"
              title="Summarize the recent conversation"
              icon={History}
              pending={false}
              disabled={!canRequest}
              onClick={() => onRequest(turns, true, "catch-up")}
            />
            <PromptButton
              label="Actions"
              title="Show action items captured so far"
              icon={ListTodo}
              pending={false}
              disabled={!canRequest}
              onClick={() => onRequest(turns, true, "actions")}
            />
            <PromptButton
              label="Decisions"
              title="Show decisions captured so far"
              icon={CheckCircle2}
              pending={false}
              disabled={!canRequest}
              onClick={() => onRequest(turns, true, "decisions")}
            />
          </div>
          {suggestion ? (
            <SuggestionCard suggestion={suggestion} />
          ) : unavailableReason === "no-model" ? (
            <AssistHint>
              No language model is configured on the server yet, so Mila
              can&apos;t coach you. Connect an LLM provider to enable live
              coaching.
            </AssistHint>
          ) : pending ? (
            <AssistHint>
              <Loader2 size={14} className="animate-spin" />
              Mila is thinking about your reply…
            </AssistHint>
          ) : isLive ? (
            <AssistHint>
              Listening for transcript context. Press{" "}
              <span className="font-medium">Suggest a reply</span> when you want
              coaching.
            </AssistHint>
          ) : (
            <AssistHint>
              Start the mic to let Mila listen in and coach your replies.
            </AssistHint>
          )}
        </div>
      )}
    </div>
  );
}

function PromptButton({
  label,
  title,
  icon: Icon,
  pending,
  disabled,
  onClick,
}: {
  label: string;
  title: string;
  icon: typeof MessageSquareQuote;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={pillButtonClass}
      title={title}
    >
      {pending ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
      <span>{pending ? "Thinking…" : label}</span>
    </button>
  );
}

function SuggestionCard({ suggestion }: { suggestion: AssistSuggestion }) {
  return (
    <div className="mila-surface-raised rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <Lightbulb size={16} className="text-[var(--accent)]" />
          {suggestion.headline}
        </div>
        <ConfidenceChip confidence={suggestion.confidence} />
      </div>

      <ul className="mt-3 space-y-2">
        {suggestion.talkingPoints.map((point, index) => (
          <li
            key={index}
            className="flex items-start gap-2 text-sm leading-6 text-[var(--foreground)]"
          >
            <ArrowRight
              size={15}
              className="mt-1 shrink-0 text-[var(--accent)]"
            />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      {suggestion.followUps.length > 0 && (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <div className="mila-eyebrow mb-1.5">If you need to dig in</div>
          <ul className="space-y-1">
            {suggestion.followUps.map((followUp, index) => (
              <li key={index} className="mila-muted text-xs leading-5">
                {followUp}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ConfidenceChip({
  confidence,
}: {
  confidence: AssistSuggestion["confidence"];
}) {
  const toneClass =
    confidence === "high"
      ? "border-[var(--accent-border)] bg-[var(--accent-faint)] text-[var(--accent)]"
      : confidence === "low"
        ? "border-[rgba(255,155,124,0.24)] bg-[var(--warm-faint)] text-[var(--warm)]"
        : "border-[var(--border)] text-[var(--muted-soft)]";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${toneClass}`}
    >
      {confidence}
    </span>
  );
}

function AssistHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mila-muted flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-xs leading-5">
      {children}
    </div>
  );
}

function buildAssistTurns(segments: TranscriptSegment[]): AssistTurn[] {
  return segments
    .slice(-MAX_TURNS)
    .map((segment) => ({
      speaker:
        segment.speakerId === "self" ? ("me" as const) : ("them" as const),
      text: (
        segment.translatedText ||
        segment.normalizedText ||
        segment.originalText ||
        ""
      ).trim(),
      at: segment.startMs,
    }))
    .filter((turn) => turn.text.length > 0);
}
