import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAdHocBrief,
  createMeetingBrief,
  formatStartsIn,
  inferTemplateId,
} from './briefs.js';

describe('meeting briefs', () => {
  it('builds sales prep from customer meeting titles', () => {
    const brief = createMeetingBrief(
      {
        id: 'call-1',
        title: 'Customer discovery demo',
        startAt: '2026-05-30T14:00:00.000Z',
        endAt: '2026-05-30T15:00:00.000Z',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
      },
      new Date('2026-05-30T13:30:00.000Z'),
    );

    assert.equal(brief.suggestedTemplateId, 'sales');
    assert.equal(brief.startsInLabel, 'in 30m');
    assert.match(brief.headline, /Prepare for Customer discovery demo/);
    assert.ok(
      brief.agendaQuestions.some((item) =>
        /decision|timeline|budget|blocker/i.test(item.text),
      ),
    );
    assert.ok(brief.capturePlan[0].text.includes('meeting link'));
  });

  it('creates an ad-hoc brief that starts now', () => {
    const now = new Date('2026-05-30T13:30:00.000Z');
    const brief = createAdHocBrief(now);

    assert.equal(brief.meeting.id, 'adhoc');
    assert.equal(brief.urgency, 'now');
    assert.equal(brief.startsInLabel, 'starting now');
    assert.equal(brief.suggestedTemplateId, 'general');
  });

  it('formats multi-hour countdowns compactly', () => {
    assert.equal(formatStartsIn(90 * 60_000), 'in 1h 30m');
  });

  it('falls back to the general template for unknown meetings', () => {
    assert.equal(inferTemplateId('Weekly planning'), 'general');
  });
});
