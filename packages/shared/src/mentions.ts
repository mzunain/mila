// Mention detection — "did someone say my name / address me?"
//
// This runs on every finalized transcript segment so the app can flag the
// moment a participant said the user's name (or asked them something) and, if
// the user has stepped away, raise an alert / collect it for a "what did I
// miss" catch-up.
//
// The hard constraint that shapes everything here: the live ASR model (Whisper
// `base`) routinely *mangles* proper nouns — in testing, "Zulqarnain" came back
// as "Hazel Kahnain", "standup" as "standard". So we cannot match the user's
// name with a plain string `includes()`. We need:
//   1. token-level fuzzy matching (bounded edit distance), so "Qarnain"
//      still catches the misheard "Kahnain" (2 edits over 7 chars), and
//   2. a lightweight phonetic key, so spelling variants that *sound* alike
//      ("Zulqarnain" / "Zulkarnain", "Qarnain" / "Karnain") collapse together.
// The user supplies a few aliases (nicknames, initials, and however their name
// tends to get misheard); the matcher does the fuzzy/phonetic work on top.
//
// Pure, dependency-free, and synchronous — it's called once per segment in the
// hot path, so it must stay cheap.

export interface SelfIdentity {
  /** Display name, e.g. "Muhammad Zulqarnain". Split into matchable tokens. */
  name?: string;
  /**
   * Extra things people call the user, or how the name tends to be misheard
   * by ASR — e.g. ["Zul", "MZ", "Qarnain", "Karnain"]. Multi-word aliases are
   * split into tokens too.
   */
  aliases?: string[];
}

export interface MentionDetectOptions {
  /**
   * Also flag direct-address phrases ("can you…", "what are your thoughts?")
   * even when no name is present. Off by default: in a group call second-person
   * phrasing is everywhere and would make alerts noisy. The catch-up panel can
   * opt in to surface these as *possible* asks.
   */
  detectAddress?: boolean;
  /**
   * Minimum per-token similarity (0..1) to accept a fuzzy/phonetic name hit.
   * Lower = more forgiving of ASR mangling but more false positives.
   */
  minTokenScore?: number;
}

export type MentionKind = 'name' | 'address';

export interface MentionMatch {
  kind: MentionKind;
  /** The alias token that matched (kind 'name') or the address cue (kind 'address'). */
  matchedAlias: string;
  /** A short snippet of the transcript around the hit, for display/evidence. */
  evidence: string;
  /** 0..1 — how confident we are this is a real mention of the user. */
  confidence: number;
}

export interface MentionResult {
  matched: boolean;
  /** Highest-confidence match, or null. */
  best: MentionMatch | null;
  /** All matches found (name +, if enabled, address), strongest first. */
  matches: MentionMatch[];
}

const DEFAULT_MIN_TOKEN_SCORE = 0.62;

// Very common words a short alias might fuzzily collide with. A non-exact match
// against one of these is rejected to cut false positives ("Ali" vs "all").
// Kept tiny on purpose — it only guards the fuzzy path, never exact hits.
const COMMON_WORDS = new Set([
  'the', 'and', 'you', 'your', 'are', 'our', 'all', 'any', 'can', 'will', 'with',
  'this', 'that', 'they', 'them', 'then', 'than', 'have', 'has', 'was', 'were',
  'for', 'not', 'but', 'his', 'her', 'him', 'she', 'who', 'how', 'why', 'what',
  'when', 'into', 'one', 'out', 'now', 'yes', 'okay', 'like', 'just', 'know',
]);

// Direct-address cues — second-person framing that usually means "I'm talking to
// you". Conservative on purpose; only used when detectAddress is enabled.
const ADDRESS_PATTERNS: { re: RegExp; cue: string }[] = [
  { re: /\b(?:can|could|would|will|did|do|are|have)\s+you\b/, cue: 'question to you' },
  { re: /\bwhat(?:'s| is| are| do| would)\s+(?:your|you)\b/, cue: 'asking you' },
  { re: /\byour\s+(?:thoughts?|take|view|opinion|input|read|call)\b/, cue: 'your thoughts' },
  { re: /\b(?:over to|back to|hand(?:ing)? (?:it )?to)\s+you\b/, cue: 'over to you' },
  { re: /\bany\s+(?:thoughts?|comments?|questions?)\s+(?:from )?you\b/, cue: 'inviting you' },
  { re: /\bdo you (?:agree|think|have|want|know)\b/, cue: 'asking you' },
];

/**
 * Build the deduped set of matchable tokens from a name + aliases. Exported so
 * the settings UI can preview what will actually be matched, and for testing.
 */
export function buildAliasTokens(identity: SelfIdentity): string[] {
  const raw = [identity.name ?? '', ...(identity.aliases ?? [])];
  const tokens = new Set<string>();
  for (const entry of raw) {
    for (const token of tokenize(entry)) {
      // Single/double-char tokens (initials like "mz") are kept but will only
      // ever match exactly — see scoreTokenPair.
      if (token.length >= 2) tokens.add(token);
    }
  }
  return [...tokens];
}

/**
 * Detect whether `text` mentions or addresses the user described by `identity`.
 */
export function detectMention(
  text: string,
  identity: SelfIdentity,
  options: MentionDetectOptions = {},
): MentionResult {
  const minScore = options.minTokenScore ?? DEFAULT_MIN_TOKEN_SCORE;
  const aliasTokens = buildAliasTokens(identity);
  const transcriptTokens = tokenize(text);
  const matches: MentionMatch[] = [];

  if (aliasTokens.length && transcriptTokens.length) {
    let best: { score: number; alias: string; index: number } | null = null;
    for (const alias of aliasTokens) {
      for (let index = 0; index < transcriptTokens.length; index += 1) {
        const score = scoreTokenPair(alias, transcriptTokens[index]);
        if (score >= minScore && (!best || score > best.score)) {
          best = { score, alias, index };
        }
      }
    }
    if (best) {
      matches.push({
        kind: 'name',
        matchedAlias: best.alias,
        evidence: snippetAround(text, transcriptTokens, best.index),
        confidence: clamp01(best.score),
      });
    }
  }

  if (options.detectAddress) {
    const normalized = normalize(text);
    for (const { re, cue } of ADDRESS_PATTERNS) {
      const hit = re.exec(normalized);
      if (hit) {
        matches.push({
          kind: 'address',
          matchedAlias: cue,
          // Address is a weaker, ambiguous signal in group calls — capped low so
          // callers can keep it out of real-time alerts and only show it in catch-up.
          confidence: 0.45,
          evidence: contextAround(normalized, hit.index, hit[0].length),
        });
        break; // one address cue per segment is enough
      }
    }
  }

  matches.sort((left, right) => right.confidence - left.confidence);
  return {
    matched: matches.length > 0,
    best: matches[0] ?? null,
    matches,
  };
}

/** Convenience: just "was the user named?", ignoring address cues. */
export function hasNameMention(
  text: string,
  identity: SelfIdentity,
  options: MentionDetectOptions = {},
): boolean {
  return detectMention(text, identity, { ...options, detectAddress: false }).matched;
}

// --- matching internals ----------------------------------------------------

/**
 * Score how well an alias token matches a transcript token, 0..1.
 * Exact (case/diacritic-insensitive) → 1. Otherwise the better of a bounded
 * edit-distance ratio and a phonetic-key match. Returns 0 for no match.
 */
function scoreTokenPair(alias: string, candidate: string): number {
  if (alias === candidate) return 1;

  const a = fold(alias);
  const b = fold(candidate);
  if (!a || !b) return 0;
  if (a === b) return 0.97;

  // Initials / 2-char aliases ("mz") must match exactly — fuzzing them produces
  // nothing but false positives.
  if (a.length <= 2 || b.length <= 2) return 0;

  const longer = Math.max(a.length, b.length);
  // Don't fuzz against everyday words — that's the main false-positive source.
  if (COMMON_WORDS.has(b)) return 0;
  // Lengths too far apart aren't the same name garbled.
  if (Math.abs(a.length - b.length) > Math.ceil(longer * 0.34)) {
    // fall through to phonetic, which has its own guards
  } else {
    const distance = boundedLevenshtein(a, b);
    const maxEdits = longer <= 4 ? 1 : longer <= 7 ? 2 : Math.floor(longer * 0.3);
    if (distance <= maxEdits) {
      return 1 - distance / longer; // e.g. "qarnain"/"kahnain" → 1 - 2/7 ≈ 0.71
    }
  }

  const ka = phoneticKey(a);
  const kb = phoneticKey(b);
  if (ka && ka === kb && ka.length >= 3) {
    return 0.7; // sounds the same (e.g. "qarnain"/"karnain")
  }
  return 0;
}

/** Lowercase, NFKC-normalize, keep letters/numbers across scripts, split. */
function tokenize(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Strip diacritics and non-ascii-letters for Latin fuzzy comparison. */
function fold(token: string): string {
  return token
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Lightweight phonetic key (a consonant skeleton). Not full metaphone, but
 * enough to unify ASR spelling variants of the same-sounding name:
 * maps c/q→k, z→s, ph→f, x→ks; drops silent-ish h/w; drops vowels after the
 * first letter; collapses runs. "zulqarnain"→"slkrn", "qarnain"/"karnain"→"krn".
 */
function phoneticKey(token: string): string {
  let s = fold(token).replace(/[^a-z]/g, '');
  if (!s) return '';
  s = s
    .replace(/ph/g, 'f')
    .replace(/q/g, 'k')
    .replace(/c/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/z/g, 's')
    .replace(/[hw]/g, '');
  if (!s) return '';
  const first = s[0];
  const rest = s.slice(1).replace(/[aeiouy]/g, '');
  return (first + rest).replace(/(.)\1+/g, '$1');
}

/** Standard edit distance; tokens are short so the full DP is fine. */
function boundedLevenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = new Array<number>(cols);
  let curr = new Array<number>(cols);
  for (let j = 0; j < cols; j += 1) prev[j] = j;
  for (let i = 1; i < rows; i += 1) {
    curr[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[cols - 1];
}

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A few words of context around the matched transcript token, for display. */
function snippetAround(original: string, tokens: string[], index: number): string {
  const start = Math.max(0, index - 4);
  const end = Math.min(tokens.length, index + 5);
  const slice = tokens.slice(start, end).join(' ');
  const trimmed = original.trim();
  // Prefer the original text when it's short enough to show whole.
  if (trimmed.length <= 120) return trimmed;
  return `…${slice}…`;
}

function contextAround(normalized: string, at: number, length: number): string {
  const start = Math.max(0, at - 24);
  const end = Math.min(normalized.length, at + length + 24);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < normalized.length ? '…' : '';
  return `${prefix}${normalized.slice(start, end).trim()}${suffix}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
