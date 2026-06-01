import { ActionItem, MeetingNotes } from './notes.js';
import type { MeetingSession, MeetingSessionPreview } from './meetings.js';

export type ActionReviewRisk =
  | 'empty'
  | 'clear'
  | 'needs-owners'
  | 'needs-dates'
  | 'overloaded';

export type ActionReviewTone = 'good' | 'warning' | 'neutral';

export interface ActionReviewItem extends ActionItem {
  ownerLabel: string;
  dueLabel: string;
  missingOwner: boolean;
  missingDue: boolean;
  overdue: boolean;
}

export interface ActionReviewMetric {
  id: string;
  label: string;
  value: string;
  tone: ActionReviewTone;
}

export interface MeetingActionReview {
  totalActions: number;
  openActions: number;
  completedActions: number;
  missingOwner: number;
  missingDue: number;
  overdueActions: number;
  keyPointCount: number;
  decisionCount: number;
  riskLevel: ActionReviewRisk;
  headline: string;
  nextBestAction: string;
  topActions: ActionReviewItem[];
  metrics: ActionReviewMetric[];
  followUpDraft: string;
}

export interface MeetingActionInboxItem extends ActionReviewItem {
  sessionId: string;
  sessionTitle: string;
  sessionCreatedAt: string;
  sessionSource: MeetingSession['source'];
}

export interface MeetingActionInbox {
  generatedAt: string;
  totalOpen: number;
  completedTracked: number;
  sessionsWithOpenActions: number;
  missingOwner: number;
  missingDue: number;
  overdueActions: number;
  riskLevel: ActionReviewRisk;
  headline: string;
  nextBestAction: string;
  items: MeetingActionInboxItem[];
}

export function buildMeetingActionReview(
  notes: MeetingNotes,
  now: Date = new Date(),
): MeetingActionReview {
  const reviewedActions = notes.actionItems.map((item) =>
    reviewActionItem(item, now),
  );
  const openItems = reviewedActions.filter((item) => item.status === 'open');
  const completedActions = reviewedActions.length - openItems.length;
  const missingOwner = openItems.filter((item) => item.missingOwner).length;
  const missingDue = openItems.filter((item) => item.missingDue).length;
  const overdueActions = openItems.filter((item) => item.overdue).length;
  const riskLevel = getActionRisk({
    total: reviewedActions.length,
    open: openItems.length,
    missingOwner,
    missingDue,
    overdue: overdueActions,
  });
  const topActions = prioritizeActions(reviewedActions).slice(0, 4);

  return {
    totalActions: reviewedActions.length,
    openActions: openItems.length,
    completedActions,
    missingOwner,
    missingDue,
    overdueActions,
    keyPointCount: notes.keyPoints.length,
    decisionCount: notes.decisions.length,
    riskLevel,
    headline: getActionHeadline(riskLevel, openItems.length),
    nextBestAction: getNextBestAction(riskLevel, {
      open: openItems.length,
      missingOwner,
      missingDue,
      overdue: overdueActions,
    }),
    topActions,
    metrics: buildActionMetrics({
      open: openItems.length,
      completed: completedActions,
      missingOwner,
      missingDue,
      overdue: overdueActions,
    }),
    followUpDraft: buildFollowUpDraft(notes, topActions),
  };
}

export function buildMeetingActionInbox(
  entries: Array<{ session: MeetingSession; notes: MeetingNotes }>,
  now: Date = new Date(),
): MeetingActionInbox {
  const reviewedItems = entries.flatMap(({ session, notes }) =>
    notes.actionItems.map((item) => ({
      ...reviewActionItem(item, now),
      sessionId: session.id,
      sessionTitle: session.title || 'Untitled session',
      sessionCreatedAt: session.createdAt,
      sessionSource: session.source,
    })),
  );
  const openItems = reviewedItems.filter((item) => item.status === 'open');
  const completedTracked = reviewedItems.length - openItems.length;
  const missingOwner = openItems.filter((item) => item.missingOwner).length;
  const missingDue = openItems.filter((item) => item.missingDue).length;
  const overdueActions = openItems.filter((item) => item.overdue).length;
  const riskLevel = getActionRisk({
    total: reviewedItems.length,
    open: openItems.length,
    missingOwner,
    missingDue,
    overdue: overdueActions,
  });
  const sessionsWithOpenActions = new Set(openItems.map((item) => item.sessionId))
    .size;

  return {
    generatedAt: now.toISOString(),
    totalOpen: openItems.length,
    completedTracked,
    sessionsWithOpenActions,
    missingOwner,
    missingDue,
    overdueActions,
    riskLevel,
    headline: getInboxHeadline(riskLevel, openItems.length),
    nextBestAction: getNextBestAction(riskLevel, {
      open: openItems.length,
      missingOwner,
      missingDue,
      overdue: overdueActions,
    }),
    items: prioritizeInboxItems(openItems).slice(0, 12),
  };
}

export function buildMeetingSessionPreview(
  notes: MeetingNotes,
  now: Date = new Date(),
): MeetingSessionPreview {
  const review = buildMeetingActionReview(notes, now);

  return {
    summary: normalizeUsefulSummary(notes.summary),
    keyPoints: notes.keyPoints.slice(0, 3),
    decisionCount: notes.decisions.length,
    actionStats: {
      total: review.totalActions,
      open: review.openActions,
      completed: review.completedActions,
      missingOwner: review.missingOwner,
      missingDue: review.missingDue,
      overdue: review.overdueActions,
      riskLevel: review.riskLevel,
      headline: review.headline,
    },
    updatedAt: notes.updatedAt,
  };
}

function reviewActionItem(item: ActionItem, now: Date): ActionReviewItem {
  const owner = normalizeText(item.owner);
  const due = normalizeText(item.due);

  return {
    ...item,
    ownerLabel: owner ?? 'Unassigned',
    dueLabel: due ?? 'No due date',
    missingOwner: !owner,
    missingDue: !due,
    overdue: item.status === 'open' && due ? isPastDate(due, now) : false,
  };
}

function prioritizeActions(items: ActionReviewItem[]) {
  return [...items].sort((left, right) => {
    const leftScore = getActionPriority(left);
    const rightScore = getActionPriority(right);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return left.text.localeCompare(right.text);
  });
}

function prioritizeInboxItems(items: MeetingActionInboxItem[]) {
  return [...items].sort((left, right) => {
    const leftScore = getActionPriority(left);
    const rightScore = getActionPriority(right);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return (
      new Date(right.sessionCreatedAt).getTime() -
      new Date(left.sessionCreatedAt).getTime()
    );
  });
}

function getActionPriority(item: ActionReviewItem) {
  let score = item.status === 'open' ? 20 : 0;
  if (item.overdue) score += 10;
  if (item.missingOwner) score += 4;
  if (item.missingDue) score += 2;
  return score;
}

function getActionRisk(input: {
  total: number;
  open: number;
  missingOwner: number;
  missingDue: number;
  overdue: number;
}): ActionReviewRisk {
  if (input.total === 0) return 'empty';
  if (input.open >= 7 || input.overdue >= 3) return 'overloaded';
  if (input.missingOwner > 0) return 'needs-owners';
  if (input.missingDue > 0) return 'needs-dates';
  return 'clear';
}

function getInboxHeadline(risk: ActionReviewRisk, openActions: number) {
  if (risk === 'empty') return 'No open follow-ups';
  if (risk === 'clear') {
    return `${openActions} open follow-up${openActions === 1 ? '' : 's'}`;
  }
  return getActionHeadline(risk, openActions);
}

function getActionHeadline(risk: ActionReviewRisk, openActions: number) {
  switch (risk) {
    case 'empty':
      return 'No action items captured yet';
    case 'clear':
      return openActions
        ? `${openActions} clear follow-up${openActions === 1 ? '' : 's'}`
        : 'All follow-ups are complete';
    case 'needs-owners':
      return 'Some follow-ups need owners';
    case 'needs-dates':
      return 'Some follow-ups need dates';
    case 'overloaded':
      return 'Follow-up list needs triage';
  }
}

function getNextBestAction(
  risk: ActionReviewRisk,
  counts: { open: number; missingOwner: number; missingDue: number; overdue: number },
) {
  switch (risk) {
    case 'empty':
      return 'Keep capturing. Mila will promote tasks here when commitments appear.';
    case 'clear':
      return counts.open
        ? 'Send the follow-up draft and keep the open actions moving.'
        : 'No follow-up work is currently blocking this meeting.';
    case 'needs-owners':
      return `Assign owners to ${counts.missingOwner} open action${counts.missingOwner === 1 ? '' : 's'} before sharing notes.`;
    case 'needs-dates':
      return `Add due dates to ${counts.missingDue} open action${counts.missingDue === 1 ? '' : 's'} so reminders can work.`;
    case 'overloaded':
      return counts.overdue
        ? 'Triage overdue items first, then split the rest by owner.'
        : 'Pick the top three actions before sharing notes with the team.';
  }
}

function buildActionMetrics(input: {
  open: number;
  completed: number;
  missingOwner: number;
  missingDue: number;
  overdue: number;
}): ActionReviewMetric[] {
  return [
    {
      id: 'open',
      label: 'Open',
      value: String(input.open),
      tone: input.open > 0 ? 'neutral' : 'good',
    },
    {
      id: 'done',
      label: 'Done',
      value: String(input.completed),
      tone: input.completed > 0 ? 'good' : 'neutral',
    },
    {
      id: 'owners',
      label: 'Need owner',
      value: String(input.missingOwner),
      tone: input.missingOwner > 0 ? 'warning' : 'good',
    },
    {
      id: 'dates',
      label: 'Need date',
      value: String(input.missingDue + input.overdue),
      tone: input.missingDue > 0 || input.overdue > 0 ? 'warning' : 'good',
    },
  ];
}

function buildFollowUpDraft(
  notes: MeetingNotes,
  actions: ActionReviewItem[],
) {
  const lines: string[] = ['Hi team,', '', 'Quick recap from the meeting:'];
  const summary = normalizeText(notes.summary);
  const usefulSummary =
    summary &&
    !/listening for the first useful meeting moments/i.test(summary);

  if (usefulSummary) {
    lines.push(`- ${summary}`);
  } else if (notes.keyPoints.length === 0 && notes.decisions.length === 0) {
    lines.push('- Mila is still building the recap from captured context.');
  }

  for (const point of notes.keyPoints.slice(0, 3)) {
    lines.push(`- ${point}`);
  }

  if (notes.decisions.length > 0) {
    lines.push('', 'Decisions:');
    for (const decision of notes.decisions.slice(0, 3)) {
      lines.push(`- ${decision}`);
    }
  }

  if (actions.length > 0) {
    lines.push('', 'Next actions:');
    for (const action of actions.filter((item) => item.status === 'open').slice(0, 5)) {
      const owner = action.missingOwner ? 'Owner TBD' : action.ownerLabel;
      const due = action.missingDue ? 'date TBD' : action.dueLabel;
      lines.push(`- ${owner}: ${action.text} (${due})`);
    }
  }

  lines.push('', 'Thanks.');
  return lines.join('\n');
}

function normalizeText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeUsefulSummary(value: string) {
  const summary = normalizeText(value);
  if (!summary) return '';
  if (/listening for the first useful meeting moments/i.test(summary)) return '';
  return summary;
}

function isPastDate(value: string, now: Date) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  const dueDate = startOfDay(new Date(timestamp));
  const today = startOfDay(now);
  return dueDate.getTime() < today.getTime();
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
