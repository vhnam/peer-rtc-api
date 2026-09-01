import { isUserRole, USER_ROLES, type UserRole } from './roles.js';

export const CONSUMER_ORIGIN = 'https://localhost:3000';
export const PROVIDER_ORIGIN = 'https://localhost:4000';

type AppOriginPolicy = {
  role: UserRole;
  canRegister: boolean;
  canSignIn: boolean;
};

export const APP_ORIGIN_POLICIES: Record<string, AppOriginPolicy> = {
  [CONSUMER_ORIGIN]: {
    role: 'consumer',
    canRegister: true,
    canSignIn: true,
  },
  [PROVIDER_ORIGIN]: {
    role: 'provider',
    canRegister: false,
    canSignIn: true,
  },
};

export function getOriginFromHeaders(
  headers: Headers | null | undefined,
): string | null {
  const origin = headers?.get('origin')?.trim();
  return origin && origin.length > 0 ? origin : null;
}

export function getAppOriginPolicy(origin: string | null | undefined) {
  if (!origin) {
    return null;
  }
  return APP_ORIGIN_POLICIES[origin] ?? null;
}

export function roleForOrigin(
  origin: string | null | undefined,
): UserRole | null {
  return getAppOriginPolicy(origin)?.role ?? null;
}

export function assertCanRegister(origin: string | null | undefined): UserRole {
  const policy = getAppOriginPolicy(origin);
  if (!policy?.canRegister) {
    throw new Error('Registration is only allowed from the consumer app');
  }
  return policy.role;
}

/**
 * Login requires `{ email, password, role }`.
 * `role` must match the Origin app and (when known) the account.
 */
export function assertCanSignIn(
  origin: string | null | undefined,
  requestedRole: unknown,
  accountRole?: unknown,
): UserRole {
  if (!isUserRole(requestedRole)) {
    throw new Error(`role must be one of: ${USER_ROLES.join(', ')}`);
  }

  const policy = getAppOriginPolicy(origin);
  if (!policy?.canSignIn) {
    throw new Error('Sign-in is not allowed from this origin');
  }
  if (requestedRole !== policy.role) {
    throw new Error(`This app is for ${policy.role} accounts only`);
  }
  if (accountRole !== undefined && accountRole !== requestedRole) {
    throw new Error(`This app is for ${policy.role} accounts only`);
  }

  return requestedRole;
}
