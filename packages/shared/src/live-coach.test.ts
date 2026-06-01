import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildLiveMeetingCoach } from './live-coach.js';
import type { MeetingNotes } from './notes.js';
import type { TranscriptSegment } from './meetings.js';

const baseNotes: MeetingNotes = {
  summary: 'Listening for the first useful meeting moments.',
  keyPoints: [],
  actionItems: [],
  decisions: [],
  outputLanguage: 'en',
  updatedAt: '2026-05-30T10:00:00.000Z',
};

function segment(
  id: string,
  text: string,
  overrides: Partial<TranscriptSegment> = {},
): TranscriptSegment {
  return {
    id,
    sessionId: 'session-1',
    speakerId: 'Ayla',
    originalText: text,
    normalizedText: text,
    translatedText: text,
    detectedLanguage: 'en',
    direction: 'ltr',
    confidence: 0.92,
    startMs: 0,
    endMs: 1000,
    isFinal: true,
    ...overrides,
  };
}

describe('live meeting coach', () => {
  it('waits quietly when there is no useful meeting signal', () => {
    const coach = buildLiveMeetingCoach(
      { notes: baseNotes, segments: [], isLive: true },
      new Date('2026-05-30T12:00:00.000Z'),
    );

    assert.equal(coach.state, 'empty');
    assert.equal(coach.cards.length, 0);
    assert.match(coach.nextBestPrompt, /Keep listening/);
  });

  it('prioritizes missing owners and due dates from live action items', () => {
    const coach = buildLiveMeetingCoach({
      notes: {
        ...baseNotes,
        summary: 'The team is preparing the desktop build checklist.',
        actionItems: [
          {
            id: 'a1',
            text: 'Prepare the signed desktop build checklist',
            status: 'open',
          },
        ],
      },
      segments: [
        segment('s1', 'Please prepare the signed desktop build checklist.'),
      ],
      isLive: true,
    });

    assert.equal(coach.state, 'coaching');
    assert.equal(coach.cards[0]?.kind, 'owner-check');
    assert.equal(coach.cards[1]?.kind, 'date-check');
    assert.match(coach.headline, /owner/i);
  });

  it('surfaces decision confirmation when option talk has no captured decision', () => {
    const coach = buildLiveMeetingCoach({
      notes: baseNotes,
      segments: [
        segment('s1', 'We have two options for the launch path.'),
        segment('s2', 'I think we should go with the desktop-first proposal.'),
      ],
      isLive: true,
    });

    assert.equal(
      coach.cards.some((card) => card.kind === 'decision-check'),
      true,
    );
    assert.match(coach.nextBestPrompt, /confirm the decision/i);
  });

  it('detects multilingual context without creating duplicate language cards', () => {
    const coach = buildLiveMeetingCoach({
      notes: {
        ...baseNotes,
        summary: 'Customer questions covered pricing and rollout timing.',
      },
      segments: [
        segment('s1', 'We can answer in English.', {
          detectedLanguage: 'en',
        }),
        segment('s2', 'Urdu turn from the customer.', {
          detectedLanguage: 'ur',
          direction: 'rtl',
        }),
        segment('s3', 'Another English turn.', {
          detectedLanguage: 'en',
        }),
      ],
      isLive: true,
    });

    const languageCards = coach.cards.filter(
      (card) => card.kind === 'language-shift',
    );

    assert.equal(languageCards.length, 1);
    assert.match(languageCards[0]?.detail ?? '', /English/);
    assert.equal(
      coach.metrics.find((metric) => metric.id === 'languages')?.value,
      '2',
    );
  });

  it('flags participation skew only after enough speaker turns', () => {
    const coach = buildLiveMeetingCoach({
      notes: {
        ...baseNotes,
        summary: 'The meeting is reviewing launch readiness.',
      },
      segments: [
        segment('s1', 'First update', { speakerId: 'Ayla' }),
        segment('s2', 'Second update', { speakerId: 'Ayla' }),
        segment('s3', 'Third update', { speakerId: 'Ayla' }),
        segment('s4', 'Fourth update', { speakerId: 'Ayla' }),
        segment('s5', 'Quick confirmation', { speakerId: 'Zain' }),
      ],
      isLive: true,
    });

    assert.equal(
      coach.cards.some((card) => card.kind === 'participation'),
      true,
    );
  });
});
