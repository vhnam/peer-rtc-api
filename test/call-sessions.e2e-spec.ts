import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { parseCorsOrigins } from '../src/common/cors-origins.js';
import { SocketIoAdapter } from '../src/common/socket-io.adapter.js';
import {
  CONSUMER_ORIGIN,
  PROVIDER_ORIGIN,
} from '../src/modules/auth/app-origins.js';
import { auth } from '../src/modules/auth/auth.js';
import { CALL_SOCKET_EVENTS } from '../src/modules/call-sessions/call-session.events.js';

const PASSWORD = 'Password123!';

function uniqueEmail(label: string) {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

function cookieHeader(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  if (!raw) {
    return '';
  }
  const cookies = Array.isArray(raw) ? raw : [raw];
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

async function seedProviderAccount(input: {
  email: string;
  name: string;
  password: string;
}) {
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser(
    {
      email: input.email,
      name: input.name,
      role: 'provider',
      emailVerified: false,
    },
    { method: 'admin' },
  );
  const password = await context.password.hash(input.password);
  await context.internalAdapter.createAccount({
    userId: user.id,
    accountId: user.id,
    providerId: 'credential',
    password,
    issuer: 'local:credential',
  });
  return user;
}

function onceEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${event}`));
    }, 8_000);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('Call session sockets (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let origin: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({
      bodyParser: false,
    });
    app.enableCors({
      origin: parseCorsOrigins(),
      credentials: true,
    });
    app.useWebSocketAdapter(new SocketIoAdapter(app));
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer();
    origin = await app.getUrl();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  async function signUpConsumer(label: string) {
    const email = uniqueEmail(label);
    const signUp = await request(server)
      .post('/api/auth/sign-up/email')
      .set('Origin', CONSUMER_ORIGIN)
      .send({ name: label, email, password: PASSWORD })
      .expect(200);
    return {
      user: signUp.body.user as { id: string; email: string },
      cookies: cookieHeader(signUp),
    };
  }

  async function signInProvider(label: string) {
    const email = uniqueEmail(label);
    const user = await seedProviderAccount({
      email,
      name: label,
      password: PASSWORD,
    });
    const signIn = await request(server)
      .post('/api/auth/sign-in/email')
      .set('Origin', PROVIDER_ORIGIN)
      .send({ email, password: PASSWORD, role: 'provider' })
      .expect(200);
    return { user, cookies: cookieHeader(signIn) };
  }

  async function acceptedConsult() {
    const consumer = await signUpConsumer('call-consumer');
    const provider = await signInProvider('call-provider');
    const created = await request(server)
      .post('/api/consult-requests')
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .send({ note: 'need a call' })
      .expect(201);
    await request(server)
      .patch(`/api/consult-requests/${created.body.id}`)
      .set('Origin', PROVIDER_ORIGIN)
      .set('Cookie', provider.cookies)
      .send({ status: 'accepted' })
      .expect(200);
    return {
      consumer,
      provider,
      consultRequestId: created.body.id as string,
      consumerId: consumer.user.id,
    };
  }

  function connect(cookies: string, appOrigin: string) {
    return io(origin, {
      extraHeaders: {
        Cookie: cookies,
        Origin: appOrigin,
      },
      transports: ['websocket'],
      forceNew: true,
    });
  }

  async function connected(socket: Socket) {
    if (socket.connected) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (error) => reject(error));
    });
  }

  it('sends provider_joined with consultRequestId, then consumer_accepted', async () => {
    const { consumer, provider, consultRequestId, consumerId } =
      await acceptedConsult();
    const providerSocket = connect(provider.cookies, PROVIDER_ORIGIN);
    const consumerSocket = connect(consumer.cookies, CONSUMER_ORIGIN);

    try {
      await Promise.all([connected(providerSocket), connected(consumerSocket)]);

      const providerJoined = onceEvent<{
        consultRequestId: string;
      }>(consumerSocket, CALL_SOCKET_EVENTS.providerJoined);
      providerSocket.emit(CALL_SOCKET_EVENTS.providerJoined, {
        consultRequestId,
        consumerId,
      });
      const started = await providerJoined;
      expect(started).toEqual({ consultRequestId });

      const accepted = onceEvent<{
        consultRequestId: string;
        consumer: { id: string; name: string; email: string; image: null };
      }>(providerSocket, CALL_SOCKET_EVENTS.consumerAccepted);
      consumerSocket.emit(CALL_SOCKET_EVENTS.consumerAccepted, {
        consultRequestId,
      });
      await expect(accepted).resolves.toEqual({
        consultRequestId,
        consumer: {
          id: consumer.user.id,
          name: 'call-consumer',
          email: consumer.user.email,
          image: null,
        },
      });
    } finally {
      providerSocket.close();
      consumerSocket.close();
    }
  });

  it('sends consumer_declined with consultRequestId when the consumer ignores the call', async () => {
    const { consumer, provider, consultRequestId, consumerId } =
      await acceptedConsult();
    const providerSocket = connect(provider.cookies, PROVIDER_ORIGIN);
    const consumerSocket = connect(consumer.cookies, CONSUMER_ORIGIN);

    try {
      await Promise.all([connected(providerSocket), connected(consumerSocket)]);

      const providerJoined = onceEvent<{ consultRequestId: string }>(
        consumerSocket,
        CALL_SOCKET_EVENTS.providerJoined,
      );
      providerSocket.emit(CALL_SOCKET_EVENTS.providerJoined, {
        consultRequestId,
        consumerId,
      });
      await expect(providerJoined).resolves.toEqual({ consultRequestId });

      const declined = onceEvent<{
        consultRequestId: string;
        consumerId: string;
      }>(providerSocket, CALL_SOCKET_EVENTS.consumerDeclined);
      consumerSocket.emit(CALL_SOCKET_EVENTS.consumerDeclined, {
        consultRequestId,
      });
      await expect(declined).resolves.toEqual({
        consultRequestId,
        consumerId,
      });
    } finally {
      providerSocket.close();
      consumerSocket.close();
    }
  });

  it('forwards consumer_not_pickup from the provider to the consumer', async () => {
    const { consumer, provider, consultRequestId, consumerId } =
      await acceptedConsult();
    const providerSocket = connect(provider.cookies, PROVIDER_ORIGIN);
    const consumerSocket = connect(consumer.cookies, CONSUMER_ORIGIN);

    try {
      await Promise.all([connected(providerSocket), connected(consumerSocket)]);

      const providerJoined = onceEvent<{ consultRequestId: string }>(
        consumerSocket,
        CALL_SOCKET_EVENTS.providerJoined,
      );
      providerSocket.emit(CALL_SOCKET_EVENTS.providerJoined, {
        consultRequestId,
        consumerId,
      });
      await expect(providerJoined).resolves.toEqual({ consultRequestId });

      const notPickup = onceEvent<{ consultRequestId: string }>(
        consumerSocket,
        CALL_SOCKET_EVENTS.consumerNotPickup,
      );
      providerSocket.emit(CALL_SOCKET_EVENTS.consumerNotPickup, {
        consultRequestId,
      });
      await expect(notPickup).resolves.toEqual({ consultRequestId });
    } finally {
      providerSocket.close();
      consumerSocket.close();
    }
  });

  it('forwards provider_ended from the provider to the consumer', async () => {
    const { consumer, provider, consultRequestId, consumerId } =
      await acceptedConsult();
    const providerSocket = connect(provider.cookies, PROVIDER_ORIGIN);
    const consumerSocket = connect(consumer.cookies, CONSUMER_ORIGIN);

    try {
      await Promise.all([connected(providerSocket), connected(consumerSocket)]);

      const providerJoined = onceEvent<{ consultRequestId: string }>(
        consumerSocket,
        CALL_SOCKET_EVENTS.providerJoined,
      );
      providerSocket.emit(CALL_SOCKET_EVENTS.providerJoined, {
        consultRequestId,
        consumerId,
      });
      await expect(providerJoined).resolves.toEqual({ consultRequestId });

      const accepted = onceEvent<{ consultRequestId: string }>(
        providerSocket,
        CALL_SOCKET_EVENTS.consumerAccepted,
      );
      consumerSocket.emit(CALL_SOCKET_EVENTS.consumerAccepted, {
        consultRequestId,
      });
      await accepted;

      const providerEnded = onceEvent<{ consultRequestId: string }>(
        consumerSocket,
        CALL_SOCKET_EVENTS.providerEnded,
      );
      providerSocket.emit(CALL_SOCKET_EVENTS.providerEnded, {
        consultRequestId,
      });
      await expect(providerEnded).resolves.toEqual({ consultRequestId });
    } finally {
      providerSocket.close();
      consumerSocket.close();
    }
  });

  it('forwards consumer_ended from the consumer to the provider', async () => {
    const { consumer, provider, consultRequestId, consumerId } =
      await acceptedConsult();
    const providerSocket = connect(provider.cookies, PROVIDER_ORIGIN);
    const consumerSocket = connect(consumer.cookies, CONSUMER_ORIGIN);

    try {
      await Promise.all([connected(providerSocket), connected(consumerSocket)]);

      const providerJoined = onceEvent<{ consultRequestId: string }>(
        consumerSocket,
        CALL_SOCKET_EVENTS.providerJoined,
      );
      providerSocket.emit(CALL_SOCKET_EVENTS.providerJoined, {
        consultRequestId,
        consumerId,
      });
      await expect(providerJoined).resolves.toEqual({ consultRequestId });

      const accepted = onceEvent<{ consultRequestId: string }>(
        providerSocket,
        CALL_SOCKET_EVENTS.consumerAccepted,
      );
      consumerSocket.emit(CALL_SOCKET_EVENTS.consumerAccepted, {
        consultRequestId,
      });
      await accepted;

      const consumerEnded = onceEvent<{ consultRequestId: string }>(
        providerSocket,
        CALL_SOCKET_EVENTS.consumerEnded,
      );
      consumerSocket.emit(CALL_SOCKET_EVENTS.consumerEnded, {
        consultRequestId,
      });
      await expect(consumerEnded).resolves.toEqual({ consultRequestId });
    } finally {
      providerSocket.close();
      consumerSocket.close();
    }
  });
});
