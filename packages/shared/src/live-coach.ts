import type { SupportedLanguageCode } from './language.js';
import { getLanguage } from './language.js';
import type { MeetingNotes } from './notes.js';
import type { TranscriptSegment } from './meetings.js';
import { buildMeetingActionReview } from './intelligence.js';

export type LiveCoachState = 'empty' | 'warming-up' | 'coaching' | 'review';
export type LiveCoachTone = 'good' | 'info' | 'warning';
export type LiveCoachCardKind =
  | 'catch-up'
  | 'owner-check'
  | 'date-check'
  | 'decision-check'
  | 'open-question'
  | 'participation'
  | 'language-shift';

export interface LiveCoachMetric {
  id: string;
  label: string;
  value: string;
  tone: LiveCoachTone;
}

export interface LiveCoachCard {
  id: string;
  kind: LiveCoachCardKind;
  tone: LiveCoachTone;
  priority: number;
  title: string;
  detail: string;
  suggestion: string;
  actionLabel: string;
  evidence?: string;
}

export interface LiveMeetingCoach {
  generatedAt: string;
  state: LiveCoachState;
  headline: string;
  nextBestPrompt: string;
  cards: LiveCoachCard[];
  metrics: LiveCoachMetric[];
}

export interface LiveMeetingCoachInput {
  notes: MeetingNotes;
  segments?: TranscriptSegment[];
  isLive?: boolean;
  maxCards?: number;
}

export function buildLiveMeetingCoach(
  input: LiveMeetingCoachInput,
  now: Date = new Date(),
): LiveMeetingCoach {
  const segments = input.segments ?? [];
  const finalSegments = segments.filter((segment) => segment.isFinal);
  const recentSegments = (finalSegments.length ? finalSegments : segments).slice(-12);
  const recentText = recentSegments
    .map((segment) => pickSegmentText(segment))
    .filter(Boolean)
    .join(' ');
  const review = buildMeetingActionReview(input.notes, now);
  const hasUsefulNotes = hasMeetingNotes(input.notes);
  const hasTranscript = normalizeText(recentText) !== null;
  const hasSignal = hasUsefulNotes || hasTranscript;
  const languages = uniqueLanguages(segments);
  const cards: LiveCoachCard[] = [];

  if (hasSignal) {
    const catchUpDetail = getCatchUpDetail(input.notes, recentText);
    if (catchUpDetail) {
      cards.push({
        id: 'catch-up',
        kind: 'catch-up',
        tone: 'good',
        priority: 65,
        title: 'Catch up in 10 seconds',
        detail: catchUpDetail,
        suggestion: input.isLive
          ? 'Use this as the quick read before you speak.'
          : 'Use this as the opening summary for follow-up.',
        actionLabel: 'Review context',
      });
    }

    const missingOwner = review.topActions.find(
      (item) => item.status === 'open' && item.missingOwner,
    );
    if (missingOwner) {
      cards.push({
        id: `owner:${missingOwner.id}`,
        kind: 'owner-check',
        tone: 'warning',
        priority: 95,
        title: 'Close the owner gap',
        detail: missingOwner.text,
        suggestion: 'Ask who owns this before the topic moves on.',
        actionLabel: 'Ask owner',
        evidence: 'No owner captured',
      });
    }

    const missingDue = review.topActions.find(
      (item) => item.status === 'open' && item.missingDue,
    );
    if (missingDue) {
      cards.push({
        id: `date:${missingDue.id}`,
        kind: 'date-check',
        tone: 'warning',
        priority: missingDue.missingOwner ? 82 : 88,
        title: 'Add a due date',
        detail: missingDue.text,
        suggestion: 'Ask for a concrete date so the follow-up is trackable.',
        actionLabel: 'Ask deadline',
        evidence: 'No due date captured',
      });
    }

    if (input.notes.decisions.length === 0 && looksLikeDecisionTalk(recentText, input.notes)) {
      cards.push({
        id: 'decision-check',
        kind: 'decision-check',
        tone: 'warning',
        priority: 86,
        title: 'Decision needs confirmation',
        detail:
          'The conversation sounds like it is comparing options, but no decision is captured yet.',
        suggestion: 'Ask: "Can we confirm the decision and who is accountable?"',
        actionLabel: 'Confirm decision',
        evidence: extractEvidence(recentText, DECISION_PATTERNS),
      });
    }

    const recentQuestion = extractQuestion(recentText);
    if (recentQuestion) {
      cards.push({
        id: `question:${hashText(recentQuestion)}`,
        kind: 'open-question',
        tone: 'info',
        priority: 76,
        title: 'Open question detected',
        detail: recentQuestion,
        suggestion: 'Pause and make sure the answer is captured as a decision or action.',
        actionLabel: 'Resolve question',
      });
    }

    const participation = detectParticipationSkew(recentSegments);
    if (participation) {
      cards.push({
        id: 'participation',
        kind: 'participation',
        tone: 'info',
        priority: 58,
        title: 'One voice is leading',
        detail: participation,
        suggestion: 'Invite another participant to confirm risk, agreement, or next steps.',
        actionLabel: 'Invite input',
      });
    }

    if (languages.length > 1) {
      cards.push({
        id: 'language-shift',
        kind: 'language-shift',
        tone: 'info',
        priority: 52,
        title: 'Multilingual context',
        detail: `Detected ${languages.map((language) => language.nativeLabel).join(', ')} in this meeting.`,
        suggestion: `Keep notes in ${getOutputLanguageLabel(input.notes.outputLanguage)} and preserve exact names, product terms, and decisions.`,
        actionLabel: 'Check wording',
      });
    }
  }

  const sortedCards = cards
    .sort((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority;
      return left.title.localeCompare(right.title);
    })
    .slice(0, input.maxCards ?? 4);
  const state = getCoachState({
    hasSignal,
    hasUsefulNotes,
    segmentCount: segments.length,
    isLive: input.isLive ?? false,
  });
  const topCard = sortedCards[0];

  return {
    generatedAt: now.toISOString(),
    state,
    headline: getCoachHeadline(state, topCard),
    nextBestPrompt:
      topCard?.suggestion ??
      (input.isLive
        ? 'Keep listening. Mila will surface decisions, owner gaps, and unanswered questions.'
        : 'Open or start a meeting to generate live coaching prompts.'),
    cards: sortedCards,
    metrics: [
      {
        id: 'transcript',
        label: 'Transcript',
        value: segments.length ? `${segments.length}` : '0',
        tone: segments.length ? 'good' : 'info',
      },
      {
        id: 'actions',
        label: 'Open actions',
        value: `${review.openActions}`,
        tone: review.openActions ? 'warning' : 'good',
      },
      {
        id: 'decisions',
        label: 'Decisions',
        value: `${input.notes.decisions.length}`,
        tone: input.notes.decisions.length ? 'good' : 'info',
      },
      {
        id: 'languages',
        label: 'Languages',
        value: languages.length ? `${languages.length}` : '0',
        tone: languages.length > 1 ? 'info' : 'good',
      },
    ],
  };
}

const PLACEHOLDER_SUMMARIES = [
  'listening for the first useful meeting moments.',
  'listening for the first useful moment.',
];

const DECISION_PATTERNS = [
  /\bdecid(?:e|ed|ing|es)\b/i,
  /\bagree(?:d|ment)?\b/i,
  /\boption\b/i,
  /\bproposal\b/i,
  /\bapprove\b/i,
  /\bship\b/i,
  /\bgo with\b/i,
  /\bchoose\b/i,
];

const QUESTION_PATTERNS = [
  /\bwho (?:will|owns|can|should)\b/i,
  /\bwhen (?:will|can|should|do we)\b/i,
  /\bwhat (?:is|are|should|do we)\b/i,
  /\bshould we\b/i,
  /\bcan we\b/i,
  /\bdo we\b/i,
  /\bhow do we\b/i,
];

function hasMeetingNotes(notes: MeetingNotes) {
  return (
    isUsefulSummary(notes.summary) ||
    notes.keyPoints.length > 0 ||
    notes.actionItems.length > 0 ||
    notes.decisions.length > 0
  );
}

function isUsefulSummary(summary: string) {
  const normalized = normalizeText(summary);
  if (!normalized) return false;
  return !PLACEHOLDER_SUMMARIES.includes(normalized.toLowerCase());
}

function getCatchUpDetail(notes: MeetingNotes, recentText: string) {
  if (isUsefulSummary(notes.summary)) {
    return truncateText(notes.summary, 190);
  }

  const recent = normalizeText(recentText);
  if (recent) {
    return truncateText(recent, 190);
  }

  if (notes.keyPoints[0]) {
    return truncateText(notes.keyPoints[0], 190);
  }

  return null;
}

function looksLikeDecisionTalk(recentText: string, notes: MeetingNotes) {
  const combined = [
    recentText,
    notes.summary,
    ...notes.keyPoints,
    ...notes.actionItems.map((item) => item.text),
  ].join(' ');

  return DECISION_PATTERNS.some((pattern) => pattern.test(combined));
}

function extractQuestion(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const punctuatedQuestion = normalized
    .split(/(?<=[?.!])\s+/)
    .find((sentence) => sentence.includes('?'));

  if (punctuatedQuestion) {
    return truncateText(punctuatedQuestion.replace(/\?+$/, '?'), 150);
  }

  const patternMatch = QUESTION_PATTERNS.find((pattern) => pattern.test(normalized));
  if (!patternMatch) return null;

  const parts = normalized.split(/(?<=[.!])\s+/);
  const questionLike = parts.find((part) => patternMatch.test(part)) ?? normalized;
  return truncateText(questionLike, 150);
}

function extractEvidence(text: string, patterns: RegExp[]) {
  const normalized = normalizeText(text);
  if (!normalized) return undefined;

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const sentence = sentences.find((item) =>
    patterns.some((pattern) => pattern.test(item)),
  );

  return sentence ? truncateText(sentence, 140) : undefined;
}

function detectParticipationSkew(segments: TranscriptSegment[]) {
  const speakerCounts = new Map<string, number>();
  for (const segment of segments) {
    const speaker = normalizeText(segment.speakerId);
    if (!speaker) continue;
    speakerCounts.set(speaker, (speakerCounts.get(speaker) ?? 0) + 1);
  }

  const total = [...speakerCounts.values()].reduce((sum, count) => sum + count, 0);
  if (speakerCounts.size < 2 || total < 5) return null;

  const [speaker, count] = [...speakerCounts.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0] ?? [null, 0];

  if (!speaker || count / total < 0.72) return null;

  return `${speaker} has ${count} of the last ${total} turns.`;
}

function uniqueLanguages(segments: TranscriptSegment[]) {
  const codes = new Set<SupportedLanguageCode>();
  for (const segment of segments) {
    if (
      segment.detectedLanguage !== 'unknown' &&
      segment.detectedLanguage !== 'mixed'
    ) {
      codes.add(segment.detectedLanguage);
    }
  }
  return [...codes].map((code) => getLanguage(code));
}

function getOutputLanguageLabel(code: SupportedLanguageCode) {
  return getLanguage(code).label;
}

function pickSegmentText(segment: TranscriptSegment) {
  return (
    normalizeText(segment.translatedText) ??
    normalizeText(segment.normalizedText) ??
    normalizeText(segment.originalText) ??
    ''
  );
}

function getCoachState(input: {
  hasSignal: boolean;
  hasUsefulNotes: boolean;
  segmentCount: number;
  isLive: boolean;
}): LiveCoachState {
  if (!input.hasSignal) return 'empty';
  if (input.isLive) return input.segmentCount < 2 && !input.hasUsefulNotes ? 'warming-up' : 'coaching';
  return 'review';
}

function getCoachHeadline(state: LiveCoachState, topCard: LiveCoachCard | undefined) {
  if (topCard?.tone === 'warning') return topCard.title;

  switch (state) {
    case 'empty':
      return 'Live coach is waiting';
    case 'warming-up':
      return 'Live coach is warming up';
    case 'coaching':
      return topCard?.title ?? 'Live coach is watching';
    case 'review':
    default:
      return topCard?.title ?? 'Meeting review is ready';
  }
}

function normalizeText(value: string | undefined) {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}

function truncateText(value: string, maxLength: number) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
