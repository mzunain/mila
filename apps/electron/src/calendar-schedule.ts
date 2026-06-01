import { spawn } from 'node:child_process';

export interface ScheduledCall {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  calendarName?: string;
  location?: string;
  meetingUrl?: string;
}

interface RawCalendarEvent {
  id?: unknown;
  title?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  calendarName?: unknown;
  location?: unknown;
  url?: unknown;
  notes?: unknown;
  allDay?: unknown;
}

const FIELD_SEPARATOR = '\u001f';
const ROW_SEPARATOR = '\u001e';
const DEFAULT_LOOKAHEAD_HOURS = 36;
const DEFAULT_LIMIT = 6;
const CALENDAR_TIMEOUT_MS = 45_000;
const URL_RE =
  /\b(?:https?:\/\/|zoommtg:\/\/|msteams:\/\/|webex:\/\/)[^\s<>"')]+/i;

export async function readUpcomingScheduledCalls(options: {
  now?: Date;
  lookaheadHours?: number;
  limit?: number;
  includeEventsWithoutMeetingUrl?: boolean;
  visibleCalendars?: Record<string, boolean>;
} = {}): Promise<ScheduledCall[]> {
  if (process.platform !== 'darwin') return [];

  const now = options.now ?? new Date();
  const lookaheadHours = options.lookaheadHours ?? DEFAULT_LOOKAHEAD_HOURS;
  const limit = options.limit ?? DEFAULT_LIMIT;
  await runCommand('open', ['-gj', '-a', 'Calendar'], { timeoutMs: 5_000 });
  const stdout = await runCommand(
    'osascript',
    ['-e', buildCalendarScript()],
    {
      timeoutMs: CALENDAR_TIMEOUT_MS,
      env: {
        MILA_CALENDAR_NOW_MS: String(now.getTime()),
        MILA_CALENDAR_LOOKAHEAD_HOURS: String(lookaheadHours),
      },
    },
  );

  return parseScheduledCalls(stdout, now, limit, {
    includeEventsWithoutMeetingUrl: options.includeEventsWithoutMeetingUrl ?? true,
    visibleCalendars: options.visibleCalendars ?? {},
  });
}

export function parseScheduledCalls(
  rawJson: string,
  now = new Date(),
  limit = DEFAULT_LIMIT,
  options: {
    includeEventsWithoutMeetingUrl?: boolean;
    visibleCalendars?: Record<string, boolean>;
  } = {},
): ScheduledCall[] {
  const raw = parseRawCalendarOutput(rawJson);
  const visibleCalendars = options.visibleCalendars ?? {};
  const includeEventsWithoutMeetingUrl =
    options.includeEventsWithoutMeetingUrl ?? true;

  return raw
    .map((item) => normalizeCalendarEvent(item as RawCalendarEvent))
    .filter((call): call is ScheduledCall => Boolean(call))
    .filter((call) => new Date(call.endAt).getTime() > now.getTime())
    .filter((call) => isCalendarVisible(call.calendarName, visibleCalendars))
    .filter((call) => includeEventsWithoutMeetingUrl || Boolean(call.meetingUrl))
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    )
    .slice(0, limit);
}

function parseRawCalendarOutput(output: string): RawCalendarEvent[] {
  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? (parsed as RawCalendarEvent[]) : [];
  } catch {
    // AppleScript row format fallback.
  }

  return output
    .trim()
    .split(ROW_SEPARATOR)
    .map((row) => row.split(FIELD_SEPARATOR))
    .filter((fields) => fields.length >= 8)
    .map(([id, title, startAt, endAt, calendarName, location, url, notes]) => ({
      id,
      title,
      startAt: parseAppleDateParts(startAt),
      endAt: parseAppleDateParts(endAt),
      calendarName,
      location,
      url,
      notes,
      allDay: false,
    }));
}

export function formatTrayTitle(call: ScheduledCall, now = new Date()) {
  if (isCallInProgress(call, now)) {
    return `${truncate(call.title, 9)} • ${formatTimeUntil(call.endAt, now)} left`;
  }

  return `${truncate(call.title, 9)} • in ${formatTimeUntil(call.startAt, now)}`;
}

export function formatTimeUntil(isoDate: string, now = new Date()) {
  const ms = Math.max(0, new Date(isoDate).getTime() - now.getTime());
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export function formatTimeRange(call: ScheduledCall) {
  const start = new Date(call.startAt);
  const end = new Date(call.endAt);
  return `${formatClock(start)} - ${formatClock(end)}`;
}

export function dayBucketLabel(call: ScheduledCall, now = new Date()) {
  if (isCallInProgress(call, now)) {
    return `Ends in ${formatTimeUntil(call.endAt, now)}`;
  }

  const start = new Date(call.startAt);
  const today = startOfDay(now).getTime();
  const callDay = startOfDay(start).getTime();
  if (callDay === today) return `Starts in ${formatTimeUntil(call.startAt, now)}`;
  if (callDay === today + 24 * 60 * 60 * 1000) return 'Tomorrow';
  return start.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export function isCallInProgress(call: ScheduledCall, now = new Date()) {
  const start = new Date(call.startAt).getTime();
  const end = new Date(call.endAt).getTime();
  const current = now.getTime();

  return start <= current && current < end;
}

function normalizeCalendarEvent(raw: RawCalendarEvent): ScheduledCall | null {
  const title = cleanString(raw.title);
  const startAt = toValidIso(raw.startAt);
  const endAt = toValidIso(raw.endAt);
  if (!title || !startAt || !endAt || raw.allDay === true) return null;

  const location = cleanString(raw.location);
  const url = cleanString(raw.url);
  const notes = cleanString(raw.notes);
  const meetingUrl = extractMeetingUrl([url, location, notes].join('\n'));
  const calendarName = cleanString(raw.calendarName);
  const id = cleanString(raw.id) || `${title}:${startAt}`;

  return {
    id,
    title,
    startAt,
    endAt,
    ...(calendarName ? { calendarName } : {}),
    ...(location ? { location } : {}),
    ...(meetingUrl ? { meetingUrl } : {}),
  };
}

function extractMeetingUrl(text: string) {
  const match = URL_RE.exec(text);
  return match?.[0].replace(/[.,;]+$/, '');
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toValidIso(value: unknown) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseAppleDateParts(value: string | undefined) {
  if (!value) return '';
  const [year, month, day, hour, minute, second] = value
    .split(',')
    .map((part) => Number(part));
  if (
    !year ||
    !month ||
    !day ||
    [hour, minute, second].some((part) => Number.isNaN(part))
  ) {
    return '';
  }
  return new Date(year, month - 1, day, hour, minute, second || 0).toISOString();
}

function formatClock(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function isCalendarVisible(
  calendarName: string | undefined,
  visibleCalendars: Record<string, boolean>,
) {
  if (!calendarName) return true;
  return visibleCalendars[calendarName] ?? true;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function runCommand(
  command: string,
  args: string[],
  options: {
    timeoutMs: number;
    env?: Record<string, string>;
  },
): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...options.env },
    });
    let stdout = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(stdout);
    }, options.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.on('error', () => {
      clearTimeout(timeout);
      resolve('');
    });
    child.on('close', () => {
      clearTimeout(timeout);
      resolve(stdout);
    });
  });
}

function buildCalendarScript() {
  return `
set rowSeparator to ASCII character 30
set fieldSeparator to ASCII character 31
set lookaheadHours to 36
try
  set lookaheadHours to (system attribute "MILA_CALENDAR_LOOKAHEAD_HOURS") as integer
end try

with timeout of 40 seconds
  set nowDate to current date
  set untilDate to nowDate + (lookaheadHours * hours)
  set rows to {}

  tell application "Calendar"
    repeat with calendarItem in calendars
      set calendarName to name of calendarItem as text
      if my shouldReadCalendar(calendarName) then
      try
        with timeout of 4 seconds
        set matchedEvents to (every event of calendarItem whose start date is less than untilDate and end date is greater than nowDate and allday event is false)
        repeat with eventItem in matchedEvents
          set eventId to ""
          set eventTitle to ""
          set eventLocation to ""
          set eventUrl to ""
          set eventNotes to ""
          try
            set eventId to uid of eventItem as text
          end try
          try
            set eventTitle to summary of eventItem as text
          end try
          try
            set eventLocation to location of eventItem as text
          end try
          try
            set eventUrl to url of eventItem as text
          end try
          try
            set eventNotes to description of eventItem as text
          end try

          set startsAt to start date of eventItem
          set endsAt to end date of eventItem
          set rowText to eventId & fieldSeparator & eventTitle & fieldSeparator & my dateParts(startsAt) & fieldSeparator & my dateParts(endsAt) & fieldSeparator & calendarName & fieldSeparator & eventLocation & fieldSeparator & eventUrl & fieldSeparator & eventNotes
          set end of rows to rowText
        end repeat
        end timeout
      end try
      end if
    end repeat
  end tell

  set AppleScript's text item delimiters to rowSeparator
  return rows as text
end timeout

on dateParts(valueDate)
  return ((year of valueDate as integer) as text) & "," & ((month of valueDate as integer) as text) & "," & ((day of valueDate as integer) as text) & "," & ((hours of valueDate as integer) as text) & "," & ((minutes of valueDate as integer) as text) & "," & ((seconds of valueDate as integer) as text)
end dateParts

on shouldReadCalendar(calendarName)
  if calendarName contains "Holidays" then return false
  if calendarName is "Birthdays" then return false
  if calendarName is "Siri Suggestions" then return false
  if calendarName is "Scheduled Reminders" then return false
  return true
end shouldReadCalendar
`;
}
