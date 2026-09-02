import { Logger, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import {
  AuthGuard,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { Server, Socket } from 'socket.io';

import { parseCorsOrigins } from '../../common/cors-origins.js';
import { auth } from '../auth/auth.js';
import {
  parseConsumerResponseBody,
  parseProviderJoinedBody,
} from './call-session.dto.js';
import { CALL_SOCKET_EVENTS } from './call-session.events.js';
import type { CallRoomPayload } from './call-session.types.js';
import { CallSessionsService } from './call-sessions.service.js';

@WebSocketGateway({
  cors: {
    origin: parseCorsOrigins(),
    credentials: true,
  },
})
@UseGuards(AuthGuard)
export class CallSessionsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(CallSessionsGateway.name);
  private readonly socketsByUser = new Map<string, Set<string>>();

  @WebSocketServer()
  server: Server;

  constructor(private readonly callSessions: CallSessionsService) {}

  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(socket.handshake.headers),
        });
        if (!session?.user.id) {
          next(new Error('UNAUTHORIZED'));
          return;
        }
        socket.data.userId = session.user.id;
        next();
      } catch (error) {
        this.logger.warn(`Socket auth failed: ${String(error)}`);
        next(new Error('UNAUTHORIZED'));
      }
    });
  }

  handleConnection(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      client.disconnect();
      return;
    }
    const sockets = this.socketsByUser.get(userId) ?? new Set<string>();
    sockets.add(client.id);
    this.socketsByUser.set(userId, sockets);
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      return;
    }
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) {
      return;
    }
    sockets.delete(client.id);
    if (sockets.size === 0) {
      this.socketsByUser.delete(userId);
    }
  }

  @SubscribeMessage(CALL_SOCKET_EVENTS.providerJoined)
  async providerJoined(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
    @Session() session: UserSession<typeof auth>,
  ) {
    try {
      const { consultRequestId, consumerId } = parseProviderJoinedBody(body);
      const started = await this.callSessions.startCall(
        session,
        consultRequestId,
      );
      const payload: CallRoomPayload = {
        consultRequestId: started.session.consultRequestId,
      };
      this.emitToUser(
        consumerId,
        CALL_SOCKET_EVENTS.providerJoined,
        payload,
      );
    } catch (error) {
      throw asWsException(error, 'Could not start the call');
    }
  }

  @SubscribeMessage(CALL_SOCKET_EVENTS.consumerAccepted)
  async consumerAccepted(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
    @Session() session: UserSession<typeof auth>,
  ) {
    return this.consumerResponded(client, session, body, 'consumer_accepted');
  }

  @SubscribeMessage(CALL_SOCKET_EVENTS.consumerDeclined)
  async consumerDeclined(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
    @Session() session: UserSession<typeof auth>,
  ) {
    return this.consumerResponded(client, session, body, 'consumer_declined');
  }

  private async consumerResponded(
    _client: Socket,
    session: UserSession<typeof auth>,
    body: unknown,
    event: 'consumer_accepted' | 'consumer_declined',
  ) {
    try {
      const { consultRequestId } = parseConsumerResponseBody(body);
      const responded = await this.callSessions.respondToCall(
        session,
        consultRequestId,
        event,
      );
      const payload: CallRoomPayload = {
        consultRequestId: responded.session.consultRequestId,
      };
      this.emitToUser(responded.session.providerId, event, payload);
    } catch (error) {
      throw asWsException(error, 'Call signaling failed');
    }
  }

  private emitToUser(userId: string, event: string, payload: CallRoomPayload) {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) {
      return;
    }
    for (const socketId of sockets) {
      this.server.to(socketId).emit(event, payload);
    }
  }
}

function asWsException(error: unknown, fallback: string): WsException {
  const message = error instanceof Error ? error.message : fallback;
  return new WsException(message);
}
