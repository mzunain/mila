"use client";

import { ChatMessage, ChatResponse } from "@mila/shared";
import {
  AlertCircle,
  ArrowUp,
  Bot,
  Loader2,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { resolveApiUrl, usePreferences } from "@/lib/preferences";

interface ChatViewProps {
  token: string;
}

const STARTERS = [
  "Draft a follow-up from my last meeting",
  "Which action items are still open?",
  "What decisions changed this week?",
  "Find risks and blockers from recent calls",
];

const MEMORY_MODES = [
  {
    title: "Follow-up writer",
    prompt: "Draft a concise follow-up email from my most recent meeting",
  },
  {
    title: "Action audit",
    prompt: "List every open action item grouped by owner",
  },
  {
    title: "Decision trail",
    prompt: "Show the latest decisions and which meeting they came from",
  },
];

export function ChatView({ token }: ChatViewProps) {
  const { preferences } = usePreferences();
  const apiBase = resolveApiUrl(preferences);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;
    setError(null);
    setPending(true);
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput("");

    try {
      const response = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiBase ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: next.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(await readChatError(response));
      }

      const data = (await response.json()) as ChatResponse;
      setMessages((current) => [...current, data.message]);
    } catch (chatError) {
      const message =
        chatError instanceof Error
          ? chatError.message
          : "Could not reach Mila chat";
      if (message.toLowerCase().includes("session expired")) {
        setError(message);
      } else {
        setMessages((current) => [...current, buildChatFallbackMessage(message)]);
      }
    } finally {
      setPending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(input);
  };

  return (
    <div className="flex flex-1 flex-col">
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-6 py-8 lg:px-10"
      >
        {messages.length === 0 ? (
          <EmptyState onPick={(prompt) => void sendMessage(prompt)} />
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {pending && (
              <div className="mila-muted flex items-center gap-3 text-sm">
                <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
                Reading your recent meeting memory...
              </div>
            )}
            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.08] px-4 py-3 text-sm text-amber-50">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-200" />
                <div>
                  <div className="font-semibold">Mila could not answer yet</div>
                  <div className="mt-0.5 text-amber-50/80">{error}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-[var(--border)] bg-[rgba(17,18,20,0.92)] px-6 py-4 backdrop-blur lg:px-10"
      >
        <div className="mila-focus mx-auto max-w-5xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl shadow-black/20 transition">
          <div className="flex h-12 items-center gap-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              aria-label="Ask Mila"
              placeholder="Ask about your meetings..."
              autoComplete="off"
              className="h-10 min-w-0 flex-1 bg-transparent px-3 py-0 text-[15px] leading-10 text-[var(--foreground)] outline-none placeholder:text-[var(--muted-soft)]"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="mila-primary grid h-10 w-10 shrink-0 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="Send"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

async function readChatError(response: Response) {
  if (response.status === 401) {
    return "Your session expired. Sign in again to continue.";
  }

  if (response.status === 404) {
    return "Meeting memory is temporarily unavailable.";
  }

  try {
    const data = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) return data.message.join(" ");
    if (typeof data.message === "string" && data.message.trim()) {
      return data.message;
    }
  } catch {
    // Fall through to status-aware copy.
  }

  return "Meeting memory is temporarily unavailable.";
}

function buildChatFallbackMessage(reason: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    createdAt: new Date().toISOString(),
    content: `Meeting memory is temporarily unavailable. I kept your question in this chat, and I can answer once the API connection is back online. Check the API connection in Preferences if this keeps happening.${reason ? `\n\nStatus: ${reason}` : ""}`,
  };
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pt-8">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {MEMORY_MODES.map((mode) => (
          <button
            key={mode.title}
            type="button"
            onClick={() => onPick(mode.prompt)}
            className="mila-surface-soft rounded-xl border px-4 py-4 text-left transition hover:border-[var(--accent-border)] hover:bg-[var(--surface-raised)]"
          >
            <div className="text-sm font-semibold text-[var(--foreground)]">
              {mode.title}
            </div>
            <div className="mila-muted mt-1 text-xs leading-5">
              {mode.prompt}
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-xl border border-[var(--accent-border)] bg-[var(--accent-faint)] text-[var(--accent)]">
        <Sparkles size={22} />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-[var(--foreground)]">
          Meeting context, ready to query
        </h2>
        <p className="mila-muted text-sm leading-6">
          Pull answers from the most recent summaries, key points, decisions,
          and follow-ups.
        </p>
      </div>
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {STARTERS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className="mila-surface-soft rounded-xl border px-4 py-3 text-left text-sm text-[var(--foreground)] transition hover:border-[var(--accent-border)] hover:bg-[var(--surface-raised)]"
          >
            {prompt}
          </button>
        ))}
      </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--accent-faint)] text-[var(--accent)]">
          <Bot size={14} />
        </div>
      )}
      <div className="max-w-[80%] space-y-3">
        <div
          className={
            isUser
              ? "rounded-2xl rounded-tr-sm bg-[var(--accent)] px-4 py-3 text-sm leading-6 text-[var(--accent-contrast)]"
              : "mila-surface-raised rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-6 text-[var(--foreground)]"
          }
        >
          {message.content.split(/\n+/).map((paragraph, index) => (
            <p key={index} className={index > 0 ? "mt-2" : undefined}>
              {paragraph}
            </p>
          ))}
        </div>
        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.citations.map((citation) => (
              <a
                key={citation.sessionId}
                href={`/app?sessionId=${citation.sessionId}`}
                className="mila-chip rounded-full px-3 py-1 text-xs transition hover:border-[var(--accent-border)] hover:text-[var(--foreground)]"
              >
                {citation.title}
              </a>
            ))}
          </div>
        )}
      </div>
      {isUser && (
        <div className="mila-chip mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full">
          <UserIcon size={14} />
        </div>
      )}
    </div>
  );
}
