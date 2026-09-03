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
import { serializeUser } from '../consult-requests/consult-request.serialize.js';
import {
  parseConsumerResponseBody,
  parseProviderJoinedBody,
} from './call-session.dto.js';
import { CALL_SOCKET_EVENTS } from './call-session.events.js';
import type {
  CallAcceptedPayload,
  CallDeclinedPayload,
  CallRoomPayload,
} from './call-session.types.js';
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
      this.emitToUser(consumerId, CALL_SOCKET_EVENTS.providerJoined, payload);
    } catch (error) {
      throw asWsException(error, 'Could not start the call');
    }
  }

  @SubscribeMessage(CALL_SOCKET_EVENTS.consumerAccepted)
  async consumerAccepted(
    @MessageBody() body: unknown,
    @Session() session: UserSession<typeof auth>,
  ) {
    try {
      const { consultRequestId } = parseConsumerResponseBody(body);
      const responded = await this.callSessions.respondToCall(
        session,
        consultRequestId,
        CALL_SOCKET_EVENTS.consumerAccepted,
      );
      const payload: CallAcceptedPayload = {
        consultRequestId: responded.session.consultRequestId,
        consumer: serializeUser(session.user),
      };
      this.emitToUser(
        responded.session.providerId,
        CALL_SOCKET_EVENTS.consumerAccepted,
        payload,
      );
    } catch (error) {
      throw asWsException(error, 'Call signaling failed');
    }
  }

  @SubscribeMessage(CALL_SOCKET_EVENTS.consumerDeclined)
  async consumerDeclined(
    @MessageBody() body: unknown,
    @Session() session: UserSession<typeof auth>,
  ) {
    try {
      const { consultRequestId } = parseConsumerResponseBody(body);
      const responded = await this.callSessions.respondToCall(
        session,
        consultRequestId,
        CALL_SOCKET_EVENTS.consumerDeclined,
      );
      const payload: CallDeclinedPayload = {
        consultRequestId: responded.session.consultRequestId,
        consumerId: responded.session.consumerId,
      };
      this.emitToUser(
        responded.session.providerId,
        CALL_SOCKET_EVENTS.consumerDeclined,
        payload,
      );
    } catch (error) {
      throw asWsException(error, 'Call signaling failed');
    }
  }

  @SubscribeMessage(CALL_SOCKET_EVENTS.providerEnded)
  async providerEnded(
    @MessageBody() body: unknown,
    @Session() session: UserSession<typeof auth>,
  ) {
    try {
      const { consultRequestId } = parseConsumerResponseBody(body);
      const ended = await this.callSessions.endCall(
        session,
        consultRequestId,
        CALL_SOCKET_EVENTS.providerEnded,
      );
      const payload: CallRoomPayload = {
        consultRequestId: ended.session.consultRequestId,
      };
      this.emitToUser(
        ended.session.consumerId,
        CALL_SOCKET_EVENTS.providerEnded,
        payload,
      );
    } catch (error) {
      throw asWsException(error, 'Call signaling failed');
    }
  }

  @SubscribeMessage(CALL_SOCKET_EVENTS.consumerEnded)
  async consumerEnded(
    @MessageBody() body: unknown,
    @Session() session: UserSession<typeof auth>,
  ) {
    try {
      const { consultRequestId } = parseConsumerResponseBody(body);
      const ended = await this.callSessions.endCall(
        session,
        consultRequestId,
        CALL_SOCKET_EVENTS.consumerEnded,
      );
      const payload: CallRoomPayload = {
        consultRequestId: ended.session.consultRequestId,
      };
      this.emitToUser(
        ended.session.providerId,
        CALL_SOCKET_EVENTS.consumerEnded,
        payload,
      );
    } catch (error) {
      throw asWsException(error, 'Call signaling failed');
    }
  }

  private emitToUser(
    userId: string,
    event: string,
    payload: CallRoomPayload | CallAcceptedPayload | CallDeclinedPayload,
  ) {
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
