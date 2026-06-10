// Pure engine for the live conversation copilot. It listens to a running
// conversation — "me" (the user we help) and "them" (the other party, captured
// on a separate channel) — and produces "what should I say next" talking
// points. No network or LLM here: this builds the prompt, decides WHEN a
// suggestion is worth asking the model for, and parses the model's JSON back
// into a typed suggestion. The API layer (LiveAssistService) wires it to a
// model and reuses the same LLM routing as notes. Kept dependency-free so it
// runs unchanged under `node --test`.

export type AssistSpeaker = 'me' | 'them';
export type AssistMode = 'reply' | 'catch-up' | 'actions' | 'decisions';

export interface AssistTurn {
  speaker: AssistSpeaker;
  text: string;
  /** Optional epoch ms; only used for recency/ordering when provided. */
  at?: number;
}

export type AssistConfidence = 'low' | 'medium' | 'high';

/** Talking-points suggestion: concise points the user can say out loud next. */
export interface AssistSuggestion {
  headline: string;
  talkingPoints: string[];
  followUps: string[];
  confidence: AssistConfidence;
  generatedAt: string;
}

export type AssistTriggerReason = 'question' | 'handoff' | 'turn-complete';

export interface AssistTrigger {
  reason: AssistTriggerReason;
  /** The "them" text the suggestion should respond to. */
  prompt: string;
}

/** Who the user is talking to + topic, to bias the suggestion. All optional. */
export interface AssistContext {
  /** e.g. "interviewer", "team lead", "stakeholder". */
  audience?: string;
  /** Short situation/role context, e.g. "Senior backend role, system design". */
  situation?: string;
  /** Preferred reply language label, e.g. "English". */
  language?: string;
}

export interface BuildAssistPromptInput {
  turns: AssistTurn[];
  context?: AssistContext;
  /** Cap on talking points requested; default 4, clamped to 1..6. */
  maxPoints?: number;
}

export interface AssistPromptMessages {
  system: string;
  user: string;
}

export const ASSIST_DEFAULTS = {
  maxPoints: 4,
  /** Recent turns kept in the prompt window. */
  maxTurns: 12,
  /** Char budget for the formatted transcript. */
  maxTranscriptChars: 4000,
  /** Min words in a "them" turn before "they finished, your turn" fires. */
  minTurnCompleteWords: 12,
} as const;

// Interrogative cues, checked against the last sentence so a dropped "?" from
// the ASR still reads as a question ("How would you scale this").
const QUESTION_PATTERNS = [
  /^(what|why|how|when|where|which|who|whose|can|could|would|should|do|does|did|is|are|was|were|have|has|tell me|walk me)\b/i,
  /\b(what|how|why|when) (do|would|did|are|is|should) you\b/i,
  /\b(would|could|can) you\b/i,
  /\bdo you (have|think|know|see|want)\b/i,
];

// Explicit "your turn" hand-offs that may not be phrased as questions.
const HANDOFF_PATTERNS = [
  /\byour (thoughts|take|opinion|view|perspective|experience|approach)\b/i,
  /\bwhat do you think\b/i,
  /\b(tell|walk) (me|us) (through|about)\b/i,
  /\b(over|back) to you\b/i,
  /\bgo ahead\b/i,
  /\b(explain|describe) (how|why|your|the)\b/i,
];

const ACTION_PATTERN =
  /\b(action|follow up|send|share|prepare|schedule|review|todo|to do|need to|please|will|assign|owner)\b/i;
const DECISION_PATTERN =
  /\b(decided|decision|approved|agreed|settled|go with|we will|we are going to|chosen|greenlit)\b/i;

/**
 * Decide whether the tail of the conversation is worth asking the model to
 * respond to. Fires only when the latest meaningful turn is from "them" (so
 * "me" hasn't answered yet). Returns the matched reason + focal text, or null.
 *
 * This is intentionally stateless: de-duping repeat triggers on the same turn
 * is the caller's job (LiveAssistService tracks the last-handled turn).
 */
export function shouldRequestAssist(
  turns: AssistTurn[],
  opts: { minTurnCompleteWords?: number } = {},
): AssistTrigger | null {
  const last = lastMeaningfulTurn(turns);
  if (!last || last.speaker !== 'them') return null;

  const text = normalize(last.text);
  if (!text) return null;

  const tail = lastSentence(text);
  if (endsWithQuestion(text) || QUESTION_PATTERNS.some((p) => p.test(tail))) {
    return { reason: 'question', prompt: text };
  }
  if (HANDOFF_PATTERNS.some((p) => p.test(text))) {
    return { reason: 'handoff', prompt: text };
  }

  const minWords = opts.minTurnCompleteWords ?? ASSIST_DEFAULTS.minTurnCompleteWords;
  if (wordCount(text) >= minWords && endsSentence(text)) {
    return { reason: 'turn-complete', prompt: text };
  }
  return null;
}

export function buildQuickAssistSuggestion(
  mode: Exclude<AssistMode, 'reply'>,
  turns: AssistTurn[],
  now: Date = new Date(),
): AssistSuggestion | null {
  const recent = turns
    .map((turn) => ({ speaker: turn.speaker, text: normalize(turn.text) }))
    .filter((turn): turn is { speaker: AssistSpeaker; text: string } =>
      Boolean(turn.text),
    )
    .slice(-12);

  if (!recent.length) return null;

  if (mode === 'catch-up') {
    return {
      headline: 'Catch-up',
      talkingPoints: recent.slice(-5).map((turn) => {
        const speaker = turn.speaker === 'me' ? 'You' : 'They';
        return `${speaker}: ${truncate(turn.text, 140)}`;
      }),
      followUps: [],
      confidence: 'medium',
      generatedAt: now.toISOString(),
    };
  }

  const matches = recent.filter((turn) =>
    mode === 'actions'
      ? ACTION_PATTERN.test(turn.text)
      : DECISION_PATTERN.test(turn.text),
  );

  if (!matches.length) {
    return {
      headline: mode === 'actions' ? 'No clear actions yet' : 'No decisions yet',
      talkingPoints: [
        mode === 'actions'
          ? 'No explicit owner, task, or follow-up has been captured yet.'
          : 'No explicit decision has been captured yet.',
      ],
      followUps: [],
      confidence: 'low',
      generatedAt: now.toISOString(),
    };
  }

  return {
    headline: mode === 'actions' ? 'Actions so far' : 'Decisions so far',
    talkingPoints: uniqueStrings(
      matches.map((turn) => truncate(turn.text, 160)),
    ).slice(0, 6),
    followUps: [],
    confidence: 'medium',
    generatedAt: now.toISOString(),
  };
}

/** Render turns as "Me: …" / "Them: …" lines, recency-capped and char-budgeted. */
export function formatAssistTranscript(
  turns: AssistTurn[],
  opts: { maxTurns?: number; maxChars?: number } = {},
): string {
  const maxTurns = opts.maxTurns ?? ASSIST_DEFAULTS.maxTurns;
  const maxChars = opts.maxChars ?? ASSIST_DEFAULTS.maxTranscriptChars;

  const lines = turns
    .map((turn) => ({ speaker: turn.speaker, text: normalize(turn.text) }))
    .filter((turn): turn is { speaker: AssistSpeaker; text: string } =>
      Boolean(turn.text),
    )
    .slice(-maxTurns)
    .map((turn) => `${turn.speaker === 'me' ? 'Me' : 'Them'}: ${turn.text}`);

  const transcript = lines.join('\n');
  if (transcript.length <= maxChars) return transcript;
  return transcript.slice(transcript.length - maxChars);
}

/** Build the system + user messages that ask a model for talking points. */
export function buildAssistPrompt(
  input: BuildAssistPromptInput,
): AssistPromptMessages {
  const maxPoints = clampInt(input.maxPoints ?? ASSIST_DEFAULTS.maxPoints, 1, 6);
  const transcript = formatAssistTranscript(input.turns);
  const audience = normalize(input.context?.audience);
  const situation = normalize(input.context?.situation);
  const language =
    normalize(input.context?.language) ?? 'the same language they are speaking';

  const system = [
    'You are Mila, a real-time conversation copilot speaking privately into the ear of "Me".',
    'You hear a live conversation between "Me" (the user you help) and "Them" (the other party).',
    `Your job: tell Me what to say next — concise, confident talking points Me can deliver out loud, in ${language}.`,
    'Be specific and substantive: if Them asked something technical, give the actual answer Me should say, not vague advice like "explain clearly".',
    'Do not write a script to read word-for-word; give crisp points Me can speak naturally. Never reveal that suggestions are AI-generated.',
    'Return ONLY a JSON object with this exact shape (no markdown, no commentary):',
    '{',
    '  "headline": string,            // <=10 words: what Them is really asking / the moment',
    `  "talkingPoints": string[],     // ${maxPoints} or fewer concise points Me can say, most important first`,
    '  "followUps": string[],         // optional clarifying questions Me could ask back; [] if none',
    '  "confidence": "low" | "medium" | "high"',
    '}',
  ].join('\n');

  const userLines: string[] = [];
  if (audience) userLines.push(`Me is talking to: ${audience}.`);
  if (situation) userLines.push(`Context: ${situation}.`);
  userLines.push('Conversation so far (most recent last):');
  userLines.push(transcript || '(no conversation captured yet)');
  userLines.push('');
  userLines.push('Suggest what Me should say next. Return only the JSON object.');

  return { system, user: userLines.join('\n') };
}

/** Parse a model response (optionally fenced) into a typed suggestion, or null. */
export function parseAssistSuggestion(
  raw: string,
  now: Date = new Date(),
): AssistSuggestion | null {
  const json = extractJsonObject(raw);
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const talkingPoints = readStringList(parsed.talkingPoints).slice(0, 6);
  if (talkingPoints.length === 0) return null; // nothing useful to say

  const headline = readText(parsed.headline) ?? talkingPoints[0];
  const followUps = readStringList(parsed.followUps).slice(0, 4);

  return {
    headline: truncate(headline, 120),
    talkingPoints,
    followUps,
    confidence: readConfidence(parsed.confidence),
    generatedAt: now.toISOString(),
  };
}

const PLACEHOLDER_TOKENS = new Set([
  'optional',
  'tbd',
  'tba',
  'n/a',
  'na',
  'none',
  'null',
  'unknown',
  'unspecified',
  'pending',
  '-',
  '—',
  '…',
  '...',
]);

function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_TOKENS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readText(item))
    .filter((item): item is string => Boolean(item));
}

function readConfidence(value: unknown): AssistConfidence {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'medium';
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function lastMeaningfulTurn(turns: AssistTurn[]): AssistTurn | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn && normalize(turn.text)) return turn;
  }
  return null;
}

function lastSentence(text: string): string {
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : text;
}

function endsWithQuestion(text: string): boolean {
  return /\?\s*$/.test(text);
}

function endsSentence(text: string): boolean {
  return /[.!?]["')\]]?\s*$/.test(text);
}

function wordCount(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

function normalize(value: string | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.floor(Number.isFinite(value) ? value : min);
  return Math.min(max, Math.max(min, rounded));
}
