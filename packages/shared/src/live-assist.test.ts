import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAssistPrompt,
  buildQuickAssistSuggestion,
  formatAssistTranscript,
  parseAssistSuggestion,
  shouldRequestAssist,
  type AssistTurn,
} from './live-assist.js';

const FIXED_NOW = new Date('2026-06-01T12:00:00.000Z');

describe('shouldRequestAssist', () => {
  it('fires on a question from them', () => {
    const turns: AssistTurn[] = [
      { speaker: 'me', text: 'I led the migration to the new service.' },
      { speaker: 'them', text: 'How did you handle the database cutover?' },
    ];
    const trigger = shouldRequestAssist(turns);
    assert.equal(trigger?.reason, 'question');
    assert.match(trigger?.prompt ?? '', /database cutover/);
  });

  it('treats a dropped question mark as a question via interrogative opener', () => {
    const trigger = shouldRequestAssist([
      { speaker: 'them', text: 'So what would you do differently next time' },
    ]);
    assert.equal(trigger?.reason, 'question');
  });

  it('fires on an explicit hand-off that is not a question', () => {
    const trigger = shouldRequestAssist([
      { speaker: 'them', text: "I'd love your thoughts on the rollout plan." },
    ]);
    assert.equal(trigger?.reason, 'handoff');
  });

  it('fires turn-complete when they finish a substantial statement', () => {
    const trigger = shouldRequestAssist([
      {
        speaker: 'them',
        text: 'We are seeing latency spikes during peak load and the cache keeps evicting hot keys, which is hurting checkout.',
      },
    ]);
    assert.equal(trigger?.reason, 'turn-complete');
  });

  it('stays quiet while it is still my turn', () => {
    const trigger = shouldRequestAssist([
      { speaker: 'them', text: 'How would you design the queue?' },
      { speaker: 'me', text: 'I would start with…' },
    ]);
    assert.equal(trigger, null);
  });

  it('ignores a short, non-question backchannel from them', () => {
    const trigger = shouldRequestAssist([
      { speaker: 'me', text: 'So that is the plan.' },
      { speaker: 'them', text: 'Got it, makes sense.' },
    ]);
    assert.equal(trigger, null);
  });

  it('returns null for an empty conversation', () => {
    assert.equal(shouldRequestAssist([]), null);
    assert.equal(shouldRequestAssist([{ speaker: 'them', text: '   ' }]), null);
  });
});

describe('formatAssistTranscript', () => {
  it('labels speakers and drops empty turns', () => {
    const transcript = formatAssistTranscript([
      { speaker: 'them', text: 'Tell me about yourself.' },
      { speaker: 'me', text: '   ' },
      { speaker: 'me', text: 'I am a backend engineer.' },
    ]);
    assert.equal(
      transcript,
      'Them: Tell me about yourself.\nMe: I am a backend engineer.',
    );
  });

  it('keeps only the most recent turns within the window', () => {
    const turns: AssistTurn[] = Array.from({ length: 20 }, (_, i) => ({
      speaker: i % 2 === 0 ? 'them' : 'me',
      text: `line ${i}`,
    }));
    const transcript = formatAssistTranscript(turns, { maxTurns: 3 });
    assert.equal(transcript.split('\n').length, 3);
    assert.match(transcript, /line 19$/);
  });
});

describe('buildQuickAssistSuggestion', () => {
  it('summarizes recent turns for catch-up without a model', () => {
    const suggestion = buildQuickAssistSuggestion(
      'catch-up',
      [
        { speaker: 'them', text: 'We are reviewing the launch checklist.' },
        { speaker: 'me', text: 'I can take the backend items.' },
      ],
      FIXED_NOW,
    );
    assert.equal(suggestion?.headline, 'Catch-up');
    assert.deepEqual(suggestion?.talkingPoints, [
      'They: We are reviewing the launch checklist.',
      'You: I can take the backend items.',
    ]);
  });

  it('extracts action-like turns', () => {
    const suggestion = buildQuickAssistSuggestion(
      'actions',
      [
        { speaker: 'them', text: 'Please send the QA checklist today.' },
        { speaker: 'me', text: 'I will share it after this call.' },
      ],
      FIXED_NOW,
    );
    assert.equal(suggestion?.headline, 'Actions so far');
    assert.equal(suggestion?.talkingPoints.length, 2);
  });

  it('extracts decision-like turns', () => {
    const suggestion = buildQuickAssistSuggestion(
      'decisions',
      [{ speaker: 'them', text: 'We decided to ship the desktop app first.' }],
      FIXED_NOW,
    );
    assert.equal(suggestion?.headline, 'Decisions so far');
    assert.match(suggestion?.talkingPoints[0] ?? '', /desktop app first/);
  });
});

describe('buildAssistPrompt', () => {
  it('asks for talking-point JSON and includes the conversation', () => {
    const { system, user } = buildAssistPrompt({
      turns: [{ speaker: 'them', text: 'Why should we hire you?' }],
      context: { audience: 'interviewer', situation: 'Senior backend role' },
    });

    assert.match(system, /talkingPoints/);
    assert.match(system, /ONLY a JSON object/);
    assert.match(user, /Me is talking to: interviewer\./);
    assert.match(user, /Context: Senior backend role\./);
    assert.match(user, /Them: Why should we hire you\?/);
  });

  it('clamps the requested point count into range', () => {
    const high = buildAssistPrompt({ turns: [], maxPoints: 99 });
    assert.match(high.system, /6 or fewer concise points/);
    const low = buildAssistPrompt({ turns: [], maxPoints: 0 });
    assert.match(low.system, /1 or fewer concise points/);
  });

  it('notes when no conversation has been captured yet', () => {
    const { user } = buildAssistPrompt({ turns: [] });
    assert.match(user, /\(no conversation captured yet\)/);
  });
});

describe('parseAssistSuggestion', () => {
  it('parses a fenced JSON object into a typed suggestion', () => {
    const raw = [
      '```json',
      JSON.stringify({
        headline: 'They want your scaling approach',
        talkingPoints: ['Start with read replicas', 'Add a cache layer'],
        followUps: ['What is the read/write ratio?'],
        confidence: 'high',
      }),
      '```',
    ].join('\n');

    const suggestion = parseAssistSuggestion(raw, FIXED_NOW);
    assert.ok(suggestion);
    assert.equal(suggestion?.headline, 'They want your scaling approach');
    assert.deepEqual(suggestion?.talkingPoints, [
      'Start with read replicas',
      'Add a cache layer',
    ]);
    assert.deepEqual(suggestion?.followUps, ['What is the read/write ratio?']);
    assert.equal(suggestion?.confidence, 'high');
    assert.equal(suggestion?.generatedAt, FIXED_NOW.toISOString());
  });

  it('defaults confidence and headline, and tolerates missing followUps', () => {
    const suggestion = parseAssistSuggestion(
      JSON.stringify({ talkingPoints: ['Acknowledge the concern, then reframe'] }),
      FIXED_NOW,
    );
    assert.equal(suggestion?.confidence, 'medium');
    assert.equal(suggestion?.headline, 'Acknowledge the concern, then reframe');
    assert.deepEqual(suggestion?.followUps, []);
  });

  it('drops placeholder talking points', () => {
    const suggestion = parseAssistSuggestion(
      JSON.stringify({ talkingPoints: ['N/A', 'Mention the cost savings', 'tbd'] }),
      FIXED_NOW,
    );
    assert.deepEqual(suggestion?.talkingPoints, ['Mention the cost savings']);
  });

  it('returns null when there is nothing useful to say', () => {
    assert.equal(parseAssistSuggestion('not json at all', FIXED_NOW), null);
    assert.equal(
      parseAssistSuggestion(JSON.stringify({ talkingPoints: [] }), FIXED_NOW),
      null,
    );
    assert.equal(
      parseAssistSuggestion(JSON.stringify({ headline: 'hi' }), FIXED_NOW),
      null,
    );
  });
});
