import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { detectedCallActionCopy } from './detected-call-actions';
import type { DetectedMeeting } from './meeting-detector';

test('detected call action copy is concise for WhatsApp', () => {
  const meeting: DetectedMeeting = {
    provider: 'whatsapp',
    title: 'WhatsApp call',
    detectedAt: '2026-05-30T09:00:00.000Z',
  };

  assert.deepEqual(detectedCallActionCopy(meeting), {
    providerLabel: 'WhatsApp',
    trayTitle: 'WhatsApp • call',
    title: 'Call detected',
    takeNotesLabel: 'Take Notes',
    ignoreLabel: 'Ignore this call',
    muteLabel: 'Mute WhatsApp notifications',
  });
});

test('detected call action copy maps Teams provider to user-facing label', () => {
  const meeting: DetectedMeeting = {
    provider: 'microsoft-teams',
    title: 'Microsoft Teams meeting',
    detectedAt: '2026-05-30T09:00:00.000Z',
  };

  assert.equal(
    detectedCallActionCopy(meeting).muteLabel,
    'Mute Microsoft Teams notifications',
  );
});

test('detected call action copy uses detected app name for Chrome media capture', () => {
  const meeting: DetectedMeeting = {
    provider: 'google-meet',
    title: 'Chrome call',
    detectedAppName: 'Chrome',
    detectedAt: '2026-05-30T09:00:00.000Z',
  };

  assert.deepEqual(detectedCallActionCopy(meeting), {
    providerLabel: 'Chrome',
    trayTitle: 'Chrome • call',
    title: 'Call detected',
    takeNotesLabel: 'Take Notes',
    ignoreLabel: 'Ignore this call',
    muteLabel: 'Mute Chrome notifications',
  });
});
