const TIMESTAMP_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'expiresAt',
  'accessTokenExpiresAt',
  'refreshTokenExpiresAt',
  'acceptedAt',
  'closedAt',
  'startedAt',
  'endedAt',
]);

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function nowInstant(): Temporal.Instant {
  return Temporal.Now.instant();
}

export function toTemporalInstant(value: unknown): unknown {
  if (value == null) {
    return value;
  }
  if (value instanceof Date) {
    return Temporal.Instant.fromEpochMilliseconds(value.getTime());
  }
  if (typeof value === 'string' && ISO_INSTANT.test(value)) {
    return Temporal.Instant.from(value);
  }
  return value;
}

export function fromTemporalInstant(value: unknown): unknown {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  const maybe = value as { epochMilliseconds?: number | bigint };
  if (typeof maybe.epochMilliseconds === 'number') {
    return new Date(maybe.epochMilliseconds).toISOString();
  }
  if (typeof maybe.epochMilliseconds === 'bigint') {
    return new Date(Number(maybe.epochMilliseconds)).toISOString();
  }
  return value;
}

export function coerceTimestampsIn(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return mapTimestampFields(data, toTemporalInstant);
}

export function coerceTimestampsOut(
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!data) {
    return data ?? null;
  }
  return mapTimestampFields(data, fromTemporalInstant);
}

function mapTimestampFields(
  data: Record<string, unknown>,
  map: (value: unknown) => unknown,
): Record<string, unknown> {
  const next = { ...data };
  for (const key of Object.keys(next)) {
    if (TIMESTAMP_FIELDS.has(key)) {
      next[key] = map(next[key]);
    }
  }
  return next;
}
