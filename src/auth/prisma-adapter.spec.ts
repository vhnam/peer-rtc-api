import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPrismaCustomAdapter } from './prisma-adapter.js';

type FieldOps = {
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  like: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  asc: ReturnType<typeof vi.fn>;
  desc: ReturnType<typeof vi.fn>;
};

function createFieldOps(): FieldOps {
  return {
    eq: vi.fn((value) => ({ op: 'eq', value })),
    neq: vi.fn((value) => ({ op: 'neq', value })),
    lt: vi.fn((value) => ({ op: 'lt', value })),
    lte: vi.fn((value) => ({ op: 'lte', value })),
    gt: vi.fn((value) => ({ op: 'gt', value })),
    gte: vi.fn((value) => ({ op: 'gte', value })),
    in: vi.fn((value) => ({ op: 'in', value })),
    like: vi.fn((value) => ({ op: 'like', value })),
    ilike: vi.fn((value) => ({ op: 'ilike', value })),
    asc: vi.fn(() => ({ direction: 'asc' })),
    desc: vi.fn(() => ({ direction: 'desc' })),
  };
}

function createModelApi(seed: Record<string, unknown>[] = []) {
  const state = {
    rows: [...seed],
    whereClauses: [] as unknown[],
    selectFields: [] as string[],
    orderBy: null as unknown,
    limitValue: null as number | null,
    offsetValue: null as number | null,
  };

  const api: Record<string, unknown> = {};

  api.where = vi.fn((predicate: (row: Record<string, FieldOps>) => unknown) => {
    const fields = new Proxy(
      {},
      {
        get: (_target, prop: string) => createFieldOps(),
      },
    ) as Record<string, FieldOps>;
    state.whereClauses.push(predicate(fields));
    return api;
  });
  api.select = vi.fn((...fields: string[]) => {
    state.selectFields = fields;
    return api;
  });
  api.orderBy = vi.fn((fn: (row: Record<string, FieldOps>) => unknown) => {
    const fields = new Proxy(
      {},
      {
        get: (_target, prop: string) => createFieldOps(),
      },
    ) as Record<string, FieldOps>;
    state.orderBy = fn(fields);
    return api;
  });
  api.limit = vi.fn((n: number) => {
    state.limitValue = n;
    return api;
  });
  api.offset = vi.fn((n: number) => {
    state.offsetValue = n;
    return api;
  });
  api.first = vi.fn(async () => state.rows[0] ?? null);
  api.all = vi.fn(async () => state.rows);
  api.count = vi.fn(async () => state.rows.length);
  api.create = vi.fn(async (data: Record<string, unknown>) => {
    state.rows.push(data);
    return data;
  });
  api.update = vi.fn(async (data: Record<string, unknown>) => {
    state.rows = state.rows.map((row) => ({ ...row, ...data }));
    return state.rows;
  });
  api.delete = vi.fn(async () => {
    const deleted = [...state.rows];
    state.rows = [];
    return deleted;
  });

  return { api, state };
}

describe('createPrismaCustomAdapter', () => {
  let userModel: ReturnType<typeof createModelApi>;
  let adapter: ReturnType<typeof createPrismaCustomAdapter>;

  beforeEach(() => {
    userModel = createModelApi([
      { id: 'u1', email: 'a@example.com', loginCount: 2 },
    ]);
    const client = {
      orm: {
        public: {
          User: userModel.api,
        },
      },
    };
    adapter = createPrismaCustomAdapter(client as never);
  });

  it('creates a row on the mapped model', async () => {
    const created = await adapter.create({
      model: 'user',
      data: { id: 'u2', email: 'b@example.com' },
    });

    expect(created).toEqual({ id: 'u2', email: 'b@example.com' });
    expect(userModel.api.create).toHaveBeenCalledWith({
      id: 'u2',
      email: 'b@example.com',
    });
  });

  it('finds one row with where + select', async () => {
    const row = await adapter.findOne({
      model: 'user',
      where: [{ field: 'email', value: 'a@example.com' }],
      select: ['id', 'email'],
    });

    expect(row).toEqual({
      id: 'u1',
      email: 'a@example.com',
      loginCount: 2,
    });
    expect(userModel.api.where).toHaveBeenCalledOnce();
    expect(userModel.api.select).toHaveBeenCalledWith('id', 'email');
    expect(userModel.state.whereClauses[0]).toEqual({
      op: 'eq',
      value: 'a@example.com',
    });
  });

  it('finds many with sort, limit, and offset', async () => {
    const rows = await adapter.findMany({
      model: 'user',
      where: [{ field: 'email', operator: 'contains', value: 'example' }],
      sortBy: { field: 'email', direction: 'desc' },
      limit: 10,
      offset: 5,
    });

    expect(rows).toHaveLength(1);
    expect(userModel.state.whereClauses[0]).toEqual({
      op: 'like',
      value: '%example%',
    });
    expect(userModel.state.orderBy).toEqual({ direction: 'desc' });
    expect(userModel.state.limitValue).toBe(10);
    expect(userModel.state.offsetValue).toBe(5);
  });

  it('maps where operators onto field predicates', async () => {
    await adapter.findOne({
      model: 'user',
      where: [
        { field: 'email', operator: 'ne', value: 'x' },
        { field: 'email', operator: 'in', value: ['a', 'b'] },
        {
          field: 'email',
          operator: 'starts_with',
          value: 'a',
          mode: 'insensitive',
        },
        { field: 'email', operator: 'ends_with', value: 'com' },
      ],
    });

    expect(userModel.state.whereClauses).toEqual([
      { op: 'neq', value: 'x' },
      { op: 'in', value: ['a', 'b'] },
      { op: 'ilike', value: 'a%' },
      { op: 'like', value: '%com' },
    ]);
  });

  it('updates one and many rows', async () => {
    const updated = await adapter.update({
      model: 'user',
      where: [{ field: 'id', value: 'u1' }],
      update: { email: 'new@example.com' },
    });
    expect(updated).toEqual({
      id: 'u1',
      email: 'new@example.com',
      loginCount: 2,
    });

    userModel.state.rows = [
      { id: 'u1', email: 'a@example.com' },
      { id: 'u2', email: 'b@example.com' },
    ];
    const count = await adapter.updateMany({
      model: 'user',
      where: [{ field: 'id', operator: 'in', value: ['u1', 'u2'] }],
      update: { email: 'bulk@example.com' },
    });
    expect(count).toBe(2);
  });

  it('deletes rows and returns deleteMany count', async () => {
    await adapter.delete({
      model: 'user',
      where: [{ field: 'id', value: 'u1' }],
    });
    expect(userModel.api.delete).toHaveBeenCalledOnce();

    userModel.state.rows = [{ id: 'u1' }, { id: 'u2' }];
    const deleted = await adapter.deleteMany({
      model: 'user',
      where: [{ field: 'id', operator: 'in', value: ['u1', 'u2'] }],
    });
    expect(deleted).toBe(2);
  });

  it('counts matching rows', async () => {
    await expect(
      adapter.count({
        model: 'user',
        where: [{ field: 'email', value: 'a@example.com' }],
      }),
    ).resolves.toBe(1);
  });

  it('consumeOne returns and deletes the matched row', async () => {
    const row = await adapter.consumeOne!({
      model: 'user',
      where: [{ field: 'id', value: 'u1' }],
    });

    expect(row).toEqual({
      id: 'u1',
      email: 'a@example.com',
      loginCount: 2,
    });
    expect(userModel.api.delete).toHaveBeenCalledOnce();
  });

  it('consumeOne returns null when nothing matches', async () => {
    userModel.state.rows = [];
    await expect(
      adapter.consumeOne!({
        model: 'user',
        where: [{ field: 'id', value: 'missing' }],
      }),
    ).resolves.toBeNull();
    expect(userModel.api.delete).not.toHaveBeenCalled();
  });

  it('incrementOne updates numeric fields and optional set values', async () => {
    const row = await adapter.incrementOne!({
      model: 'user',
      where: [{ field: 'id', value: 'u1' }],
      increment: { loginCount: 3 },
      set: { email: 'bumped@example.com' },
    });

    expect(row).toEqual({
      id: 'u1',
      email: 'bumped@example.com',
      loginCount: 5,
    });
    expect(userModel.api.update).toHaveBeenCalledWith({
      email: 'bumped@example.com',
      loginCount: 5,
    });
  });

  it('throws when the model is missing from the contract', async () => {
    await expect(
      adapter.create({
        model: 'missing',
        data: { id: 'x' },
      }),
    ).rejects.toThrow('Prisma model "Missing" is not in the contract');
  });
});
