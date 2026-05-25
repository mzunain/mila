import { Injectable, Logger } from '@nestjs/common';

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  meetingUrl?: string;
  provider?: string;
  organizer?: string;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  async fetchUpcoming(feedUrl: string): Promise<CalendarEvent[]> {
    if (!/^https?:\/\//i.test(feedUrl)) {
      throw new Error('Calendar feed must be a public webcal/https URL');
    }
    let body: string;
    try {
      const response = await fetch(feedUrl);
      if (!response.ok) {
        throw new Error(`Calendar feed returned ${response.status}`);
      }
      body = await response.text();
    } catch (error) {
      this.logger.warn(`Could not fetch ${feedUrl}: ${String(error)}`);
      throw error;
    }
    return this.parseIcs(body).filter((event) => {
      return new Date(event.end).getTime() >= Date.now();
    });
  }

  parseIcs(input: string): CalendarEvent[] {
    const lines = unfoldIcs(input).split(/\r?\n/);
    const events: CalendarEvent[] = [];
    let current: Partial<CalendarEvent> | null = null;
    let description: string | undefined;

    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') {
        current = {};
        description = undefined;
      } else if (line === 'END:VEVENT') {
        if (current?.start && current?.end && current?.title) {
          const url = current.meetingUrl ?? extractMeetingUrl(description);
          events.push({
            id: current.id ?? cryptoRandom(),
            title: current.title,
            start: current.start,
            end: current.end,
            meetingUrl: url,
            provider: detectProvider(url),
            organizer: current.organizer,
          });
        }
        current = null;
      } else if (current) {
        const [head, ...rest] = line.split(':');
        if (!head || rest.length === 0) continue;
        const value = rest.join(':');
        const propertyName = head.split(';')[0];
        switch (propertyName) {
          case 'UID':
            current.id = value;
            break;
          case 'SUMMARY':
            current.title = unescapeIcs(value);
            break;
          case 'DTSTART':
            current.start = toIso(value);
            break;
          case 'DTEND':
            current.end = toIso(value);
            break;
          case 'LOCATION':
            current.meetingUrl = current.meetingUrl ?? unescapeIcs(value);
            break;
          case 'ORGANIZER':
            current.organizer = value.replace(/^mailto:/i, '');
            break;
          case 'DESCRIPTION':
            description = unescapeIcs(value);
            break;
          case 'URL':
            current.meetingUrl = unescapeIcs(value);
            break;
        }
      }
    }

    return events.sort(
      (left, right) =>
        new Date(left.start).getTime() - new Date(right.start).getTime(),
    );
  }
}

function unfoldIcs(input: string): string {
  return input.replace(/\r?\n[ \t]/g, '');
}

function unescapeIcs(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function toIso(value: string): string {
  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    const year = value.slice(0, 4);
    const month = value.slice(4, 6);
    const day = value.slice(6, 8);
    const hour = value.slice(9, 11);
    const minute = value.slice(11, 13);
    const second = value.slice(13, 15);
    const suffix = value.endsWith('Z') ? 'Z' : '';
    return `${year}-${month}-${day}T${hour}:${minute}:${second}${suffix}`;
  }
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`;
  }
  return value;
}

function extractMeetingUrl(description?: string): string | undefined {
  if (!description) return undefined;
  const match = description.match(
    /https?:\/\/(meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com|app\.slack\.com)\S+/i,
  );
  return match?.[0];
}

function detectProvider(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.includes('meet.google.com')) return 'google-meet';
  if (url.includes('zoom.us')) return 'zoom';
  if (url.includes('teams.microsoft.com')) return 'microsoft-teams';
  if (url.includes('slack.com')) return 'slack-huddle';
  return undefined;
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
