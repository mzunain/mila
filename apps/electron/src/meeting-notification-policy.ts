import type { DetectedMeeting, DetectedProvider } from './meeting-detector';
import type { Preferences } from './store';

const PROVIDER_LABELS: Record<DetectedProvider, string> = {
  zoom: 'Zoom',
  'microsoft-teams': 'Microsoft Teams',
  'google-meet': 'Google Meet',
  webex: 'Webex',
  whatsapp: 'WhatsApp',
  facetime: 'FaceTime',
  discord: 'Discord',
  slack: 'Slack',
  telegram: 'Telegram',
  signal: 'Signal',
  skype: 'Skype',
  unknown: 'Call',
};

export function meetingNotificationKey(meeting: DetectedMeeting): string {
  return `${meeting.provider}:${meeting.meetingUrl ?? meeting.title}`;
}

export function meetingNotificationBody(meeting: DetectedMeeting): string {
  if (meeting.detectedAppName) return meeting.detectedAppName;
  return PROVIDER_LABELS[meeting.provider] ?? meeting.title;
}

export function isMeetingNotificationAllowed(
  meeting: DetectedMeeting,
  preferences: Pick<
    Preferences,
    'autoDetectedMeetingNotifications' | 'mutedMeetingApps'
  >,
): boolean {
  if (!preferences.autoDetectedMeetingNotifications) return false;

  const muted = new Set(
    preferences.mutedMeetingApps.map((name) => normalizeAppName(name)),
  );
  if (muted.size === 0) return true;

  const provider = normalizeAppName(meeting.provider);
  const displayName = normalizeAppName(meetingNotificationBody(meeting));
  const title = normalizeAppName(meeting.title);

  return ![provider, displayName, title].some((candidate) => {
    if (!candidate) return false;
    if (muted.has(candidate)) return true;
    return [...muted].some(
      (mutedName) =>
        candidate.includes(mutedName) || mutedName.includes(candidate),
    );
  });
}

export class MeetingNotificationPolicy {
  private readonly activeKeys = new Set<string>();

  shouldShow(
    meeting: DetectedMeeting,
    preferences: Pick<
      Preferences,
      'autoDetectedMeetingNotifications' | 'mutedMeetingApps'
    >,
  ): boolean {
    if (!isMeetingNotificationAllowed(meeting, preferences)) return false;

    const key = meetingNotificationKey(meeting);
    if (this.activeKeys.has(key)) return false;

    this.activeKeys.add(key);
    return true;
  }

  clear(key: string): void {
    this.activeKeys.delete(key);
  }
}

function normalizeAppName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/\b(call|meeting|huddle|web)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
