import { User } from 'better-auth';

import type {
  ConsultRequestDto,
  ConsultRequestRow,
} from './consult-request.types.js';

export function serializeUser(user: {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
  } as User;
}

export function serializeConsultRequest(
  row: ConsultRequestRow,
): ConsultRequestDto {
  if (!row.consumer) {
    throw new Error('Consult request is missing consumer');
  }
  return {
    id: row.id,
    requestId: row.requestId,
    consumerId: row.consumerId,
    providerId: row.providerId,
    status: row.status,
    note: row.note,
    createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
    acceptedAt: toIsoString(row.acceptedAt),
    closedAt: toIsoString(row.closedAt),
    consumer: serializeUser(row.consumer),
    provider: row.provider ? serializeUser(row.provider) : null,
  };
}

export function toIsoString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    const maybe = value as {
      epochMilliseconds?: number | bigint;
      toJSON?: () => unknown;
    };
    if (typeof maybe.epochMilliseconds === 'number') {
      return new Date(maybe.epochMilliseconds).toISOString();
    }
    if (typeof maybe.epochMilliseconds === 'bigint') {
      return new Date(Number(maybe.epochMilliseconds)).toISOString();
    }
    if (typeof maybe.toJSON === 'function') {
      const json = maybe.toJSON();
      if (typeof json === 'string') {
        return json;
      }
    }
  }
  return String(value);
}

export function createdAtMillis(value: unknown): number {
  const iso = toIsoString(value);
  if (!iso) {
    return 0;
  }
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}
