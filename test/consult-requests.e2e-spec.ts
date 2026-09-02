import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { parseCorsOrigins } from '../src/common/cors-origins.js';
import {
  CONSUMER_ORIGIN,
  PROVIDER_ORIGIN,
} from '../src/modules/auth/app-origins.js';
import { auth } from '../src/modules/auth/auth.js';

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

describe('Consult requests (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

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
    await app.init();
    server = app.getHttpServer();
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
      email,
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
    return { email, user, cookies: cookieHeader(signIn) };
  }

  async function createRequest(
    cookies: string,
    body: Record<string, unknown> = {},
  ) {
    const created = await request(server)
      .post('/api/consult-requests')
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', cookies)
      .send(body)
      .expect(201);
    return created.body as {
      id: string;
      requestId: string;
      status: string;
      note: string | null;
    };
  }

  it('lets a consumer create and list a consult request', async () => {
    const consumer = await signUpConsumer('consult-consumer');
    const created = await createRequest(consumer.cookies, {
      note: 'Need a consult',
    });

    expect(created).toMatchObject({
      consumerId: consumer.user.id,
      providerId: null,
      status: 'pending',
      note: 'Need a consult',
      requestId: expect.stringMatching(/^\d{8}\d{3}$/),
      consumer: {
        id: consumer.user.id,
        name: 'consult-consumer',
        email: consumer.user.email,
      },
    });
    expect(created.id).toEqual(expect.any(String));
    expect(created.requestId).toMatch(/^\d{8}\d{3}$/);

    const listed = await request(server)
      .get('/api/consult-requests')
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .expect(200);

    expect(listed.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          status: 'pending',
          consumer: expect.objectContaining({ id: consumer.user.id }),
        }),
      ]),
    );
    expect(listed.body).toMatchObject({
      total: expect.any(Number),
      page: 1,
      limit: 20,
    });
  });

  it('filters consult requests by time', async () => {
    const consumer = await signUpConsumer('consult-time');
    const created = await createRequest(consumer.cookies, { note: 'now' });

    const today = await request(server)
      .get('/api/consult-requests')
      .query({ time: 'today' })
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .expect(200);
    expect(today.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );

    const previousWeek = await request(server)
      .get('/api/consult-requests')
      .query({ time: 'previous-week' })
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .expect(200);
    expect(previousWeek.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );
  });

  it('filters consult requests by requestId', async () => {
    const consumer = await signUpConsumer('consult-by-request-id');
    const first = await createRequest(consumer.cookies, { note: 'first' });
    const second = await createRequest(consumer.cookies, { note: 'second' });

    const listed = await request(server)
      .get('/api/consult-requests')
      .query({ requestId: first.requestId })
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .expect(200);

    expect(listed.body.data).toEqual([
      expect.objectContaining({
        id: first.id,
        requestId: first.requestId,
      }),
    ]);
    expect(listed.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: second.id })]),
    );
    expect(listed.body.total).toBe(1);
  });

  it('filters a consumer list by status', async () => {
    const consumer = await signUpConsumer('consult-filter');
    const open = await createRequest(consumer.cookies, { note: 'open' });
    await request(server)
      .patch(`/api/consult-requests/${open.id}`)
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .send({ status: 'cancelled' })
      .expect(200);
    const stillOpen = await createRequest(consumer.cookies, { note: 'still' });

    const pending = await request(server)
      .get('/api/consult-requests')
      .query({ status: 'pending' })
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .expect(200);

    expect(pending.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: stillOpen.id })]),
    );
    expect(pending.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: open.id })]),
    );
    expect(pending.body.total).toBe(1);
  });

  it('paginates consult requests with page and limit', async () => {
    const consumer = await signUpConsumer('consult-page');
    const first = await createRequest(consumer.cookies, { note: 'one' });
    const second = await createRequest(consumer.cookies, { note: 'two' });
    const third = await createRequest(consumer.cookies, { note: 'three' });

    const page1 = await request(server)
      .get('/api/consult-requests')
      .query({ page: 1, limit: 2 })
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .expect(200);

    expect(page1.body).toMatchObject({ total: 3, page: 1, limit: 2 });
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.data.map((row: { id: string }) => row.id)).toEqual([
      third.id,
      second.id,
    ]);

    const page2 = await request(server)
      .get('/api/consult-requests')
      .query({ page: 2, limit: 2 })
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .expect(200);

    expect(page2.body).toMatchObject({ total: 3, page: 2, limit: 2 });
    expect(page2.body.data.map((row: { id: string }) => row.id)).toEqual([
      first.id,
    ]);
  });

  it('assigns sequential daily requestIds', async () => {
    const consumer = await signUpConsumer('consult-request-id');
    const first = await createRequest(consumer.cookies, { note: 'first' });
    const second = await createRequest(consumer.cookies, { note: 'second' });

    expect(first.requestId).toMatch(/^\d{8}\d{3}$/);
    expect(second.requestId.slice(0, 8)).toBe(first.requestId.slice(0, 8));
    expect(Number(second.requestId.slice(8))).toBe(
      Number(first.requestId.slice(8)) + 1,
    );
  });

  it('lets a consumer update the note and cancel a pending request', async () => {
    const consumer = await signUpConsumer('consult-cancel');
    const created = await createRequest(consumer.cookies, { note: 'old' });

    const noted = await request(server)
      .patch(`/api/consult-requests/${created.id}`)
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .send({ note: 'updated note' })
      .expect(200);
    expect(noted.body.note).toBe('updated note');

    const cancelled = await request(server)
      .patch(`/api/consult-requests/${created.id}`)
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .send({ status: 'cancelled' })
      .expect(200);
    expect(cancelled.body.status).toBe('cancelled');
  });

  it('lets a provider accept a pending consult request', async () => {
    const consumer = await signUpConsumer('consult-accept-consumer');
    const created = await createRequest(consumer.cookies, {
      note: 'Please take this',
    });
    const provider = await signInProvider('consult-accept-provider');

    const listed = await request(server)
      .get('/api/consult-requests')
      .set('Origin', PROVIDER_ORIGIN)
      .set('Cookie', provider.cookies)
      .expect(200);
    expect(listed.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );

    const accepted = await request(server)
      .patch(`/api/consult-requests/${created.id}`)
      .set('Origin', PROVIDER_ORIGIN)
      .set('Cookie', provider.cookies)
      .send({ status: 'accepted' })
      .expect(200);

    expect(accepted.body).toMatchObject({
      id: created.id,
      status: 'accepted',
      providerId: provider.user.id,
    });
    expect(accepted.body.acceptedAt).toEqual(expect.any(String));
  });

  it('lets the consumer close an accepted request', async () => {
    const consumer = await signUpConsumer('consult-close-consumer');
    const created = await createRequest(consumer.cookies);
    const provider = await signInProvider('consult-close-provider');

    await request(server)
      .patch(`/api/consult-requests/${created.id}`)
      .set('Origin', PROVIDER_ORIGIN)
      .set('Cookie', provider.cookies)
      .send({ status: 'accepted' })
      .expect(200);

    const closed = await request(server)
      .patch(`/api/consult-requests/${created.id}`)
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .send({ status: 'closed' })
      .expect(200);

    expect(closed.body).toMatchObject({
      id: created.id,
      status: 'closed',
    });
    expect(closed.body.closedAt).toEqual(expect.any(String));
  });

  it('creates an unassigned request even if providerId is sent', async () => {
    const consumer = await signUpConsumer('consult-ignore-provider');
    const provider = await signInProvider('consult-ignore-provider-user');

    const created = await createRequest(consumer.cookies, {
      providerId: provider.user.id,
      note: 'open queue',
    });

    expect(created).toMatchObject({
      providerId: null,
      status: 'pending',
    });
  });

  it('filters a provider list by consumerId', async () => {
    const first = await signUpConsumer('consult-by-consumer-a');
    const second = await signUpConsumer('consult-by-consumer-b');
    const fromFirst = await createRequest(first.cookies, { note: 'a' });
    const fromSecond = await createRequest(second.cookies, { note: 'b' });
    const provider = await signInProvider('consult-by-consumer-provider');

    const listed = await request(server)
      .get('/api/consult-requests')
      .query({ consumerId: first.user.id })
      .set('Origin', PROVIDER_ORIGIN)
      .set('Cookie', provider.cookies)
      .expect(200);

    expect(listed.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: fromFirst.id })]),
    );
    expect(listed.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: fromSecond.id })]),
    );
  });

  it('lets a consumer get their consult request by id', async () => {
    const consumer = await signUpConsumer('consult-get');
    const created = await createRequest(consumer.cookies, {
      note: 'Need a consult',
    });

    const found = await request(server)
      .get(`/api/consult-requests/${created.id}`)
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .expect(200);

    expect(found.body).toMatchObject({
      id: created.id,
      requestId: created.requestId,
      consumerId: consumer.user.id,
      providerId: null,
      status: 'pending',
      note: 'Need a consult',
      consumer: expect.objectContaining({ id: consumer.user.id }),
    });
  });

  it('lets a provider get an unassigned pending request by id', async () => {
    const consumer = await signUpConsumer('consult-get-provider-consumer');
    const created = await createRequest(consumer.cookies);
    const provider = await signInProvider('consult-get-provider');

    const found = await request(server)
      .get(`/api/consult-requests/${created.id}`)
      .set('Origin', PROVIDER_ORIGIN)
      .set('Cookie', provider.cookies)
      .expect(200);

    expect(found.body).toMatchObject({
      id: created.id,
      status: 'pending',
    });
  });

  it('does not let another consumer get a request by id', async () => {
    const owner = await signUpConsumer('consult-get-owner');
    const other = await signUpConsumer('consult-get-other');
    const created = await createRequest(owner.cookies, { note: 'private' });

    await request(server)
      .get(`/api/consult-requests/${created.id}`)
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', other.cookies)
      .expect(404);
  });

  it('does not list another consumer’s requests', async () => {
    const owner = await signUpConsumer('consult-owner');
    const other = await signUpConsumer('consult-other');
    const created = await createRequest(owner.cookies, { note: 'private' });

    const listed = await request(server)
      .get('/api/consult-requests')
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', other.cookies)
      .expect(200);

    expect(listed.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );
  });

  it('rejects a provider creating a consult request', async () => {
    const provider = await signInProvider('consult-provider-create');

    await request(server)
      .post('/api/consult-requests')
      .set('Origin', PROVIDER_ORIGIN)
      .set('Cookie', provider.cookies)
      .send({ note: 'nope' })
      .expect(403);
  });

  it('rejects a consumer accepting their own request', async () => {
    const consumer = await signUpConsumer('consult-self-accept');
    const created = await createRequest(consumer.cookies);

    await request(server)
      .patch(`/api/consult-requests/${created.id}`)
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .send({ status: 'accepted' })
      .expect(409);
  });

  it('rejects getting or updating an unknown request', async () => {
    const consumer = await signUpConsumer('consult-missing');
    const missingId = '00000000-0000-4000-8000-000000000000';

    await request(server)
      .get(`/api/consult-requests/${missingId}`)
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .expect(404);

    await request(server)
      .patch(`/api/consult-requests/${missingId}`)
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .send({ status: 'cancelled' })
      .expect(404);
  });

  it('rejects an invalid create body and list filter', async () => {
    const consumer = await signUpConsumer('consult-invalid');

    await request(server)
      .post('/api/consult-requests')
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .send({ note: 'x'.repeat(2001) })
      .expect(400);

    await request(server)
      .get('/api/consult-requests')
      .query({ status: 'ringing' })
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .expect(400);

    await request(server)
      .get('/api/consult-requests')
      .query({ time: 'yesterday' })
      .set('Origin', CONSUMER_ORIGIN)
      .set('Cookie', consumer.cookies)
      .expect(400);
  });

  it('rejects unauthenticated access', async () => {
    await request(server).get('/api/consult-requests').expect(401);
    await request(server).get('/api/consult-requests/req-1').expect(401);
    await request(server).post('/api/consult-requests').send({}).expect(401);
    await request(server)
      .patch('/api/consult-requests/req-1')
      .send({ status: 'cancelled' })
      .expect(401);
  });
});
