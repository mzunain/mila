"use client";

import {
  ArrowRight,
  Lightbulb,
  Loader2,
  MessageSquareQuote,
  Sparkles,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { AssistSuggestion, AssistTurn, TranscriptSegment } from "@mila/shared";

// Wait for the transcript to settle before auto-asking, so we don't fire on
// every interim chunk while someone is mid-sentence.
const AUTO_DEBOUNCE_MS = 1200;
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
  onRequest: (turns: AssistTurn[], manual: boolean) => void;
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
  const lastAutoKeyRef = useRef<string | null>(null);

  // Auto-suggest: when coaching is on and the mic is live, ask the server
  // shortly after each new piece of transcript. The server gates on whether the
  // other side actually handed the floor over (a question / hand-off / finished
  // turn), so most ticks are cheap no-ops. Deduped on the latest segment id so
  // a settled transcript doesn't re-fire for the same tail.
  useEffect(() => {
    if (!enabled || !isLive) {
      lastAutoKeyRef.current = null;
      return;
    }
    const key = segments.length ? segments[segments.length - 1]!.id : null;
    if (!key || key === lastAutoKeyRef.current || turns.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      lastAutoKeyRef.current = key;
      onRequest(turns, false);
    }, AUTO_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, isLive, segments, turns, onRequest]);

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
              Private talking points — what to say next
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {enabled && (
            <button
              type="button"
              onClick={() => onRequest(turns, true)}
              disabled={!canRequest}
              className={pillButtonClass}
              title={
                isLive
                  ? "Suggest a reply now"
                  : "Start the mic to get suggestions"
              }
            >
              {pending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <MessageSquareQuote size={15} />
              )}
              <span>{pending ? "Thinking…" : "Suggest a reply"}</span>
            </button>
          )}
          <button
            type="button"
            aria-pressed={enabled}
            onClick={() => onEnabledChange(!enabled)}
            className="text-[var(--accent)] transition hover:text-[var(--foreground)]"
            title={
              enabled ? "Turn off live coaching" : "Turn on live coaching"
            }
          >
            {enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
          </button>
        </div>
      </div>

      {enabled && (
        <div className="mt-3">
          {suggestion ? (
            <SuggestionCard suggestion={suggestion} />
          ) : unavailableReason === "no-model" ? (
            <AssistHint>
              No language model is configured on the server yet, so Mila can&apos;t
              coach you. Connect an LLM provider to enable live coaching.
            </AssistHint>
          ) : pending ? (
            <AssistHint>
              <Loader2 size={14} className="animate-spin" />
              Mila is thinking about your reply…
            </AssistHint>
          ) : isLive ? (
            <AssistHint>
              Listening — Mila will suggest what to say when it&apos;s your turn,
              or press <span className="font-medium">Suggest a reply</span>.
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

// Web capture is mic-only and can't separate voices, so we treat the captured
// conversation as the other party ("them") — the "help me answer what I'm
// hearing" case the copilot is for. The desktop loopback path (B4) provides a
// clean me/them split.
function buildAssistTurns(segments: TranscriptSegment[]): AssistTurn[] {
  return segments
    .slice(-MAX_TURNS)
    .map((segment) => ({
      speaker: "them" as const,
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
