import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  MeetingNotificationPolicy,
  isMeetingNotificationAllowed,
  meetingNotificationBody,
  meetingNotificationKey,
} from './meeting-notification-policy';
import type { DetectedMeeting } from './meeting-detector';

const WHATSAPP_MEETING: DetectedMeeting = {
  provider: 'whatsapp',
  title: 'WhatsApp call',
  detectedAt: '2026-05-30T09:00:00.000Z',
};

const CHROME_MEETING: DetectedMeeting = {
  provider: 'google-meet',
  title: 'Chrome call',
  detectedAppName: 'Chrome',
  detectedAt: '2026-05-30T09:01:00.000Z',
};

test('meeting notification copy renders provider name for WhatsApp', () => {
  assert.equal(meetingNotificationBody(WHATSAPP_MEETING), 'WhatsApp');
  assert.equal(meetingNotificationKey(WHATSAPP_MEETING), 'whatsapp:WhatsApp call');
});

test('meeting notification copy prefers detected app name for browser calls', () => {
  assert.equal(meetingNotificationBody(CHROME_MEETING), 'Chrome');
  assert.equal(meetingNotificationKey(CHROME_MEETING), 'google-meet:Chrome call');
});

test('meeting notification policy allows auto-detected calls by default', () => {
  assert.equal(
    isMeetingNotificationAllowed(WHATSAPP_MEETING, {
      autoDetectedMeetingNotifications: true,
      mutedMeetingApps: [],
    }),
    true,
  );
});

test('meeting notification policy respects the auto-detected notification toggle', () => {
  assert.equal(
    isMeetingNotificationAllowed(WHATSAPP_MEETING, {
      autoDetectedMeetingNotifications: false,
      mutedMeetingApps: [],
    }),
    false,
  );
});

test('meeting notification policy mutes by provider display name', () => {
  assert.equal(
    isMeetingNotificationAllowed(WHATSAPP_MEETING, {
      autoDetectedMeetingNotifications: true,
      mutedMeetingApps: ['WhatsApp'],
    }),
    false,
  );
});

test('meeting notification policy mutes browser calls by detected app name', () => {
  assert.equal(
    isMeetingNotificationAllowed(CHROME_MEETING, {
      autoDetectedMeetingNotifications: true,
      mutedMeetingApps: ['Chrome'],
    }),
    false,
  );
});

test('meeting notification policy suppresses duplicates until the call clears', () => {
  const policy = new MeetingNotificationPolicy();
  const prefs = {
    autoDetectedMeetingNotifications: true,
    mutedMeetingApps: [],
  };

  assert.equal(policy.shouldShow(WHATSAPP_MEETING, prefs), true);
  assert.equal(policy.shouldShow(WHATSAPP_MEETING, prefs), false);

  policy.clear(meetingNotificationKey(WHATSAPP_MEETING));
  assert.equal(policy.shouldShow(WHATSAPP_MEETING, prefs), true);
});
