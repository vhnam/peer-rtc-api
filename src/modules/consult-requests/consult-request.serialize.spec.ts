import { describe, expect, it } from 'vitest';

import {
  createdAtMillis,
  serializeConsultRequest,
  toIsoString,
} from './consult-request.serialize.js';
import type { ConsultRequestRow } from './consult-request.types.js';

const row: ConsultRequestRow = {
  id: 'req-1',
  requestId: '20260901001',
  consumerId: 'consumer-1',
  providerId: null,
  status: 'pending',
  note: 'help',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  acceptedAt: null,
  closedAt: null,
  consumer: {
    id: 'consumer-1',
    name: 'Ada',
    email: 'ada@example.com',
    image: null,
  } as ConsultRequestRow['consumer'],
};

describe('toIsoString', () => {
  it('returns null for missing values', () => {
    expect(toIsoString(null)).toBeNull();
    expect(toIsoString(undefined)).toBeNull();
  });

  it('passes through ISO strings', () => {
    expect(toIsoString('2026-09-01T00:00:00.000Z')).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });

  it('serializes Date values', () => {
    expect(toIsoString(new Date('2026-09-01T12:00:00.000Z'))).toBe(
      '2026-09-01T12:00:00.000Z',
    );
  });

  it('serializes Temporal.Instant values', () => {
    expect(toIsoString(Temporal.Instant.from('2026-09-01T12:00:00Z'))).toBe(
      '2026-09-01T12:00:00.000Z',
    );
  });
});

describe('createdAtMillis', () => {
  it('parses ISO timestamps', () => {
    expect(createdAtMillis('2026-09-01T00:00:00.000Z')).toBe(
      Date.parse('2026-09-01T00:00:00.000Z'),
    );
  });

  it('returns 0 for missing values', () => {
    expect(createdAtMillis(null)).toBe(0);
  });
});

describe('serializeConsultRequest', () => {
  it('maps a pending row to a DTO', () => {
    expect(serializeConsultRequest(row)).toEqual({
      id: 'req-1',
      requestId: '20260901001',
      consumerId: 'consumer-1',
      providerId: null,
      status: 'pending',
      note: 'help',
      createdAt: '2026-09-01T00:00:00.000Z',
      acceptedAt: null,
      closedAt: null,
      consumer: {
        id: 'consumer-1',
        name: 'Ada',
        email: 'ada@example.com',
        image: null,
      },
      provider: null,
    });
  });
});
