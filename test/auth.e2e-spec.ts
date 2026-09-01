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

/** SuperTest skips Secure cookies over HTTP; forward name=value pairs manually. */
function cookieHeader(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  if (!raw) {
    return '';
  }
  const cookies = Array.isArray(raw) ? raw : [raw];
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

/** Providers cannot self-register; seed via Better Auth internals for login tests. */
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

describe('Auth flows (e2e)', () => {
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

  describe('consumer app (https://localhost:3000)', () => {
    it('registers as consumer and ignores client-supplied role', async () => {
      const email = uniqueEmail('consumer-register');

      const res = await request(server)
        .post('/api/auth/sign-up/email')
        .set('Origin', CONSUMER_ORIGIN)
        .send({
          name: 'E2E Consumer',
          email,
          password: PASSWORD,
          role: 'provider',
        })
        .expect(200);

      expect(res.body.user).toMatchObject({
        email,
        role: 'consumer',
      });
      expect(res.body.token).toEqual(expect.any(String));
    });

    it('signs in with email, password, and role', async () => {
      const email = uniqueEmail('consumer-signin');

      await request(server)
        .post('/api/auth/sign-up/email')
        .set('Origin', CONSUMER_ORIGIN)
        .send({
          name: 'E2E Consumer Signin',
          email,
          password: PASSWORD,
        })
        .expect(200);

      const signIn = await request(server)
        .post('/api/auth/sign-in/email')
        .set('Origin', CONSUMER_ORIGIN)
        .send({ email, password: PASSWORD, role: 'consumer' })
        .expect(200);

      expect(signIn.body.user).toMatchObject({
        email,
        role: 'consumer',
      });

      const session = await request(server)
        .get('/api/auth/get-session')
        .set('Origin', CONSUMER_ORIGIN)
        .set('Cookie', cookieHeader(signIn))
        .expect(200);

      expect(session.body.user).toMatchObject({
        email,
        role: 'consumer',
      });
    });

    it('rejects sign-in when role is missing', async () => {
      const email = uniqueEmail('missing-role');

      await request(server)
        .post('/api/auth/sign-up/email')
        .set('Origin', CONSUMER_ORIGIN)
        .send({
          name: 'Missing Role',
          email,
          password: PASSWORD,
        })
        .expect(200);

      const res = await request(server)
        .post('/api/auth/sign-in/email')
        .set('Origin', CONSUMER_ORIGIN)
        .send({ email, password: PASSWORD })
        .expect(400);

      expect(res.body.message).toMatch(/role must be one of/i);
    });

    it('rejects consumer-app sign-in for provider accounts', async () => {
      const email = uniqueEmail('provider-on-consumer');
      await seedProviderAccount({
        email,
        name: 'Provider On Consumer App',
        password: PASSWORD,
      });

      const res = await request(server)
        .post('/api/auth/sign-in/email')
        .set('Origin', CONSUMER_ORIGIN)
        .send({ email, password: PASSWORD, role: 'consumer' })
        .expect(403);

      expect(res.body.message).toMatch(/consumer accounts only/i);
    });

    it('rejects sign-in with the wrong password', async () => {
      const email = uniqueEmail('wrong-password');

      await request(server)
        .post('/api/auth/sign-up/email')
        .set('Origin', CONSUMER_ORIGIN)
        .send({
          name: 'E2E Wrong Password',
          email,
          password: PASSWORD,
        })
        .expect(200);

      await request(server)
        .post('/api/auth/sign-in/email')
        .set('Origin', CONSUMER_ORIGIN)
        .send({
          email,
          password: 'not-the-password',
          role: 'consumer',
        })
        .expect(401);
    });

    it('signs out and clears the session', async () => {
      const email = uniqueEmail('signout');

      const signUp = await request(server)
        .post('/api/auth/sign-up/email')
        .set('Origin', CONSUMER_ORIGIN)
        .send({
          name: 'E2E Signout',
          email,
          password: PASSWORD,
        })
        .expect(200);

      const cookies = cookieHeader(signUp);

      await request(server)
        .post('/api/auth/sign-out')
        .set('Origin', CONSUMER_ORIGIN)
        .set('Cookie', cookies)
        .send({})
        .expect(200);

      const session = await request(server)
        .get('/api/auth/get-session')
        .set('Origin', CONSUMER_ORIGIN)
        .set('Cookie', cookies)
        .expect(200);

      expect(session.body).toBeNull();
    });
  });

  describe('provider app (https://localhost:4000)', () => {
    it('rejects registration', async () => {
      const res = await request(server)
        .post('/api/auth/sign-up/email')
        .set('Origin', PROVIDER_ORIGIN)
        .send({
          name: 'Blocked Provider Register',
          email: uniqueEmail('provider-register'),
          password: PASSWORD,
        })
        .expect(403);

      expect(res.body.message).toMatch(
        /Registration is only allowed from the consumer app/i,
      );
    });

    it('signs in a provider account with role in payload', async () => {
      const email = uniqueEmail('provider-signin');
      await seedProviderAccount({
        email,
        name: 'E2E Provider',
        password: PASSWORD,
      });

      const signIn = await request(server)
        .post('/api/auth/sign-in/email')
        .set('Origin', PROVIDER_ORIGIN)
        .send({ email, password: PASSWORD, role: 'provider' })
        .expect(200);

      expect(signIn.body.user).toMatchObject({
        email,
        role: 'provider',
      });

      const session = await request(server)
        .get('/api/auth/get-session')
        .set('Origin', PROVIDER_ORIGIN)
        .set('Cookie', cookieHeader(signIn))
        .expect(200);

      expect(session.body.user).toMatchObject({
        email,
        role: 'provider',
      });
    });

    it('rejects provider-app sign-in for consumer accounts', async () => {
      const email = uniqueEmail('consumer-on-provider');

      await request(server)
        .post('/api/auth/sign-up/email')
        .set('Origin', CONSUMER_ORIGIN)
        .send({
          name: 'Consumer On Provider App',
          email,
          password: PASSWORD,
        })
        .expect(200);

      const res = await request(server)
        .post('/api/auth/sign-in/email')
        .set('Origin', PROVIDER_ORIGIN)
        .send({ email, password: PASSWORD, role: 'provider' })
        .expect(403);

      expect(res.body.message).toMatch(/provider accounts only/i);
    });
  });
});
