import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  dayBucketLabel,
  formatTimeRange,
  formatTimeUntil,
  formatTrayTitle,
  isCallInProgress,
  parseScheduledCalls,
} from './calendar-schedule';

const NOW = new Date('2026-05-30T10:00:00.000Z');

test('parseScheduledCalls returns sorted current and future timed events', () => {
  const calls = parseScheduledCalls(
    JSON.stringify([
      {
        id: 'past',
        title: 'Past standup',
        startAt: '2026-05-30T09:00:00.000Z',
        endAt: '2026-05-30T09:59:00.000Z',
      },
      {
        id: 'current',
        title: 'In progress',
        startAt: '2026-05-30T09:45:00.000Z',
        endAt: '2026-05-30T10:25:00.000Z',
      },
      {
        id: 'later',
        title: 'Later call',
        startAt: '2026-05-30T14:00:00.000Z',
        endAt: '2026-05-30T15:00:00.000Z',
      },
      {
        id: 'next',
        title: 'Claude and AI Mastermind',
        startAt: '2026-05-30T12:00:00.000Z',
        endAt: '2026-05-30T13:00:00.000Z',
      },
    ]),
    NOW,
  );

  assert.deepEqual(
    calls.map((call) => call.id),
    ['current', 'next', 'later'],
  );
});

test('parseScheduledCalls ignores all-day and invalid events', () => {
  const calls = parseScheduledCalls(
    JSON.stringify([
      {
        id: 'all-day',
        title: 'Holiday',
        startAt: '2026-05-31T00:00:00.000Z',
        endAt: '2026-06-01T00:00:00.000Z',
        allDay: true,
      },
      {
        id: 'invalid',
        title: 'Broken',
        startAt: 'not a date',
        endAt: '2026-05-31T10:00:00.000Z',
      },
    ]),
    NOW,
  );

  assert.deepEqual(calls, []);
});

test('parseScheduledCalls extracts meeting urls from calendar fields', () => {
  const [call] = parseScheduledCalls(
    JSON.stringify([
      {
        title: 'Customer sync',
        startAt: '2026-05-30T12:00:00.000Z',
        endAt: '2026-05-30T12:30:00.000Z',
        notes: 'Join: https://meet.google.com/abc-defg-hij',
      },
    ]),
    NOW,
  );

  assert.equal(call.meetingUrl, 'https://meet.google.com/abc-defg-hij');
});

test('parseScheduledCalls respects calendar visibility and video-link filters', () => {
  const calls = parseScheduledCalls(
    JSON.stringify([
      {
        id: 'sales',
        title: 'Sales call',
        startAt: '2026-05-30T12:00:00.000Z',
        endAt: '2026-05-30T12:30:00.000Z',
        calendarName: 'Work',
        location: 'https://zoom.us/j/123',
      },
      {
        id: 'personal',
        title: 'Personal appointment',
        startAt: '2026-05-30T13:00:00.000Z',
        endAt: '2026-05-30T13:30:00.000Z',
        calendarName: 'Personal',
      },
    ]),
    NOW,
    6,
    {
      includeEventsWithoutMeetingUrl: false,
      visibleCalendars: { Personal: false },
    },
  );

  assert.deepEqual(
    calls.map((call) => call.id),
    ['sales'],
  );
});

test('format helpers produce compact tray/menu labels', () => {
  const call = parseScheduledCalls(
    JSON.stringify([
      {
        title: 'C139 Claude and AI Mastermind INTL',
        startAt: '2026-05-31T02:43:00.000Z',
        endAt: '2026-05-31T03:43:00.000Z',
      },
    ]),
    NOW,
  )[0];

  assert.equal(formatTimeUntil(call.startAt, NOW), '16h 43m');
  assert.equal(formatTrayTitle(call, NOW), 'C139 C... • in 16h 43m');
  assert.equal(dayBucketLabel(call, NOW), 'Tomorrow');
  assert.match(formatTimeRange(call), /^\d{2}:\d{2} - \d{2}:\d{2}$/);
});

test('format helpers persist in-progress meetings with time left', () => {
  const call = parseScheduledCalls(
    JSON.stringify([
      {
        title: 'C139 Claude and AI Mastermind INTL',
        startAt: '2026-05-30T09:35:00.000Z',
        endAt: '2026-05-30T10:25:00.000Z',
      },
    ]),
    NOW,
  )[0];

  assert.equal(isCallInProgress(call, NOW), true);
  assert.equal(formatTrayTitle(call, NOW), 'C139 C... • 25m left');
  assert.equal(dayBucketLabel(call, NOW), 'Ends in 25m');
});
