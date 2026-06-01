import type { MeetingSession, MeetingSessionListItem } from "@mila/shared";
import { getLanguage } from "@mila/shared";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Languages,
  ListChecks,
  Mic,
  Plus,
  Radio,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SessionsShell } from "@/components/sessions-shell";
import { apiFetch } from "@/lib/api-server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/app/sessions");

  const response = await apiFetch("/api/sessions", { token: session.token });
  const sessions = response.ok
    ? ((await response.json()) as MeetingSessionListItem[])
    : [];
  const insight = buildSessionInsight(sessions);

  return (
    <SessionsShell user={session.user}>
      <div className="px-8 py-10 lg:px-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mila-eyebrow">
              History
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-[var(--foreground)]">
              Sessions
            </h1>
            <p className="mila-muted mt-2 max-w-xl text-sm">
              Every meeting Mila has captured for you. Pick one to resume live
              capture or revisit the transcript and notes.
            </p>
          </div>
          <Link
            href="/app"
            className="mila-primary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition"
          >
            <Plus size={16} />
            New session
          </Link>
        </div>

        {sessions.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <SessionOverview insight={insight} />
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sessions.map((item) => (
                <SessionCard key={item.id} session={item} />
              ))}
            </div>
          </>
        )}
      </div>
    </SessionsShell>
  );
}

function SessionOverview({
  insight,
}: {
  insight: ReturnType<typeof buildSessionInsight>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <OverviewMetric
        icon={<ListChecks size={16} />}
        label="Review queue"
        value={String(insight.reviewReady)}
        detail={`${insight.openActions} open action${insight.openActions === 1 ? "" : "s"}`}
      />
      <OverviewMetric
        icon={<Radio size={16} />}
        label="Live now"
        value={String(insight.live)}
        detail="active captures"
      />
      <OverviewMetric
        icon={<Zap size={16} />}
        label="Auto-captured"
        value={String(insight.autoCaptured)}
        detail="detected meetings"
      />
      <OverviewMetric
        icon={<Clock3 size={16} />}
        label="Last capture"
        value={insight.lastCaptureLabel}
        detail="most recent"
      />
    </div>
  );
}

function OverviewMetric({
  detail,
  icon,
  label,
  value,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="mila-surface-soft rounded-xl border p-4">
      <div className="mila-muted flex items-center gap-2 text-xs font-medium">
        <span className="text-[var(--accent)]">{icon}</span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold text-[var(--foreground)]">
        {value}
      </div>
      <div className="mila-muted mt-1 text-xs">{detail}</div>
    </div>
  );
}

function SessionCard({ session }: { session: MeetingSessionListItem }) {
  const language = getLanguage(session.outputLanguage);
  const createdAt = new Date(session.createdAt);
  const endedAt = session.endedAt ? new Date(session.endedAt) : null;
  const status = session.status;
  const preview = session.notesPreview;
  const summarySnippet =
    preview?.summary || preview?.keyPoints[0] || getSessionFallbackCopy(session);
  const statusStyle =
    status === "live"
      ? "bg-[var(--accent-faint)] text-[var(--accent)] ring-1 ring-[var(--accent-border)]"
      : status === "completed"
        ? "bg-white/[0.055] text-[var(--muted)] ring-1 ring-[var(--border)]"
        : status === "processing"
          ? "bg-[var(--warm-faint)] text-[var(--warm)] ring-1 ring-[rgba(255,155,124,0.28)]"
          : status === "failed"
            ? "bg-red-400/15 text-red-200 ring-1 ring-red-400/30"
            : "bg-white/[0.04] text-[var(--muted)] ring-1 ring-[var(--border)]";

  return (
    <Link
      href={`/app?sessionId=${encodeURIComponent(session.id)}`}
      className="mila-surface-raised group flex h-full flex-col justify-between rounded-xl border p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent-border)]"
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${statusStyle}`}
          >
            {status === "live" && <Radio size={11} />}
            {status}
          </span>
          <span className="mila-muted text-xs" suppressHydrationWarning>
            {formatRelative(createdAt)}
          </span>
        </div>
        <h3 className="mt-3 line-clamp-2 text-base font-semibold text-[var(--foreground)]">
          {session.title || "Untitled session"}
        </h3>
        <div className="mila-muted mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="mila-chip inline-flex items-center gap-1 rounded px-2 py-1">
            <Languages size={11} />
            {language.nativeLabel}
          </span>
          <span className="mila-chip inline-flex items-center gap-1 rounded px-2 py-1">
            <Mic size={11} />
            {formatSource(session.source)}
          </span>
          {endedAt && (
            <span className="mila-chip rounded px-2 py-1">
              {formatDuration(createdAt, endedAt)}
            </span>
          )}
        </div>
        <p className="mila-muted mt-4 line-clamp-2 min-h-[40px] text-sm leading-5">
          {summarySnippet}
        </p>
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-black/10 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--foreground)]">
              {session.status === "completed" ? (
                <CheckCircle2 size={12} className="text-[var(--accent)]" />
              ) : session.status === "scheduled" ? (
                <CalendarClock size={12} className="text-[var(--accent)]" />
              ) : (
                <Radio size={12} className="text-[var(--accent)]" />
              )}
              {formatSessionOutcome(session)}
            </span>
            {session.autoStarted || session.externalMeeting ? (
              <span className="mila-chip rounded px-2 py-0.5">
                {session.externalMeeting
                  ? formatProvider(session.externalMeeting.provider)
                  : "Auto"}
              </span>
            ) : null}
          </div>
          {preview ? (
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3">
              <TinyStat label="Open" value={String(preview.actionStats.open)} />
              <TinyStat label="Decisions" value={String(preview.decisionCount)} />
              <TinyStat
                label="Risk"
                value={formatRisk(preview.actionStats.riskLevel)}
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className="mila-muted mt-5 flex items-center justify-between text-xs">
        <span className="font-mono">{session.id.slice(0, 8)}</span>
        <span className="inline-flex items-center gap-1 text-[var(--accent)] opacity-0 transition group-hover:opacity-100">
          Open <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}

function TinyStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-[var(--foreground)]">
        {value}
      </div>
      <div className="mila-muted mt-0.5 text-[10px] uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

function buildSessionInsight(sessions: MeetingSessionListItem[]) {
  const live = sessions.filter((session) => session.status === "live").length;
  const reviewReady = sessions.filter(
    (session) => session.status === "completed",
  ).length;
  const openActions = sessions.reduce(
    (sum, session) => sum + (session.notesPreview?.actionStats.open ?? 0),
    0,
  );
  const autoCaptured = sessions.filter(
    (session) => session.autoStarted || session.externalMeeting,
  ).length;
  const latest = [...sessions].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )[0];

  return {
    live,
    reviewReady,
    openActions,
    autoCaptured,
    lastCaptureLabel: latest ? formatRelative(new Date(latest.createdAt)) : "none",
  };
}

function EmptyState() {
  return (
    <div className="mila-surface-soft rounded-xl border border-dashed px-8 py-16 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-faint)] text-[var(--accent)]">
        <Mic size={22} />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-[var(--foreground)]">
        Nothing here yet.
      </h2>
      <p className="mila-muted mx-auto mt-2 max-w-md text-sm leading-6">
        Start a meeting from the workspace and Mila will keep an organised
        history of transcripts, summaries, and action items in one place.
      </p>
      <Link
        href="/app"
        className="mila-primary mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition"
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

function formatSessionOutcome(session: MeetingSessionListItem) {
  if (session.status === "completed" && session.notesPreview) {
    return session.notesPreview.actionStats.headline;
  }

  switch (session.status) {
    case "live":
      return "Capturing now";
    case "processing":
      return "Notes being finalized";
    case "completed":
      return "Ready for follow-up";
    case "failed":
      return "Needs retry";
    case "scheduled":
      return "Prep brief ready";
  }
}

function getSessionFallbackCopy(session: MeetingSessionListItem) {
  switch (session.status) {
    case "live":
      return "Mila is capturing this conversation now.";
    case "processing":
      return "Notes are being finalized from the captured transcript.";
    case "completed":
      return "Open the session to review transcript, notes, and follow-ups.";
    case "failed":
      return "Capture ended with an issue. Open the session to inspect recovery options.";
    case "scheduled":
      return "Prep context is ready before the meeting starts.";
  }
}

function formatRisk(
  risk: NonNullable<MeetingSessionListItem["notesPreview"]>["actionStats"]["riskLevel"],
) {
  switch (risk) {
    case "empty":
      return "None";
    case "clear":
      return "Clear";
    case "needs-owners":
      return "Owners";
    case "needs-dates":
      return "Dates";
    case "overloaded":
      return "High";
  }
}

function formatProvider(provider: NonNullable<MeetingSession["externalMeeting"]>["provider"]) {
  const labels: Record<
    NonNullable<MeetingSession["externalMeeting"]>["provider"],
    string
  > = {
    "google-meet": "Meet",
    zoom: "Zoom",
    "microsoft-teams": "Teams",
    "slack-huddle": "Slack",
    "whatsapp-web": "WhatsApp",
    unknown: "Detected",
  };

  return labels[provider];
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
