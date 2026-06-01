import type { DetectedMeeting } from './meeting-detector';
import { meetingNotificationBody } from './meeting-notification-policy';

export type DetectedCallActionCopy = {
  providerLabel: string;
  trayTitle: string;
  title: string;
  takeNotesLabel: string;
  ignoreLabel: string;
  muteLabel: string;
};

export function detectedCallActionCopy(
  meeting: DetectedMeeting,
): DetectedCallActionCopy {
  const providerLabel = meetingNotificationBody(meeting);
  return {
    providerLabel,
    trayTitle: `${providerLabel} • call`,
    title: 'Call detected',
    takeNotesLabel: 'Take Notes',
    ignoreLabel: 'Ignore this call',
    muteLabel: `Mute ${providerLabel} notifications`,
  };
}
