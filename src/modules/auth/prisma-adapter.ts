import {
  type CleanedWhere,
  type CustomAdapter,
  createAdapterFactory,
} from 'better-auth/adapters';

import { db } from '../../prisma/db.js';
import {
  coerceTimestampsIn,
  coerceTimestampsOut,
} from '../../prisma/timestamps.js';

type PrismaDb = typeof db;

type FieldOps = {
  eq: (value: unknown) => unknown;
  neq: (value: unknown) => unknown;
  lt: (value: unknown) => unknown;
  lte: (value: unknown) => unknown;
  gt: (value: unknown) => unknown;
  gte: (value: unknown) => unknown;
  in: (value: unknown[]) => unknown;
  like: (value: string) => unknown;
  ilike: (value: string) => unknown;
};

type ModelApi = {
  where: (predicate: unknown) => ModelApi;
  select: (...fields: string[]) => ModelApi;
  orderBy: (fn: unknown) => ModelApi;
  limit: (n: number) => ModelApi;
  offset: (n: number) => ModelApi;
  first: () => Promise<any>;
  all: () => Promise<any[]>;
  count: () => Promise<number>;
  create: (data: Record<string, unknown>) => Promise<any>;
  update: (data: Record<string, unknown>) => Promise<any>;
  delete: () => Promise<any>;
};

function prismaModel(client: PrismaDb, model: string): ModelApi {
  const name = `${model.charAt(0).toUpperCase()}${model.slice(1)}`;
  const orm = client.orm as unknown as {
    public?: Record<string, ModelApi>;
  } & Record<string, ModelApi>;
  const collection = orm.public?.[name] ?? orm[name];
  if (!collection) {
    throw new Error(`Prisma model "${name}" is not in the contract`);
  }
  return collection;
}

function pred(row: Record<string, FieldOps>, clause: CleanedWhere): unknown {
  const field = row[clause.field];
  const operator = clause.operator ?? 'eq';
  const value = clause.value;
  const insensitive = clause.mode === 'insensitive';

  switch (operator) {
    case 'eq':
      return field.eq(value);
    case 'ne':
      return field.neq(value);
    case 'lt':
      return field.lt(value);
    case 'lte':
      return field.lte(value);
    case 'gt':
      return field.gt(value);
    case 'gte':
      return field.gte(value);
    case 'in':
      return field.in(Array.isArray(value) ? value : [value]);
    case 'not_in':
      return field.neq(value);
    case 'contains': {
      const pattern = `%${String(value)}%`;
      return insensitive ? field.ilike(pattern) : field.like(pattern);
    }
    case 'starts_with': {
      const pattern = `${String(value)}%`;
      return insensitive ? field.ilike(pattern) : field.like(pattern);
    }
    case 'ends_with': {
      const pattern = `%${String(value)}`;
      return insensitive ? field.ilike(pattern) : field.like(pattern);
    }
    default:
      return field.eq(value);
  }
}

function withWhere(collection: ModelApi, where?: CleanedWhere[]): ModelApi {
  if (!where?.length) {
    return collection;
  }
  let next = collection;
  for (const clause of where) {
    next = next.where((row: Record<string, FieldOps>) => pred(row, clause));
  }
  return next;
}

function withSelect(collection: ModelApi, select?: string[]): ModelApi {
  if (!select?.length) {
    return collection;
  }
  return collection.select(...select);
}

async function asRows(result: unknown): Promise<any[]> {
  const value = await result;
  if (Array.isArray(value)) {
    return value as Record<string, unknown>[];
  }
  if (value == null) {
    return [];
  }
  return [value as Record<string, unknown>];
}

function asRecord<T>(row: Record<string, unknown> | null): T | null {
  return row as T | null;
}

export function createPrismaCustomAdapter(client: PrismaDb): CustomAdapter {
  return {
    async create({ model, data, select }) {
      const created = await withSelect(
        prismaModel(client, model),
        select,
      ).create(coerceTimestampsIn(data as Record<string, unknown>));
      const row = coerceTimestampsOut(created as Record<string, unknown>);
      if (!row) {
        throw new Error(`Failed to create ${model}`);
      }
      return row as typeof data;
    },
    async findOne({ model, where, select }) {
      return asRecord(
        coerceTimestampsOut(
          (await withSelect(
            withWhere(prismaModel(client, model), where),
            select,
          ).first()) as Record<string, unknown> | null,
        ),
      );
    },
    async findMany({ model, where, limit, offset, select, sortBy }) {
      let query = withSelect(
        withWhere(prismaModel(client, model), where),
        select,
      );
      if (sortBy) {
        query = query.orderBy(
          (row: Record<string, { asc: () => unknown; desc: () => unknown }>) =>
            sortBy.direction === 'desc'
              ? row[sortBy.field].desc()
              : row[sortBy.field].asc(),
        );
      }
      query = query.limit(limit);
      if (offset) {
        query = query.offset(offset);
      }
      const rows = await query.all();
      return rows.map((row) =>
        coerceTimestampsOut(row as Record<string, unknown>),
      ) as typeof rows;
    },
    async update({ model, where, update }) {
      const rows = await asRows(
        withWhere(prismaModel(client, model), where).update(
          coerceTimestampsIn(update as Record<string, unknown>),
        ),
      );
      return asRecord(
        coerceTimestampsOut(rows[0] as Record<string, unknown> | null),
      );
    },
    async updateMany({ model, where, update }) {
      const rows = await asRows(
        withWhere(prismaModel(client, model), where).update(
          coerceTimestampsIn(update as Record<string, unknown>),
        ),
      );
      return rows.length;
    },
    async delete({ model, where }) {
      await withWhere(prismaModel(client, model), where).delete();
    },
    async deleteMany({ model, where }) {
      const rows = await asRows(
        withWhere(prismaModel(client, model), where).delete(),
      );
      return rows.length;
    },
    async count({ model, where }) {
      return withWhere(prismaModel(client, model), where).count();
    },
    async consumeOne({ model, where }) {
      const row = await withWhere(prismaModel(client, model), where).first();
      if (!row) {
        return null;
      }
      await withWhere(prismaModel(client, model), where).delete();
      return asRecord(coerceTimestampsOut(row as Record<string, unknown>));
    },
    async incrementOne({ model, where, increment, set }) {
      const row = await withWhere(prismaModel(client, model), where).first();
      if (!row) {
        return null;
      }
      const next: Record<string, unknown> = coerceTimestampsIn({ ...set });
      for (const [field, delta] of Object.entries(increment)) {
        next[field] = Number(row[field] ?? 0) + Number(delta);
      }
      const rows = await asRows(
        withWhere(prismaModel(client, model), where).update(next),
      );
      return asRecord(
        coerceTimestampsOut(rows[0] as Record<string, unknown> | null),
      );
    },
  };
}

export function prismaPostgresAdapter(client: PrismaDb) {
  return createAdapterFactory({
    config: {
      adapterId: 'prisma-postgres',
      adapterName: 'Prisma Postgres',
      usePlural: false,
      supportsJSON: true,
      supportsDates: false,
      supportsBooleans: true,
      supportsNumericIds: false,
      transaction: false,
    },
    adapter: (): CustomAdapter => createPrismaCustomAdapter(client),
  });
}
