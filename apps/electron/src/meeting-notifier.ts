import { Notification } from 'electron';
import type { DetectedMeeting } from './meeting-detector';
import { meetingNotificationBody } from './meeting-notification-policy';

type MeetingNotifierOptions = {
  onTakeNotes: () => void;
  log?: (message: string) => void;
};

export function showCallDetectedNotification(
  meeting: DetectedMeeting,
  options: MeetingNotifierOptions,
): void {
  if (!Notification.isSupported()) {
    options.log?.('[meeting-notifier] skipped: notifications unsupported');
    return;
  }

  const notification = new Notification({
    title: 'Call detected',
    body: meetingNotificationBody(meeting),
    actions:
      process.platform === 'darwin'
        ? [{ type: 'button', text: 'Take Notes' }]
        : undefined,
    closeButtonText: process.platform === 'darwin' ? 'Dismiss' : undefined,
    silent: false,
  });

  notification.on('click', options.onTakeNotes);
  notification.on('action', (_event, index) => {
    if (index === 0) options.onTakeNotes();
  });
  notification.show();
}
