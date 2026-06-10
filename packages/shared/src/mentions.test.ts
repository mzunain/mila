import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAliasTokens, detectMention, hasNameMention } from './mentions.js';
import type { SelfIdentity } from './mentions.js';

const me: SelfIdentity = {
  name: 'Muhammad Zulqarnain',
  // Common nicknames + how the surname tends to get misheard by ASR.
  aliases: ['Zul', 'MZ', 'Qarnain'],
};

describe('mention detection', () => {
  it('builds deduped, lowercased alias tokens from name + aliases', () => {
    const tokens = buildAliasTokens(me);
    assert.ok(tokens.includes('muhammad'));
    assert.ok(tokens.includes('zulqarnain'));
    assert.ok(tokens.includes('qarnain'));
    assert.ok(tokens.includes('mz'));
    // 1-char fragments are dropped.
    assert.ok(!tokens.includes('m'));
  });

  it('matches an exact name mention', () => {
    const result = detectMention('Hey Zulqarnain, can you take this one?', me);
    assert.equal(result.matched, true);
    assert.equal(result.best?.kind, 'name');
    assert.ok((result.best?.confidence ?? 0) >= 0.9);
  });

  it('matches case- and punctuation-insensitively', () => {
    assert.equal(hasNameMention('ZULQARNAIN!!! are you there', me), true);
    assert.equal(hasNameMention('thanks, zul', me), true);
  });

  it('catches the surname even when ASR mangles it (Qarnain ~ Kahnain)', () => {
    // Real failure mode: Whisper `base` rendered "Zulqarnain" as "Hazel Kahnain".
    // The "Qarnain" alias is 2 edits from "Kahnain" → still a hit.
    const result = detectMention('Hazel Kahnain, what do you think about the rollout?', me);
    assert.equal(result.matched, true);
    assert.equal(result.best?.kind, 'name');
    assert.equal(result.best?.matchedAlias, 'qarnain');
  });

  it('unifies same-sounding spelling variants phonetically', () => {
    // "Karnain" is a phonetic twin of the "Qarnain" alias (q→k).
    assert.equal(hasNameMention('over to you, Karnain', me), true);
    // "Zulkarnain" vs "Zulqarnain" — same phonetic skeleton.
    assert.equal(hasNameMention('Zulkarnain please confirm', me), true);
  });

  it('does not fire on unrelated speech', () => {
    const result = detectMention(
      'We should ship the deployment pipeline before the standup.',
      me,
    );
    assert.equal(result.matched, false);
    assert.equal(result.best, null);
  });

  it('does not fuzzily collide a short alias with common words', () => {
    // "Zul" must not match "full", "pull", "rule", etc.
    assert.equal(hasNameMention('we need the full report and all the rules', me), false);
  });

  it('ignores initials unless they appear exactly as a token', () => {
    assert.equal(hasNameMention('the MZ budget line is approved', me), true);
    assert.equal(hasNameMention('amazing work everyone', me), false);
  });

  it('does not detect address phrases by default', () => {
    const result = detectMention('Can you send the deck after the call?', me);
    assert.equal(result.matched, false);
  });

  it('detects direct-address phrases when explicitly enabled, at low confidence', () => {
    const result = detectMention('Can you send the deck after the call?', me, {
      detectAddress: true,
    });
    assert.equal(result.matched, true);
    assert.equal(result.best?.kind, 'address');
    assert.ok((result.best?.confidence ?? 1) <= 0.5);
  });

  it('prefers a name match over an address cue in the same segment', () => {
    const result = detectMention('Zul, can you take the next item?', me, {
      detectAddress: true,
    });
    assert.equal(result.best?.kind, 'name');
    assert.equal(result.matches.length, 2);
  });

  it('returns no matches for an empty identity', () => {
    assert.equal(detectMention('Zulqarnain are you there', {}).matched, false);
  });

  it('provides a readable evidence snippet', () => {
    const result = detectMention('Hey Zulqarnain, can you take a look?', me);
    assert.ok((result.best?.evidence ?? '').toLowerCase().includes('zulqarnain'));
  });
});
