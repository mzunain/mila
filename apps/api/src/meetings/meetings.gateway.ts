import { Logger } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import type { ClientMeetingEvent, ServerMeetingEvent } from '@mila/shared';
import { RawData, WebSocket } from 'ws';
import { MeetingsService } from './meetings.service';

@WebSocketGateway({ path: '/meetings/live' })
export class MeetingsGateway {
  private readonly logger = new Logger(MeetingsGateway.name);
  private readonly clientsBySession = new Map<string, Set<WebSocket>>();
  private readonly sessionsByClient = new Map<WebSocket, Set<string>>();

  constructor(private readonly meetingsService: MeetingsService) {}

  handleConnection(client: WebSocket) {
    client.on('message', (payload: RawData) => {
      void this.handleMessage(client, decodePayload(payload));
    });
    client.on('close', () => {
      this.removeClient(client);
    });
  }

  private async handleMessage(client: WebSocket, rawPayload: string) {
    try {
      const event = JSON.parse(rawPayload) as ClientMeetingEvent;

      if (event.type === 'start') {
        const detail = this.meetingsService.getSessionDetail(event.sessionId);

        if (!detail) {
          this.send(client, {
            type: 'error',
            code: 'SESSION_NOT_FOUND',
            message: 'Meeting session not found',
          });
          return;
        }

        this.addClientToSession(client, event.sessionId);
        this.send(client, {
          type: 'session',
          session: detail.session,
          notes: detail.notes,
        });
        return;
      }

      if (event.type === 'audio-chunk') {
        const result = await this.meetingsService.ingestAudioChunk(event);

        if (result.segment) {
          this.broadcast(event.sessionId, {
            type: 'transcript',
            segment: result.segment,
            notes: result.notes,
          });
          return;
        }

        this.broadcast(event.sessionId, {
          type: 'notes',
          notes: result.notes,
        });
        return;
      }

      if (event.type === 'transcript-chunk') {
        const result = await this.meetingsService.ingestTranscriptChunk(event);

        if (result.segment) {
          this.broadcast(event.sessionId, {
            type: 'transcript',
            segment: result.segment,
            notes: result.notes,
          });
          return;
        }

        this.broadcast(event.sessionId, {
          type: 'notes',
          notes: result.notes,
        });
        return;
      }

      if (event.type === 'stop') {
        const notes = await this.meetingsService.completeSession(
          event.sessionId,
        );
        this.broadcast(event.sessionId, { type: 'notes', notes });
      }
    } catch (error) {
      this.logger.warn(error);
      this.send(client, {
        type: 'error',
        code: 'BAD_EVENT',
        message: 'Invalid meeting stream event',
      });
    }
  }

  private send(client: WebSocket, event: ServerMeetingEvent) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(event));
    }
  }

  private broadcast(sessionId: string, event: ServerMeetingEvent) {
    const clients = this.clientsBySession.get(sessionId);

    if (!clients?.size) {
      return;
    }

    for (const client of clients) {
      this.send(client, event);
    }
  }

  private addClientToSession(client: WebSocket, sessionId: string) {
    const clients =
      this.clientsBySession.get(sessionId) ?? new Set<WebSocket>();
    clients.add(client);
    this.clientsBySession.set(sessionId, clients);

    const sessions = this.sessionsByClient.get(client) ?? new Set<string>();
    sessions.add(sessionId);
    this.sessionsByClient.set(client, sessions);
  }

  private removeClient(client: WebSocket) {
    const sessions = this.sessionsByClient.get(client);

    if (!sessions) {
      return;
    }

    for (const sessionId of sessions) {
      const clients = this.clientsBySession.get(sessionId);
      clients?.delete(client);

      if (!clients?.size) {
        this.clientsBySession.delete(sessionId);
      }
    }

    this.sessionsByClient.delete(client);
  }
}

function decodePayload(payload: RawData) {
  if (typeof payload === 'string') {
    return payload;
  }

  if (Buffer.isBuffer(payload)) {
    return payload.toString('utf8');
  }

  if (Array.isArray(payload)) {
    return Buffer.concat(payload).toString('utf8');
  }

  return Buffer.from(payload).toString('utf8');
}
