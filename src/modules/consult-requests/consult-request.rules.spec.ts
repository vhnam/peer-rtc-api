import { describe, expect, it } from 'vitest';

import {
  actorFromSession,
  canAccessConsultRequest,
  planCreateConsultRequest,
  planUpdateConsultRequest,
} from './consult-request.rules.js';
import type { ConsultRequestRow } from './consult-request.types.js';

const pending: ConsultRequestRow = {
  id: 'req-1',
  requestId: '20260901001',
  consumerId: 'consumer-1',
  providerId: null,
  status: 'pending',
  note: 'help',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  acceptedAt: null,
  closedAt: null,
};

describe('actorFromSession', () => {
  it('accepts a consumer session', () => {
    const result = actorFromSession({
      user: { id: 'u1', role: 'consumer' },
    } as never);
    expect(result).toEqual({
      ok: true,
      value: { id: 'u1', role: 'consumer' },
    });
  });

  it('accepts a provider session', () => {
    expect(
      actorFromSession({
        user: { id: 'p1', role: 'provider' },
      } as never),
    ).toEqual({
      ok: true,
      value: { id: 'p1', role: 'provider' },
    });
  });

  it('rejects an invalid role', () => {
    const result = actorFromSession({
      user: { id: 'u1', role: 'admin' },
    } as never);
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects a missing user id', () => {
    expect(
      actorFromSession({
        user: { id: '', role: 'consumer' },
      } as never),
    ).toMatchObject({ ok: false, status: 403 });
  });
});

describe('canAccessConsultRequest', () => {
  it('lets the owning consumer through', () => {
    expect(
      canAccessConsultRequest({ id: 'consumer-1', role: 'consumer' }, pending),
    ).toBe(true);
  });

  it('hides other consumers', () => {
    expect(
      canAccessConsultRequest({ id: 'consumer-2', role: 'consumer' }, pending),
    ).toBe(false);
  });

  it('lets any provider see unassigned pending requests', () => {
    expect(
      canAccessConsultRequest({ id: 'provider-1', role: 'provider' }, pending),
    ).toBe(true);
  });

  it('hides pending requests targeted at another provider', () => {
    expect(
      canAccessConsultRequest(
        { id: 'provider-2', role: 'provider' },
        { ...pending, providerId: 'provider-1' },
      ),
    ).toBe(false);
  });

  it('lets the assigned provider see an accepted request', () => {
    expect(
      canAccessConsultRequest(
        { id: 'provider-1', role: 'provider' },
        { ...pending, status: 'accepted', providerId: 'provider-1' },
      ),
    ).toBe(true);
  });

  it('hides accepted requests from unassigned providers', () => {
    expect(
      canAccessConsultRequest(
        { id: 'provider-2', role: 'provider' },
        { ...pending, status: 'accepted', providerId: 'provider-1' },
      ),
    ).toBe(false);
  });
});

describe('planCreateConsultRequest', () => {
  it('creates a pending request for a consumer', () => {
    expect(
      planCreateConsultRequest(
        { id: 'consumer-1', role: 'consumer' },
        { note: 'need help' },
      ),
    ).toEqual({
      ok: true,
      value: {
        consumerId: 'consumer-1',
        providerId: null,
        note: 'need help',
      },
    });
  });

  it('forbids providers from creating', () => {
    expect(
      planCreateConsultRequest({ id: 'provider-1', role: 'provider' }, {}),
    ).toMatchObject({ ok: false, status: 403 });
  });
});

describe('planUpdateConsultRequest', () => {
  it('lets a provider accept a pending request', () => {
    const result = planUpdateConsultRequest(
      { id: 'provider-1', role: 'provider' },
      pending,
      { status: 'accepted' },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        status: 'accepted',
        providerId: 'provider-1',
      });
      expect(result.value.acceptedAt).toBeInstanceOf(Temporal.Instant);
    }
  });

  it('lets a consumer cancel their pending request', () => {
    expect(
      planUpdateConsultRequest(
        { id: 'consumer-1', role: 'consumer' },
        pending,
        {
          status: 'cancelled',
        },
      ),
    ).toMatchObject({
      ok: true,
      value: { status: 'cancelled' },
    });
  });

  it('lets a consumer update the note while pending', () => {
    expect(
      planUpdateConsultRequest(
        { id: 'consumer-1', role: 'consumer' },
        pending,
        {
          note: 'updated',
        },
      ),
    ).toEqual({
      ok: true,
      value: { note: 'updated' },
    });
  });

  it('lets consumer or assigned provider close an accepted request', () => {
    const accepted = {
      ...pending,
      status: 'accepted' as const,
      providerId: 'provider-1',
    };
    expect(
      planUpdateConsultRequest(
        { id: 'consumer-1', role: 'consumer' },
        accepted,
        {
          status: 'closed',
        },
      ),
    ).toMatchObject({ ok: true, value: { status: 'closed' } });
    expect(
      planUpdateConsultRequest(
        { id: 'provider-1', role: 'provider' },
        accepted,
        {
          status: 'closed',
        },
      ),
    ).toMatchObject({ ok: true, value: { status: 'closed' } });
  });

  it('rejects accepting from a consumer', () => {
    expect(
      planUpdateConsultRequest(
        { id: 'consumer-1', role: 'consumer' },
        pending,
        {
          status: 'accepted',
        },
      ),
    ).toMatchObject({ ok: false, status: 409 });
  });

  it('returns not found when the actor cannot see the request', () => {
    expect(
      planUpdateConsultRequest(
        { id: 'consumer-2', role: 'consumer' },
        pending,
        {
          status: 'cancelled',
        },
      ),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it('rejects an empty patch', () => {
    expect(
      planUpdateConsultRequest(
        { id: 'consumer-1', role: 'consumer' },
        pending,
        {},
      ),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects a provider updating the note', () => {
    expect(
      planUpdateConsultRequest(
        { id: 'provider-1', role: 'provider' },
        pending,
        { note: 'nope' },
      ),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects updating the note after the request is accepted', () => {
    expect(
      planUpdateConsultRequest(
        { id: 'consumer-1', role: 'consumer' },
        { ...pending, status: 'accepted', providerId: 'provider-1' },
        { note: 'too late' },
      ),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it('is a no-op when the status is already the requested value', () => {
    expect(
      planUpdateConsultRequest(
        { id: 'provider-1', role: 'provider' },
        { ...pending, status: 'accepted', providerId: 'provider-1' },
        { status: 'accepted' },
      ),
    ).toEqual({ ok: true, value: {} });
  });

  it('rejects cancelling after accept', () => {
    expect(
      planUpdateConsultRequest(
        { id: 'consumer-1', role: 'consumer' },
        { ...pending, status: 'accepted', providerId: 'provider-1' },
        { status: 'cancelled' },
      ),
    ).toMatchObject({ ok: false, status: 409 });
  });

  it('rejects a provider cancelling a request', () => {
    expect(
      planUpdateConsultRequest(
        { id: 'provider-1', role: 'provider' },
        pending,
        { status: 'cancelled' },
      ),
    ).toMatchObject({ ok: false, status: 409 });
  });

  it('rejects closing a pending request', () => {
    expect(
      planUpdateConsultRequest(
        { id: 'consumer-1', role: 'consumer' },
        pending,
        { status: 'closed' },
      ),
    ).toMatchObject({ ok: false, status: 409 });
  });

  it('lets the targeted provider accept', () => {
    const result = planUpdateConsultRequest(
      { id: 'provider-1', role: 'provider' },
      { ...pending, providerId: 'provider-1' },
      { status: 'accepted' },
    );
    expect(result).toMatchObject({
      ok: true,
      value: { status: 'accepted', providerId: 'provider-1' },
    });
  });
});
