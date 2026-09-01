import { Logger } from '@nestjs/common';
import { APIError, betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';

import { parseCorsOrigins } from '../common/cors-origins.js';
import { env } from '../env.js';
import { db } from '../prisma/db.js';
import {
  assertCanRegister,
  assertCanSignIn,
  getOriginFromHeaders,
  roleForOrigin,
} from './app-origins.js';
import { prismaPostgresAdapter } from './prisma-adapter.js';
import { DEFAULT_USER_ROLE, isUserRole, USER_ROLES } from './roles.js';

const logger = new Logger('BetterAuth');

function authPolicyError(
  error: unknown,
  status: 'BAD_REQUEST' | 'FORBIDDEN',
): never {
  const message =
    error instanceof Error ? error.message : 'Invalid auth request';
  throw new APIError(status, { message });
}

function requestedSignInRole(body: unknown): unknown {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  return 'role' in body ? body.role : undefined;
}

export const auth = betterAuth({
  database: prismaPostgresAdapter(db),
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: parseCorsOrigins(),
  user: {
    additionalFields: {
      role: {
        type: [...USER_ROLES],
        required: true,
        defaultValue: DEFAULT_USER_ROLE,
        // Registration role is derived from Origin, never from client input.
        input: false,
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const origin = getOriginFromHeaders(ctx.headers);

      if (ctx.path === '/sign-up/email') {
        try {
          assertCanRegister(origin);
        } catch (error) {
          authPolicyError(error, 'FORBIDDEN');
        }
        return;
      }

      if (ctx.path === '/sign-in/email') {
        try {
          // Login payload must include role; it must match this Origin's app.
          assertCanSignIn(origin, requestedSignInRole(ctx.body));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Invalid auth request';
          authPolicyError(
            error,
            message.startsWith('role must be') ? 'BAD_REQUEST' : 'FORBIDDEN',
          );
        }
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => {
          // Internal/admin creates may omit request context and set role directly.
          if (!context) {
            const role =
              'role' in user && isUserRole(user.role)
                ? user.role
                : DEFAULT_USER_ROLE;
            return { data: { ...user, role } };
          }

          try {
            const role = assertCanRegister(
              getOriginFromHeaders(context.headers),
            );
            return { data: { ...user, role } };
          } catch (error) {
            authPolicyError(error, 'FORBIDDEN');
          }
        },
      },
    },
    session: {
      create: {
        before: async (session, context) => {
          // Confirm the account role matches this Origin's app.
          // (Better Auth may strip non-schema body fields before this hook.)
          if (!context || context.path !== '/sign-in/email') {
            return;
          }

          const origin = getOriginFromHeaders(context.headers);
          const expectedRole = roleForOrigin(origin);
          const user = (await context.context.internalAdapter.findUserById(
            session.userId,
          )) as { role?: unknown } | null;
          if (!user) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Invalid credentials',
            });
          }

          try {
            assertCanSignIn(origin, expectedRole, user.role);
          } catch (error) {
            authPolicyError(error, 'FORBIDDEN');
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      logger.log(`Password reset for ${user.email}: ${url}`);
    },
  },
  secret: env.BETTER_AUTH_SECRET,
});
