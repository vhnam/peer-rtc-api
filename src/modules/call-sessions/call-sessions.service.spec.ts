import { ConflictException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../prisma/prisma.service.js';
import { CallSessionsService } from './call-sessions.service.js';

type Chain = {
  first: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function acceptedConsult() {
  return {
    id: 'req-1',
    requestId: '20200101001',
    consumerId: 'consumer-1',
    providerId: 'provider-1',
    status: 'accepted',
    note: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    acceptedAt: new Date('2026-09-01T00:01:00.000Z'),
    closedAt: null,
  };
}

function pendingSession() {
  return {
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
}

describe('CallSessionsService', () => {
  let consult: Chain;
  let call: Chain;
  let service: CallSessionsService;

  beforeEach(() => {
    consult = {
      first: vi.fn(async () => acceptedConsult()),
      where: vi.fn(),
      all: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };
    call = {
      first: vi.fn(async () => pendingSession()),
      where: vi.fn(() => call),
      all: vi.fn(async () => []),
      create: vi.fn(async (data: Record<string, unknown>) => ({
        ...pendingSession(),
        ...data,
      })),
      update: vi.fn(async (data: Record<string, unknown>) => [
        { ...pendingSession(), ...data },
      ]),
    };
    service = new CallSessionsService({
      db: {
        orm: {
          public: {
            ConsultRequest: consult,
            CallSession: call,
          },
        },
      },
    } as unknown as PrismaService);
  });

  it('creates a pending session when the provider starts the call', async () => {
    const result = await service.startCall(
      { user: { id: 'provider-1', role: 'provider' } } as never,
      'req-1',
    );

    expect(result.session).toMatchObject({
      consultRequestId: 'req-1',
      status: 'pending',
    });
    expect(result.session.roomId).toEqual(expect.any(String));
    expect(call.create).toHaveBeenCalled();
  });

  it('rejects a pending consult', async () => {
    consult.first.mockResolvedValue({
      ...acceptedConsult(),
      status: 'pending',
      providerId: null,
    });

    await expect(
      service.startCall(
        { user: { id: 'provider-1', role: 'provider' } } as never,
        'req-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('marks the session accepted when the consumer accepts', async () => {
    call.all.mockResolvedValue([pendingSession()]);

    const result = await service.respondToCall(
      { user: { id: 'consumer-1', role: 'consumer' } } as never,
      'req-1',
      'consumer_accepted',
    );

    expect(result.event).toBe('consumer_accepted');
    expect(result.session.status).toBe('accepted');
    expect(call.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'accepted' }),
    );
  });

  it('marks the session canceled when the consumer declines', async () => {
    call.all.mockResolvedValue([pendingSession()]);

    const result = await service.respondToCall(
      { user: { id: 'consumer-1', role: 'consumer' } } as never,
      'req-1',
      'consumer_declined',
    );

    expect(result.session).toMatchObject({
      status: 'canceled',
      endReason: 'declined',
    });
  });

  it('cancels the session when the provider reports a missed pickup', async () => {
    call.all.mockResolvedValue([pendingSession()]);

    const result = await service.reportConsumerNotPickup(
      { user: { id: 'provider-1', role: 'provider' } } as never,
      'req-1',
    );

    expect(result.event).toBe('consumer_not_pickup');
    expect(result.session).toMatchObject({
      status: 'canceled',
      endReason: 'not_pickup',
    });
  });

  it('closes the session when the provider ends the call', async () => {
    call.all.mockResolvedValue([pendingSession()]);

    const result = await service.endCall(
      { user: { id: 'provider-1', role: 'provider' } } as never,
      'req-1',
      'provider_ended',
    );

    expect(result.event).toBe('provider_ended');
    expect(result.session).toMatchObject({
      status: 'closed',
      endReason: 'ended',
    });
  });

  it('closes the session when the consumer ends the call', async () => {
    call.all.mockResolvedValue([pendingSession()]);

    const result = await service.endCall(
      { user: { id: 'consumer-1', role: 'consumer' } } as never,
      'req-1',
      'consumer_ended',
    );

    expect(result.event).toBe('consumer_ended');
    expect(result.session).toMatchObject({
      status: 'closed',
      endReason: 'ended',
    });
  });

  it('forbids the consumer from starting the call', async () => {
    await expect(
      service.startCall(
        { user: { id: 'consumer-1', role: 'consumer' } } as never,
        'req-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
