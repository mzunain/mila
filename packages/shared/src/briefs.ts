import type { MeetingProvider } from './meetings.js';

export type BriefUrgency = 'now' | 'soon' | 'today' | 'later';

export interface ScheduledMeetingBriefInput {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  calendarName?: string;
  location?: string;
  meetingUrl?: string;
  provider?: MeetingProvider;
}

export interface MeetingBriefItem {
  id: string;
  text: string;
}

export interface MeetingBrief {
  meeting: ScheduledMeetingBriefInput;
  headline: string;
  startsInLabel: string;
  urgency: BriefUrgency;
  suggestedTemplateId: string;
  prepChecklist: MeetingBriefItem[];
  agendaQuestions: MeetingBriefItem[];
  riskSignals: MeetingBriefItem[];
  capturePlan: MeetingBriefItem[];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function createMeetingBrief(
  meeting: ScheduledMeetingBriefInput,
  now = new Date(),
): MeetingBrief {
  const start = new Date(meeting.startAt);
  const diffMs = start.getTime() - now.getTime();
  const suggestedTemplateId = inferTemplateId(meeting.title);
  const profile = getBriefProfile(suggestedTemplateId);

  return {
    meeting,
    headline: createHeadline(meeting, diffMs),
    startsInLabel: formatStartsIn(diffMs),
    urgency: classifyUrgency(diffMs),
    suggestedTemplateId,
    prepChecklist: toItems([
      `Set the meeting goal: ${profile.goal}`,
      'Open the previous relevant notes before joining.',
      'Decide what outcome would make this call successful.',
    ]),
    agendaQuestions: toItems(profile.questions),
    riskSignals: toItems([
      'No clear owner is named for a next step.',
      'A decision is implied but nobody confirms it explicitly.',
      'Important context is mentioned without a date, number, or source.',
    ]),
    capturePlan: toItems([
      meeting.meetingUrl ? 'Join from the meeting link in Mila.' : 'Open the meeting app, then start capture.',
      'Start Mila capture before the first decision or action item.',
      'After the call, review action owners before sharing notes.',
    ]),
  };
}

export function createAdHocBrief(now = new Date()): MeetingBrief {
  return createMeetingBrief(
    {
      id: 'adhoc',
      title: 'Ad-hoc meeting',
      startAt: now.toISOString(),
      endAt: new Date(now.getTime() + HOUR).toISOString(),
      provider: 'unknown',
    },
    now,
  );
}

export function formatStartsIn(diffMs: number): string {
  if (diffMs <= 0) return 'starting now';
  const minutes = Math.max(1, Math.round(diffMs / MINUTE));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;

  if (days > 0) {
    return hours > 0 ? `in ${days}d ${hours}h` : `in ${days}d`;
  }
  if (hours > 0) {
    return remainingMinutes > 0 ? `in ${hours}h ${remainingMinutes}m` : `in ${hours}h`;
  }
  return `in ${minutes}m`;
}

export function inferTemplateId(title: string): string {
  const normalized = title.toLowerCase();
  if (/\b(discovery|customer|prospect|demo|sales|deal|buyer)\b/.test(normalized)) {
    return 'sales';
  }
  if (/\b(interview|research|participant|usability)\b/.test(normalized)) {
    return 'user-interview';
  }
  if (/\b(1:1|one[- ]on[- ]one|weekly sync|check[- ]in)\b/.test(normalized)) {
    return 'one-on-one';
  }
  if (/\b(standup|scrum|daily)\b/.test(normalized)) {
    return 'standup';
  }
  return 'general';
}

function classifyUrgency(diffMs: number): BriefUrgency {
  if (diffMs <= 5 * MINUTE) return 'now';
  if (diffMs <= HOUR) return 'soon';
  if (diffMs <= DAY) return 'today';
  return 'later';
}

function createHeadline(meeting: ScheduledMeetingBriefInput, diffMs: number) {
  if (diffMs <= 0) return `${meeting.title} is ready to capture`;
  return `Prepare for ${meeting.title}`;
}

function getBriefProfile(templateId: string) {
  if (templateId === 'sales') {
    return {
      goal: 'confirm pain, decision process, timeline, and next step',
      questions: [
        'What problem is urgent enough to act on now?',
        'Who owns the decision and who needs to be convinced?',
        'What date, budget, or blocker changes the next step?',
      ],
    };
  }
  if (templateId === 'user-interview') {
    return {
      goal: 'extract behavior, workarounds, and surprising evidence',
      questions: [
        'What did they do last time instead of what they say they do?',
        'Where does the current workflow break down?',
        'Which quote should the team hear verbatim?',
      ],
    };
  }
  if (templateId === 'one-on-one') {
    return {
      goal: 'surface wins, blockers, feedback, and commitments',
      questions: [
        'What changed since the last check-in?',
        'What needs manager attention this week?',
        'What commitment should be reviewed next time?',
      ],
    };
  }
  if (templateId === 'standup') {
    return {
      goal: 'capture progress, blockers, owners, and handoffs',
      questions: [
        'What shipped since the last sync?',
        'Which blocker needs escalation today?',
        'Who owns each handoff after the call?',
      ],
    };
  }
  return {
    goal: 'leave with decisions, owners, and dates',
    questions: [
      'What decision needs to be explicit before the call ends?',
      'Which action item needs an owner and due date?',
      'What context would be painful to lose after the meeting?',
    ],
  };
}

function toItems(items: string[]): MeetingBriefItem[] {
  return items.map((text, index) => ({
    id: `item-${index + 1}`,
    text,
  }));
}
