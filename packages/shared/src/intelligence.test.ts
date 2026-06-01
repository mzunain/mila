import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MeetingNotes } from './notes.js';
import {
  buildMeetingActionInbox,
  buildMeetingActionReview,
  buildMeetingSessionPreview,
} from './intelligence.js';
import type { MeetingSession } from './meetings.js';

const baseNotes: MeetingNotes = {
  summary: 'We agreed to ship the onboarding polish before launch.',
  keyPoints: ['Calendar detection is important', 'Mobile needs a compact view'],
  actionItems: [],
  decisions: ['Keep the first production slice focused'],
  outputLanguage: 'en',
  updatedAt: '2026-05-30T10:00:00.000Z',
};

const baseSession: MeetingSession = {
  id: 'session-1',
  title: 'Launch review',
  status: 'completed',
  source: 'manual',
  autoStarted: false,
  outputLanguage: 'en',
  createdAt: '2026-05-30T09:00:00.000Z',
};

describe('meeting intelligence', () => {
  it('returns an empty review when no actions have been captured', () => {
    const review = buildMeetingActionReview(baseNotes);

    assert.equal(review.riskLevel, 'empty');
    assert.equal(review.totalActions, 0);
    assert.equal(review.openActions, 0);
    assert.match(review.followUpDraft, /Calendar detection is important/);
  });

  it('flags missing owners before missing due dates', () => {
    const review = buildMeetingActionReview({
      ...baseNotes,
      actionItems: [
        {
          id: 'a1',
          text: 'Send launch checklist',
          status: 'open',
          due: '2026-06-01',
        },
        {
          id: 'a2',
          text: 'Confirm app store path',
          status: 'open',
          owner: 'Mila team',
        },
      ],
    });

    assert.equal(review.riskLevel, 'needs-owners');
    assert.equal(review.missingOwner, 1);
    assert.equal(review.missingDue, 1);
    assert.equal(review.topActions[0]?.ownerLabel, 'Unassigned');
    assert.match(review.nextBestAction, /Assign owners/);
  });

  it('promotes overdue work into overloaded triage', () => {
    const review = buildMeetingActionReview(
      {
        ...baseNotes,
        actionItems: [
          {
            id: 'a1',
            text: 'Reply to customer',
            status: 'open',
            owner: 'Ayla',
            due: '2026-05-27',
          },
          {
            id: 'a2',
            text: 'Publish desktop build',
            status: 'open',
            owner: 'Zain',
            due: '2026-05-28',
          },
          {
            id: 'a3',
            text: 'Prepare QA notes',
            status: 'open',
            owner: 'Sara',
            due: '2026-05-29',
          },
        ],
      },
      new Date('2026-05-30T12:00:00.000Z'),
    );

    assert.equal(review.riskLevel, 'overloaded');
    assert.equal(review.overdueActions, 3);
    assert.match(review.nextBestAction, /overdue/i);
  });

  it('builds a shareable follow-up draft with owners and due dates', () => {
    const review = buildMeetingActionReview({
      ...baseNotes,
      actionItems: [
        {
          id: 'a1',
          text: 'Send customer follow-up',
          status: 'open',
          owner: 'Muhammad',
          due: 'Friday',
        },
      ],
    });

    assert.equal(review.riskLevel, 'clear');
    assert.match(review.followUpDraft, /Muhammad: Send customer follow-up/);
    assert.match(review.followUpDraft, /Decisions:/);
  });

  it('builds a compact session preview for list screens', () => {
    const preview = buildMeetingSessionPreview({
      ...baseNotes,
      keyPoints: ['First point', 'Second point', 'Third point', 'Fourth point'],
      actionItems: [
        {
          id: 'a1',
          text: 'Prepare launch memo',
          status: 'open',
        },
        {
          id: 'a2',
          text: 'Ship desktop build',
          status: 'done',
          owner: 'Mila team',
          due: '2026-05-29',
        },
      ],
    });

    assert.equal(preview.summary, baseNotes.summary);
    assert.deepEqual(preview.keyPoints, [
      'First point',
      'Second point',
      'Third point',
    ]);
    assert.equal(preview.decisionCount, 1);
    assert.equal(preview.actionStats.total, 2);
    assert.equal(preview.actionStats.open, 1);
    assert.equal(preview.actionStats.completed, 1);
    assert.equal(preview.actionStats.riskLevel, 'needs-owners');
  });

  it('suppresses placeholder summaries in session previews', () => {
    const preview = buildMeetingSessionPreview({
      ...baseNotes,
      summary: 'Listening for the first useful meeting moments.',
    });

    assert.equal(preview.summary, '');
  });

  it('builds a prioritized cross-meeting action inbox', () => {
    const inbox = buildMeetingActionInbox(
      [
        {
          session: baseSession,
          notes: {
            ...baseNotes,
            actionItems: [
              {
                id: 'a1',
                text: 'Send production checklist',
                status: 'open',
              },
              {
                id: 'a2',
                text: 'Publish desktop build',
                status: 'done',
                owner: 'Mila team',
                due: '2026-05-29',
              },
            ],
          },
        },
        {
          session: {
            ...baseSession,
            id: 'session-2',
            title: 'Customer call',
            createdAt: '2026-05-30T11:00:00.000Z',
          },
          notes: {
            ...baseNotes,
            actionItems: [
              {
                id: 'b1',
                text: 'Reply to customer',
                status: 'open',
                owner: 'Sara',
                due: '2026-05-27',
              },
            ],
          },
        },
      ],
      new Date('2026-05-30T12:00:00.000Z'),
    );

    assert.equal(inbox.totalOpen, 2);
    assert.equal(inbox.completedTracked, 1);
    assert.equal(inbox.sessionsWithOpenActions, 2);
    assert.equal(inbox.missingOwner, 1);
    assert.equal(inbox.overdueActions, 1);
    assert.equal(inbox.items[0]?.text, 'Reply to customer');
    assert.equal(inbox.items[0]?.sessionTitle, 'Customer call');
  });
});
