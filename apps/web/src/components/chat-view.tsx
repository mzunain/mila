"use client";

import { ChatMessage, ChatResponse } from "@mila/shared";
import { ArrowUp, Sparkles, Bot, User as UserIcon } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { resolveApiUrl, usePreferences } from "@/lib/preferences";

interface ChatViewProps {
  token: string;
}

const STARTERS = [
  "Summarize what I worked on this week",
  "Which action items are still open?",
  "What decisions came out of my last sales call?",
  "Who promised to follow up with me?",
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
        throw new Error("Chat request failed");
      }

      const data = (await response.json()) as ChatResponse;
      setMessages((current) => [...current, data.message]);
    } catch (chatError) {
      setError(
        chatError instanceof Error
          ? chatError.message
          : "Could not reach Mila chat",
      );
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
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-8 py-8 lg:px-12">
        {messages.length === 0 ? (
          <EmptyState onPick={(prompt) => void sendMessage(prompt)} />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {pending && (
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <Sparkles size={16} className="animate-pulse text-emerald-300" />
                Thinking through your meetings…
              </div>
            )}
            {error && (
              <div className="rounded-md border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-white/10 bg-[#0e1116] px-8 py-5 lg:px-12"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-white/10 bg-[#121922] px-4 py-3 focus-within:border-emerald-400/60">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event as unknown as FormEvent<HTMLFormElement>);
              }
            }}
            placeholder="Ask about your meetings…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm leading-6 text-white outline-none placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="grid h-9 w-9 place-items-center rounded-full bg-emerald-300 text-slate-950 transition hover:bg-emerald-200 disabled:opacity-50"
            aria-label="Send"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 pt-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-emerald-300/30 bg-emerald-300/10 text-emerald-300">
        <Sparkles size={22} />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-white">
          Chat across every meeting
        </h2>
        <p className="text-sm text-slate-400">
          Mila has your transcripts and notes already. Try one of these or ask
          your own question.
        </p>
      </div>
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {STARTERS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className="rounded-xl border border-white/10 bg-[#121922] px-4 py-3 text-left text-sm text-slate-300 transition hover:border-emerald-400/40 hover:bg-[#162130] hover:text-white"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
          <Bot size={14} />
        </div>
      )}
      <div className="max-w-[80%] space-y-3">
        <div
          className={
            isUser
              ? "rounded-2xl rounded-tr-sm bg-emerald-300 px-4 py-3 text-sm leading-6 text-slate-950"
              : "rounded-2xl rounded-tl-sm border border-white/10 bg-[#121922] px-4 py-3 text-sm leading-6 text-slate-100"
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
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300 transition hover:border-emerald-400/30 hover:text-white"
              >
                {citation.title}
              </a>
            ))}
          </div>
        )}
      </div>
      {isUser && (
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/5 text-slate-300">
          <UserIcon size={14} />
        </div>
      )}
    </div>
  );
}
