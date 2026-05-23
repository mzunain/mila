import type { MeetingSession } from "@mila/shared";
import { getLanguage } from "@mila/shared";
import { ArrowRight, Languages, Mic, Plus, Radio } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SessionsShell } from "@/components/sessions-shell";
import { apiFetch } from "@/lib/api-server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/app/sessions");

  const response = await apiFetch("/api/sessions", { token: session.token });
  const sessions = response.ok
    ? ((await response.json()) as MeetingSession[])
    : [];

  return (
    <SessionsShell user={session.user}>
      <div className="px-8 py-10 lg:px-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              History
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-white">Sessions</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Every meeting Mila has captured for you. Pick one to resume live
              capture or revisit the transcript and notes.
            </p>
          </div>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 rounded-md bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
          >
            <Plus size={16} />
            New session
          </Link>
        </div>

        {sessions.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sessions.map((item) => (
              <SessionCard key={item.id} session={item} />
            ))}
          </div>
        )}
      </div>
    </SessionsShell>
  );
}

function SessionCard({ session }: { session: MeetingSession }) {
  const language = getLanguage(session.outputLanguage);
  const createdAt = new Date(session.createdAt);
  const endedAt = session.endedAt ? new Date(session.endedAt) : null;
  const status = session.status;
  const statusStyle =
    status === "live"
      ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/30"
      : status === "completed"
        ? "bg-slate-400/10 text-slate-300 ring-1 ring-slate-400/20"
        : status === "processing"
          ? "bg-amber-300/15 text-amber-200 ring-1 ring-amber-300/30"
          : status === "failed"
            ? "bg-red-400/15 text-red-200 ring-1 ring-red-400/30"
            : "bg-white/[0.04] text-slate-300 ring-1 ring-white/10";

  return (
    <Link
      href={`/app?sessionId=${encodeURIComponent(session.id)}`}
      className="group flex h-full flex-col justify-between rounded-xl border border-white/10 bg-[#121922] p-5 transition hover:-translate-y-0.5 hover:border-emerald-400/30 hover:bg-[#141d28]"
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${statusStyle}`}
          >
            {status === "live" && <Radio size={11} />}
            {status}
          </span>
          <span className="text-xs text-slate-500" suppressHydrationWarning>
            {formatRelative(createdAt)}
          </span>
        </div>
        <h3 className="mt-3 line-clamp-2 text-base font-semibold text-white">
          {session.title || "Untitled session"}
        </h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1 rounded bg-white/[0.04] px-2 py-1">
            <Languages size={11} />
            {language.nativeLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-white/[0.04] px-2 py-1">
            <Mic size={11} />
            {formatSource(session.source)}
          </span>
          {endedAt && (
            <span className="rounded bg-white/[0.04] px-2 py-1">
              {formatDuration(createdAt, endedAt)}
            </span>
          )}
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
        <span className="font-mono">{session.id.slice(0, 8)}</span>
        <span className="inline-flex items-center gap-1 text-emerald-300 opacity-0 transition group-hover:opacity-100">
          Open <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-8 py-16 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-400/10 text-emerald-300">
        <Mic size={22} />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-white">
        Nothing here yet.
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
        Start a meeting from the workspace and Mila will keep an organised
        history of transcripts, summaries, and action items in one place.
      </p>
      <Link
        href="/app"
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
      >
        <Plus size={16} />
        Start your first session
      </Link>
    </div>
  );
}

function formatSource(source: MeetingSession["source"]) {
  switch (source) {
    case "manual":
      return "Manual";
    case "auto-browser":
      return "Auto · browser";
    case "auto-calendar":
      return "Auto · calendar";
    case "auto-desktop":
      return "Auto · desktop";
    case "upload":
      return "Upload";
    case "mock":
      return "Demo";
  }
}

function formatRelative(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function formatDuration(start: Date, end: Date) {
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
