import { Logger } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { ClientMeetingEvent, ServerMeetingEvent } from '@mila/shared';
import { RawData, WebSocket } from 'ws';
import { MeetingsService } from './meetings.service';
import { AuthService } from '../auth/auth.service';
import type { JwtPayload } from '../auth/jwt.strategy';

type IncomingRequest = {
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type AuthedSocket = WebSocket & { __userId?: string };

@WebSocketGateway({ path: '/meetings/live' })
export class MeetingsGateway {
  private readonly logger = new Logger(MeetingsGateway.name);
  private readonly clientsBySession = new Map<string, Set<AuthedSocket>>();
  private readonly sessionsByClient = new Map<AuthedSocket, Set<string>>();

  constructor(
    private readonly meetingsService: MeetingsService,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async handleConnection(client: AuthedSocket, request?: IncomingRequest) {
    const token = extractToken(request);
    if (!token) {
      this.rejectAndClose(client, 'UNAUTHENTICATED', 'Missing auth token.');
      return;
    }

    // Attach listeners synchronously and buffer frames — clients may send
    // their first event on 'open', before the awaited JWT verify and DB
    // lookup below complete. ws does not queue messages without a listener.
    const pending: RawData[] = [];
    let ready = false;
    client.on('message', (payload: RawData) => {
      if (!ready) {
        pending.push(payload);
        return;
      }
      void this.handleMessage(client, decodePayload(payload));
    });
    client.on('close', () => {
      this.removeClient(client);
    });

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret:
          process.env.JWT_SECRET ?? 'mila-dev-secret-do-not-use-in-prod',
      });
      const user = await this.auth.findById(payload.sub);
      if (!user) {
        this.rejectAndClose(client, 'UNAUTHENTICATED', 'Account not found.');
        return;
      }
      client.__userId = user.id;
    } catch {
      this.rejectAndClose(client, 'UNAUTHENTICATED', 'Invalid auth token.');
      return;
    }

    ready = true;
    for (const queued of pending) {
      void this.handleMessage(client, decodePayload(queued));
    }
    pending.length = 0;
  }

  private async handleMessage(client: AuthedSocket, rawPayload: string) {
    const userId = client.__userId;
    if (!userId) {
      this.rejectAndClose(client, 'UNAUTHENTICATED', 'Connection not authed.');
      return;
    }

    try {
      const event = JSON.parse(rawPayload) as ClientMeetingEvent;

      if (event.type === 'start') {
        const detail = await this.meetingsService.getSessionForClient(
          userId,
          event.sessionId,
        );

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
        const result = await this.meetingsService.ingestAudioChunk(
          userId,
          event,
        );

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
        const result = await this.meetingsService.ingestTranscriptChunk(
          userId,
          event,
        );

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
          userId,
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

  private addClientToSession(client: AuthedSocket, sessionId: string) {
    const clients =
      this.clientsBySession.get(sessionId) ?? new Set<AuthedSocket>();
    clients.add(client);
    this.clientsBySession.set(sessionId, clients);

    const sessions = this.sessionsByClient.get(client) ?? new Set<string>();
    sessions.add(sessionId);
    this.sessionsByClient.set(client, sessions);
  }

  private removeClient(client: AuthedSocket) {
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

  private rejectAndClose(
    client: WebSocket,
    code: 'UNAUTHENTICATED' | 'FORBIDDEN',
    message: string,
  ) {
    this.send(client, { type: 'error', code, message });
    try {
      client.close(4401, message);
    } catch {
      // ignore: socket may already be closing
    }
  }
}

function extractToken(request?: IncomingRequest): string | null {
  if (!request) return null;
  const auth = request.headers?.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim() || null;
  }
  if (request.url) {
    try {
      const url = new URL(request.url, 'http://localhost');
      const fromQuery = url.searchParams.get('token');
      if (fromQuery) return fromQuery;
    } catch {
      // ignore
    }
  }
  return null;
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
