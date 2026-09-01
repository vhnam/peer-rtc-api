import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../prisma/prisma.service.js';
import { ConsultRequestsService } from './consult-requests.service.js';

type ConsultApi = {
  include: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function consumerDto(id = 'consumer-1') {
  return {
    id,
    name: 'Ada',
    email: `${id}@example.com`,
    image: null,
    role: 'consumer',
  };
}

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    requestId: '20200101001',
    consumerId: 'consumer-1',
    providerId: null,
    status: 'pending',
    note: 'help',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    acceptedAt: null,
    closedAt: null,
    consumer: consumerDto(),
    ...overrides,
  };
}

function createConsultApi(rows: Record<string, unknown>[]): ConsultApi {
  const api: ConsultApi = {
    include: vi.fn(() => api),
    where: vi.fn(() => api),
    select: vi.fn(() => api),
    orderBy: vi.fn(() => api),
    all: vi.fn(async () => rows),
    first: vi.fn(async () => rows[0] ?? null),
    create: vi.fn(async (data: Record<string, unknown>) =>
      pendingRow({ ...data, id: 'created-1' }),
    ),
    update: vi.fn(async (data: Record<string, unknown>) => [
      { ...rows[0], ...data },
    ]),
  };
  return api;
}

describe('ConsultRequestsService', () => {
  let consult: ConsultApi;
  let service: ConsultRequestsService;

  beforeEach(() => {
    consult = createConsultApi([pendingRow()]);
    const prisma = {
      db: {
        orm: {
          public: {
            ConsultRequest: consult,
          },
        },
      },
    } as unknown as PrismaService;
    service = new ConsultRequestsService(prisma);
  });

  it('lists a consumer’s own requests newest first', async () => {
    consult.all.mockResolvedValue([
      pendingRow({
        id: 'old',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
      pendingRow({
        id: 'new',
        createdAt: new Date('2026-09-01T02:00:00.000Z'),
      }),
    ]);

    const listed = await service.list(
      {
        user: { id: 'consumer-1', role: 'consumer' },
      } as never,
      { page: 1, limit: 20 },
    );

    expect(listed.data.map((row) => row.id)).toEqual(['new', 'old']);
    expect(listed).toMatchObject({ total: 2, page: 1, limit: 20 });
    expect(consult.where).toHaveBeenCalledWith({ consumerId: 'consumer-1' });
  });

  it('filters listed requests by status', async () => {
    consult.all.mockResolvedValue([
      pendingRow({ id: 'open' }),
      pendingRow({ id: 'done', status: 'closed' }),
    ]);

    const listed = await service.list(
      { user: { id: 'consumer-1', role: 'consumer' } } as never,
      { status: 'pending', page: 1, limit: 20 },
    );

    expect(listed.data).toEqual([
      expect.objectContaining({ id: 'open', status: 'pending' }),
    ]);
    expect(listed.total).toBe(1);
  });

  it('filters listed requests by consumerId', async () => {
    consult.all.mockResolvedValue([
      pendingRow({ id: 'mine', consumerId: 'consumer-1' }),
      pendingRow({
        id: 'theirs',
        consumerId: 'consumer-2',
        consumer: consumerDto('consumer-2'),
      }),
    ]);

    const listed = await service.list(
      { user: { id: 'provider-1', role: 'provider' } } as never,
      { consumerId: 'consumer-2', page: 1, limit: 20 },
    );

    expect(listed.data).toEqual([
      expect.objectContaining({ id: 'theirs', consumerId: 'consumer-2' }),
    ]);
    expect(listed.total).toBe(1);
  });

  it('filters listed requests by requestId', async () => {
    consult.all.mockResolvedValue([
      pendingRow({ id: 'a', requestId: '20260901001' }),
      pendingRow({ id: 'b', requestId: '20260901002' }),
    ]);

    const listed = await service.list(
      { user: { id: 'consumer-1', role: 'consumer' } } as never,
      { requestId: '20260901002', page: 1, limit: 20 },
    );

    expect(listed.data).toEqual([
      expect.objectContaining({ id: 'b', requestId: '20260901002' }),
    ]);
    expect(listed.total).toBe(1);
  });

  it('filters listed requests by time', async () => {
    consult.all.mockResolvedValue([
      pendingRow({
        id: 'today',
        createdAt: new Date('2026-09-01T08:00:00.000Z'),
      }),
      pendingRow({
        id: 'last-week',
        createdAt: new Date('2026-08-26T08:00:00.000Z'),
      }),
    ]);
    const now = Temporal.Instant.from('2026-09-01T12:00:00Z');

    const today = await service.list(
      { user: { id: 'consumer-1', role: 'consumer' } } as never,
      { time: 'today', page: 1, limit: 20 },
      now,
    );
    const previousWeek = await service.list(
      { user: { id: 'consumer-1', role: 'consumer' } } as never,
      { time: 'previous-week', page: 1, limit: 20 },
      now,
    );

    expect(today.data.map((row) => row.id)).toEqual(['today']);
    expect(previousWeek.data.map((row) => row.id)).toEqual(['last-week']);
  });

  it('pages through listed requests', async () => {
    consult.all.mockResolvedValue([
      pendingRow({
        id: 'a',
        createdAt: new Date('2026-09-01T03:00:00.000Z'),
      }),
      pendingRow({
        id: 'b',
        createdAt: new Date('2026-09-01T02:00:00.000Z'),
      }),
      pendingRow({
        id: 'c',
        createdAt: new Date('2026-09-01T01:00:00.000Z'),
      }),
    ]);

    const page1 = await service.list(
      { user: { id: 'consumer-1', role: 'consumer' } } as never,
      { page: 1, limit: 2 },
    );
    const page2 = await service.list(
      { user: { id: 'consumer-1', role: 'consumer' } } as never,
      { page: 2, limit: 2 },
    );

    expect(page1).toMatchObject({ total: 3, page: 1, limit: 2 });
    expect(page1.data.map((row) => row.id)).toEqual(['a', 'b']);
    expect(page2.data.map((row) => row.id)).toEqual(['c']);
  });

  it('creates a request for a consumer', async () => {
    const created = await service.create(
      { user: { id: 'consumer-1', role: 'consumer' } } as never,
      { note: 'help' },
    );

    expect(consult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        consumerId: 'consumer-1',
        providerId: null,
        note: 'help',
        requestId: expect.stringMatching(/^\d{8}001$/),
      }),
    );
    expect(created).toMatchObject({
      id: 'created-1',
      status: 'pending',
      note: 'help',
      consumer: {
        id: 'consumer-1',
        name: 'Ada',
        email: 'consumer-1@example.com',
        image: null,
      },
    });
  });

  it('forbids a provider from creating', async () => {
    await expect(
      service.create(
        { user: { id: 'provider-1', role: 'provider' } } as never,
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 404 when updating a missing request', async () => {
    consult.first.mockResolvedValue(null);

    await expect(
      service.update(
        { user: { id: 'consumer-1', role: 'consumer' } } as never,
        'missing',
        { status: 'cancelled' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancels a pending request for the owner', async () => {
    const updated = await service.update(
      { user: { id: 'consumer-1', role: 'consumer' } } as never,
      'req-1',
      { status: 'cancelled' },
    );

    expect(consult.update).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(updated.status).toBe('cancelled');
  });
});
