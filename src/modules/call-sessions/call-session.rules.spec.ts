import { describe, expect, it } from 'vitest';

import { canAccessCall, planCallSignal } from './call-session.rules.js';
import type { CallSessionRow } from './call-session.types.js';

const accepted = {
  id: 'req-1',
  consumerId: 'consumer-1',
  providerId: 'provider-1',
  status: 'accepted',
};

const pendingCall: CallSessionRow = {
  id: 'call-1',
  consultRequestId: 'req-1',
  roomId: 'room-1',
  providerId: 'provider-1',
  consumerId: 'consumer-1',
  status: 'pending',
  startedAt: null,
  endedAt: null,
  endReason: null,
};

describe('canAccessCall', () => {
  it('lets the assigned provider through', () => {
    expect(
      canAccessCall({ id: 'provider-1', role: 'provider' }, accepted),
    ).toBe(true);
  });

  it('lets the owning consumer through', () => {
    expect(
      canAccessCall({ id: 'consumer-1', role: 'consumer' }, accepted),
    ).toBe(true);
  });

  it('rejects a pending consult', () => {
    expect(
      canAccessCall(
        { id: 'provider-1', role: 'provider' },
        { ...accepted, status: 'pending', providerId: null },
      ),
    ).toBe(false);
  });

  it('rejects another provider', () => {
    expect(
      canAccessCall({ id: 'provider-2', role: 'provider' }, accepted),
    ).toBe(false);
  });
});

describe('planCallSignal', () => {
  it('lets the provider start a call', () => {
    expect(
      planCallSignal(
        { id: 'provider-1', role: 'provider' },
        accepted,
        'provider_joined',
        null,
      ),
    ).toEqual({ ok: true, value: true });
  });

  it('lets the consumer accept a pending call', () => {
    expect(
      planCallSignal(
        { id: 'consumer-1', role: 'consumer' },
        accepted,
        'consumer_accepted',
        pendingCall,
      ),
    ).toEqual({ ok: true, value: true });
  });

  it('lets the consumer decline a pending call', () => {
    expect(
      planCallSignal(
        { id: 'consumer-1', role: 'consumer' },
        accepted,
        'consumer_declined',
        pendingCall,
      ),
    ).toEqual({ ok: true, value: true });
  });

  it('blocks a consumer from emitting provider_joined', () => {
    expect(
      planCallSignal(
        { id: 'consumer-1', role: 'consumer' },
        accepted,
        'provider_joined',
        pendingCall,
      ),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it('blocks a provider from accepting the call', () => {
    expect(
      planCallSignal(
        { id: 'provider-1', role: 'provider' },
        accepted,
        'consumer_accepted',
        pendingCall,
      ),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it('lets the provider report a missed pickup on a pending call', () => {
    expect(
      planCallSignal(
        { id: 'provider-1', role: 'provider' },
        accepted,
        'consumer_not_pickup',
        pendingCall,
      ),
    ).toEqual({ ok: true, value: true });
  });

  it('blocks a consumer from reporting a missed pickup', () => {
    expect(
      planCallSignal(
        { id: 'consumer-1', role: 'consumer' },
        accepted,
        'consumer_not_pickup',
        pendingCall,
      ),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it('blocks reporting a missed pickup after the consumer accepted', () => {
    expect(
      planCallSignal(
        { id: 'provider-1', role: 'provider' },
        accepted,
        'consumer_not_pickup',
        { ...pendingCall, status: 'accepted' },
      ),
    ).toMatchObject({ ok: false, status: 409 });
  });

  it('lets the provider end an open call', () => {
    expect(
      planCallSignal(
        { id: 'provider-1', role: 'provider' },
        accepted,
        'provider_ended',
        pendingCall,
      ),
    ).toEqual({ ok: true, value: true });
  });

  it('blocks a consumer from emitting provider_ended', () => {
    expect(
      planCallSignal(
        { id: 'consumer-1', role: 'consumer' },
        accepted,
        'provider_ended',
        pendingCall,
      ),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it('lets the consumer end an open call', () => {
    expect(
      planCallSignal(
        { id: 'consumer-1', role: 'consumer' },
        accepted,
        'consumer_ended',
        pendingCall,
      ),
    ).toEqual({ ok: true, value: true });
  });

  it('blocks a provider from emitting consumer_ended', () => {
    expect(
      planCallSignal(
        { id: 'provider-1', role: 'provider' },
        accepted,
        'consumer_ended',
        pendingCall,
      ),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it('requires the provider to start before the consumer responds', () => {
    expect(
      planCallSignal(
        { id: 'consumer-1', role: 'consumer' },
        accepted,
        'consumer_accepted',
        null,
      ),
    ).toMatchObject({ ok: false, status: 409 });
  });
});
