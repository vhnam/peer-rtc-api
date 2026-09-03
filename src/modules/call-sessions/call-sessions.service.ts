import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import { PrismaService } from '../../prisma/prisma.service.js';
import { nowInstant } from '../../prisma/timestamps.js';
import type { auth } from '../auth/auth.js';
import { actorFromSession } from '../consult-requests/consult-request.rules.js';
import type { RuleResult } from '../consult-requests/consult-request.types.js';
import { planCallSignal } from './call-session.rules.js';
import { serializeCallSession } from './call-session.serialize.js';
import {
  type CallSessionRow,
  type CallSessionWrite,
  OPEN_CALL_SESSION_STATUSES,
  type SignalCallRoomResult,
} from './call-session.types.js';

const openStatuses: readonly string[] = OPEN_CALL_SESSION_STATUSES;

@Injectable()
export class CallSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async startCall(
    session: UserSession<typeof auth>,
    consultRequestId: string,
  ): Promise<SignalCallRoomResult> {
    const actor = unwrap(actorFromSession(session));
    const consult = await this.requireConsult(consultRequestId);
    const existing = await this.findOpenSession(consult.id);
    unwrap(planCallSignal(actor, consult, 'provider_joined', existing));
    if (!consult.providerId) {
      throw new ConflictException(
        'Call signaling is only available for an accepted consult request',
      );
    }

    const row = await this.ensureOpenSession({
      consultRequestId: consult.id,
      providerId: consult.providerId,
      consumerId: consult.consumerId,
    });

    return {
      session: serializeCallSession(row),
      actor,
      event: 'provider_joined',
    };
  }

  async respondToCall(
    session: UserSession<typeof auth>,
    consultRequestId: string,
    event: 'consumer_accepted' | 'consumer_declined',
  ): Promise<SignalCallRoomResult> {
    const actor = unwrap(actorFromSession(session));
    const consult = await this.requireConsult(consultRequestId);
    const call = await this.findOpenSession(consult.id);
    unwrap(planCallSignal(actor, consult, event, call));
    if (!call) {
      throw new ConflictException('Provider has not started the call');
    }

    const row =
      event === 'consumer_accepted'
        ? await this.updateSession(call.id, {
            status: 'accepted',
            startedAt: nowInstant(),
          })
        : await this.updateSession(call.id, {
            status: 'canceled',
            endedAt: nowInstant(),
            endReason: 'declined',
          });

    return {
      session: serializeCallSession(row),
      actor,
      event,
    };
  }

  async endCall(
    session: UserSession<typeof auth>,
    consultRequestId: string,
    event: 'provider_ended' | 'consumer_ended',
  ): Promise<SignalCallRoomResult> {
    const actor = unwrap(actorFromSession(session));
    const consult = await this.requireConsult(consultRequestId);
    const call = await this.findOpenSession(consult.id);
    unwrap(planCallSignal(actor, consult, event, call));
    if (!call) {
      throw new ConflictException('Provider has not started the call');
    }

    const row = await this.updateSession(call.id, {
      status: 'closed',
      endedAt: nowInstant(),
      endReason: 'ended',
    });

    return {
      session: serializeCallSession(row),
      actor,
      event,
    };
  }

  private readonly opening = new Map<string, Promise<CallSessionRow>>();

  private ensureOpenSession(input: {
    consultRequestId: string;
    providerId: string;
    consumerId: string;
  }): Promise<CallSessionRow> {
    const pending = this.opening.get(input.consultRequestId);
    if (pending) {
      return pending;
    }
    const opened = this.findOrCreateOpenSession(input).finally(() => {
      this.opening.delete(input.consultRequestId);
    });
    this.opening.set(input.consultRequestId, opened);
    return opened;
  }

  private async findOrCreateOpenSession(input: {
    consultRequestId: string;
    providerId: string;
    consumerId: string;
  }): Promise<CallSessionRow> {
    return (
      (await this.findOpenSession(input.consultRequestId)) ??
      this.createPendingSession(input)
    );
  }

  private async requireConsult(id: string) {
    const existing = await this.prisma.db.orm.public.ConsultRequest.first({
      id,
    });
    if (!existing) {
      throw new NotFoundException('Consult request not found');
    }
    return existing;
  }

  private async findOpenSession(
    consultRequestId: string,
  ): Promise<CallSessionRow | null> {
    const rows = await this.prisma.db.orm.public.CallSession.where({
      consultRequestId,
    }).all();
    const open = rows.filter((row) => openStatuses.includes(row.status));
    const latest = open.at(-1);
    return latest ? asCallSessionRow(latest) : null;
  }

  private async createPendingSession(input: {
    consultRequestId: string;
    providerId: string;
    consumerId: string;
  }): Promise<CallSessionRow> {
    const created = await this.prisma.db.orm.public.CallSession.create({
      id: crypto.randomUUID(),
      consultRequestId: input.consultRequestId,
      roomId: crypto.randomUUID(),
      providerId: input.providerId,
      consumerId: input.consumerId,
      status: 'pending',
    });
    return asCallSessionRow(created);
  }

  private async updateSession(
    id: string,
    data: CallSessionWrite,
  ): Promise<CallSessionRow> {
    const updated = await this.prisma.db.orm.public.CallSession.where({
      id,
    }).update(data);
    const row = Array.isArray(updated) ? updated[0] : updated;
    if (!row) {
      throw new NotFoundException('Call session not found');
    }
    return asCallSessionRow(row);
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

function asCallSessionRow(row: {
  id: string;
  consultRequestId: string;
  roomId: string;
  providerId: string;
  consumerId: string;
  status: CallSessionRow['status'];
  startedAt: unknown;
  endedAt: unknown;
  endReason: string | null;
}): CallSessionRow {
  return {
    id: row.id,
    consultRequestId: row.consultRequestId,
    roomId: row.roomId,
    providerId: row.providerId,
    consumerId: row.consumerId,
    status: row.status,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    endReason: row.endReason,
  };
}
