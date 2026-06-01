"use client";

import {
  MeetingBrief,
  MeetingProvider,
  ScheduledMeetingBriefInput,
  createAdHocBrief,
  createMeetingBrief,
} from "@mila/shared";
import {
  CalendarDays,
  ExternalLink,
  Loader2,
  Mic,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type DesktopCalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  calendarName?: string;
  location?: string;
  meetingUrl?: string;
};

type DesktopBridge = {
  getUpcomingCalendarEvents?: () => Promise<DesktopCalendarEvent[]>;
  openExternal?: (url: string) => Promise<unknown>;
};

interface MeetingBriefCardProps {
  disabled?: boolean;
  onStartCapture: (brief: MeetingBrief) => void | Promise<void>;
}

export function MeetingBriefCard({
  disabled = false,
  onStartCapture,
}: MeetingBriefCardProps) {
  const [calendarStatus, setCalendarStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [events, setEvents] = useState<DesktopCalendarEvent[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [starting, setStarting] = useState(false);

  const refreshCalendar = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.getUpcomingCalendarEvents) {
      setCalendarStatus("unavailable");
      setEvents([]);
      return;
    }

    setCalendarStatus("loading");
    try {
      const nextEvents = await bridge.getUpcomingCalendarEvents();
      setEvents(nextEvents);
      setCalendarStatus("ready");
    } catch {
      setEvents([]);
      setCalendarStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshCalendar(), 0);
    const clock = window.setInterval(() => setNow(new Date()), 60_000);
    const calendar = window.setInterval(() => void refreshCalendar(), 180_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(clock);
      window.clearInterval(calendar);
    };
  }, [refreshCalendar]);

  const nextMeeting = useMemo(
    () => normalizeNextMeeting(events, now),
    [events, now],
  );
  const brief = useMemo(
    () =>
      nextMeeting ? createMeetingBrief(nextMeeting, now) : createAdHocBrief(now),
    [nextMeeting, now],
  );
  const hasScheduledMeeting = brief.meeting.id !== "adhoc";
  const startDisabled = disabled || starting;

  const startCapture = async () => {
    if (startDisabled) return;
    setStarting(true);
    try {
      await onStartCapture(brief);
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-faint)] p-3 shadow-[0_18px_45px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
            <Sparkles size={14} />
            Mila Brief
          </div>
          <h2 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-white">
            {brief.headline}
          </h2>
        </div>
        <span className={urgencyClass(brief.urgency)}>
          <Timer size={13} />
          {brief.startsInLabel}
        </span>
      </div>

      <div className="mila-muted mt-3 flex items-center gap-2 text-xs">
        {calendarStatus === "loading" ? (
          <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
        ) : (
          <CalendarDays size={14} className="text-[var(--muted-soft)]" />
        )}
        <span className="min-w-0 leading-4">
          {hasScheduledMeeting
            ? formatMeetingMeta(brief.meeting)
            : calendarStatus === "unavailable"
              ? "Ad-hoc brief while calendar access is unavailable"
              : "No upcoming meeting found"}
        </span>
      </div>

      <div className="mt-3 rounded-lg border border-[var(--border)] bg-black/15 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
          <ShieldCheck size={14} className="text-[var(--accent)]" />
          Prep focus
        </div>
        <ul className="mt-2 space-y-2">
          {brief.agendaQuestions.slice(0, 2).map((item) => (
            <li
              key={item.id}
              className="mila-muted flex gap-2 text-xs leading-5"
            >
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <button
          type="button"
          onClick={startCapture}
          disabled={startDisabled}
          className="mila-primary inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-[var(--surface-raised)] disabled:text-[var(--muted-soft)]"
        >
          {starting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Mic size={16} />
          )}
          {starting ? "Starting" : "Start capture"}
        </button>
        {brief.meeting.meetingUrl ? (
          <button
            type="button"
            onClick={() => void openMeetingUrl(brief.meeting.meetingUrl)}
            className="mila-secondary inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-sm transition"
            title="Open meeting link"
          >
            <ExternalLink size={16} />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function normalizeNextMeeting(
  events: DesktopCalendarEvent[],
  now: Date,
): ScheduledMeetingBriefInput | null {
  const nowMs = now.getTime();
  const nextEvent = events
    .filter((event) => new Date(event.startAt).getTime() > nowMs)
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    )[0];

  if (!nextEvent) return null;

  return {
    id: nextEvent.id,
    title: nextEvent.title,
    startAt: nextEvent.startAt,
    endAt: nextEvent.endAt,
    calendarName: nextEvent.calendarName,
    location: nextEvent.location,
    meetingUrl: nextEvent.meetingUrl,
    provider: detectProvider(nextEvent.meetingUrl, nextEvent.title),
  };
}

function formatMeetingMeta(meeting: ScheduledMeetingBriefInput) {
  const start = new Date(meeting.startAt);
  const end = new Date(meeting.endAt);
  const day = isToday(start) ? "Today" : formatDay(start);
  const time = `${formatClock(start)}-${formatClock(end)}`;
  return [day, time, meeting.calendarName].filter(Boolean).join(" · ");
}

function formatClock(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDay(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isToday(date: Date) {
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function urgencyClass(urgency: MeetingBrief["urgency"]) {
  const base =
    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium";
  if (urgency === "now") {
    return `${base} border-[var(--accent-border)] bg-[var(--accent-faint)] text-[var(--accent)]`;
  }
  if (urgency === "soon") {
    return `${base} border-[rgba(255,155,124,0.35)] bg-[var(--warm-faint)] text-[var(--warm)]`;
  }
  return `${base} border-[var(--border)] bg-white/[0.04] text-[var(--muted)]`;
}

function detectProvider(
  meetingUrl: string | undefined,
  title: string,
): MeetingProvider {
  const normalized = `${meetingUrl ?? ""} ${title}`.toLowerCase();
  if (normalized.includes("meet.google.com") || normalized.includes("google meet")) {
    return "google-meet";
  }
  if (normalized.includes("zoom")) return "zoom";
  if (normalized.includes("teams.microsoft.com") || normalized.includes("teams")) {
    return "microsoft-teams";
  }
  if (normalized.includes("slack")) return "slack-huddle";
  if (normalized.includes("whatsapp")) return "whatsapp-web";
  return "unknown";
}

async function openMeetingUrl(url: string | undefined) {
  if (!url) return;
  const bridge = getDesktopBridge();
  if (bridge?.openExternal) {
    await bridge.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function getDesktopBridge() {
  return (window as Window & { mila?: DesktopBridge }).mila;
}
