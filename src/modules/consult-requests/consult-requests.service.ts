import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import { PrismaService } from '../../prisma/prisma.service.js';
import type { auth } from '../auth/auth.js';
import {
  consultRequestDatePrefix,
  nextConsultRequestId,
} from './consult-request.id.js';
import {
  actorFromSession,
  canAccessConsultRequest,
  planCreateConsultRequest,
  planUpdateConsultRequest,
} from './consult-request.rules.js';
import {
  createdAtMillis,
  serializeConsultRequest,
} from './consult-request.serialize.js';
import { isCreatedInConsultRequestTime } from './consult-request.time.js';
import type {
  ConsultRequestActor,
  ConsultRequestDto,
  ConsultRequestListDto,
  ConsultRequestListQuery,
  ConsultRequestRow,
  CreateConsultRequestInput,
  RuleResult,
  UpdateConsultRequestInput,
} from './consult-request.types.js';

@Injectable()
export class ConsultRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    session: UserSession<typeof auth>,
    query: ConsultRequestListQuery,
    now: Temporal.Instant = Temporal.Now.instant(),
  ): Promise<ConsultRequestListDto> {
    const actor = unwrap(actorFromSession(session));
    const rows = await this.loadVisibleRows(actor);
    const filtered = rows.filter((row) => {
      if (query.status && row.status !== query.status) {
        return false;
      }
      if (query.consumerId && row.consumerId !== query.consumerId) {
        return false;
      }
      if (query.providerId && row.providerId !== query.providerId) {
        return false;
      }
      if (query.requestId && row.requestId !== query.requestId) {
        return false;
      }
      if (
        query.time &&
        !isCreatedInConsultRequestTime(row.createdAt, query.time, now)
      ) {
        return false;
      }
      return true;
    });
    filtered.sort(
      (left, right) =>
        createdAtMillis(right.createdAt) - createdAtMillis(left.createdAt),
    );
    const total = filtered.length;
    const start = (query.page - 1) * query.limit;
    const data = filtered
      .slice(start, start + query.limit)
      .map(serializeConsultRequest);
    return {
      data,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async get(
    session: UserSession<typeof auth>,
    id: string,
  ): Promise<ConsultRequestDto> {
    const actor = unwrap(actorFromSession(session));
    const existing = await this.withConsumer().first({
      id,
    });
    if (!existing) {
      throw new NotFoundException('Consult request not found');
    }

    const row = asConsultRequestRow(existing);
    if (!canAccessConsultRequest(actor, row)) {
      throw new NotFoundException('Consult request not found');
    }
    return serializeConsultRequest(row);
  }

  async create(
    session: UserSession<typeof auth>,
    input: CreateConsultRequestInput,
  ): Promise<ConsultRequestDto> {
    const actor = unwrap(actorFromSession(session));
    const planned = unwrap(planCreateConsultRequest(actor, input));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const requestId = await this.allocateRequestId();
      try {
        const created = await this.withConsumer().create({
          id: crypto.randomUUID(),
          requestId,
          consumerId: planned.consumerId,
          providerId: null,
          note: planned.note,
        });
        return serializeConsultRequest(
          asConsultRequestRow(await this.requireWithConsumer(created)),
        );
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 4) {
          throw error;
        }
      }
    }

    throw new ConflictException('Could not allocate a consult request id');
  }

  async update(
    session: UserSession<typeof auth>,
    id: string,
    input: UpdateConsultRequestInput,
  ): Promise<ConsultRequestDto> {
    const actor = unwrap(actorFromSession(session));
    const existing = await this.withConsumer().first({
      id,
    });
    if (!existing) {
      throw new NotFoundException('Consult request not found');
    }

    const planned = unwrap(
      planUpdateConsultRequest(actor, asConsultRequestRow(existing), input),
    );
    const updated = await this.withConsumer()
      .where({
        id,
      })
      .update(planned);
    const row = Array.isArray(updated) ? updated[0] : updated;
    if (!row) {
      throw new NotFoundException('Consult request not found');
    }
    return serializeConsultRequest(
      asConsultRequestRow(await this.requireWithConsumer(row)),
    );
  }

  private async loadVisibleRows(
    actor: ConsultRequestActor,
  ): Promise<ConsultRequestRow[]> {
    if (actor.role === 'consumer') {
      const rows = await this.withConsumer()
        .where({
          consumerId: actor.id,
        })
        .all();
      return rows.map(asConsultRequestRow);
    }

    const [queue, assigned] = await Promise.all([
      this.withConsumer()
        .where((row) => row.providerId.isNull())
        .where({ status: 'pending' })
        .all(),
      this.withConsumer()
        .where({
          providerId: actor.id,
        })
        .all(),
    ]);

    const byId = new Map<string, ConsultRequestRow>();
    for (const row of [...queue, ...assigned]) {
      byId.set(row.id, asConsultRequestRow(row));
    }
    return [...byId.values()];
  }

  private withConsumer() {
    return this.prisma.db.orm.public.ConsultRequest.include(
      'consumer',
      (consumer) => consumer.select('id', 'name', 'email', 'image', 'role'),
    );
  }

  private async requireWithConsumer<
    T extends { id: string; consumer?: unknown },
  >(row: T) {
    if (row.consumer) {
      return row;
    }
    const loaded = await this.withConsumer().first({ id: row.id });
    if (!loaded) {
      throw new NotFoundException('Consult request not found');
    }
    return loaded;
  }

  private async allocateRequestId(): Promise<string> {
    const prefix = consultRequestDatePrefix();
    try {
      const latest = await this.prisma.db.orm.public.ConsultRequest.select(
        'requestId',
      )
        .where((row) => row.requestId.gte(`${prefix}001`))
        .where((row) => row.requestId.lte(`${prefix}999`))
        .orderBy((row) => row.requestId.desc())
        .first();
      return nextConsultRequestId(latest?.requestId, prefix);
    } catch (error) {
      if (error instanceof RangeError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}

function unwrap<T>(result: RuleResult<T>): T {
  if (result.ok) {
    return result.value;
  }
  if (result.status === 400) {
    throw new BadRequestException(result.message);
  }
  if (result.status === 403) {
    throw new ForbiddenException(result.message);
  }
  if (result.status === 404) {
    throw new NotFoundException(result.message);
  }
  throw new ConflictException(result.message);
}

function asConsultRequestRow(row: {
  id: string;
  requestId: string;
  consumerId: string;
  providerId: string | null;
  status: ConsultRequestRow['status'];
  note: string | null;
  createdAt: unknown;
  acceptedAt: unknown;
  closedAt: unknown;
  consumer?: unknown;
  provider?: unknown;
}): ConsultRequestRow {
  return {
    id: row.id,
    requestId: row.requestId,
    consumerId: row.consumerId,
    providerId: row.providerId,
    status: row.status,
    note: row.note,
    createdAt: row.createdAt,
    acceptedAt: row.acceptedAt,
    closedAt: row.closedAt,
    consumer: (row.consumer as ConsultRequestRow['consumer']) ?? null,
    provider: (row.provider as ConsultRequestRow['provider']) ?? null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as {
    code?: string;
    message?: string;
    cause?: { code?: string };
  };
  return (
    candidate.code === '23505' ||
    candidate.cause?.code === '23505' ||
    /unique/i.test(candidate.message ?? '')
  );
}
