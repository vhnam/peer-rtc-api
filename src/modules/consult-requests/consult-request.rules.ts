import type { UserSession } from '@thallesp/nestjs-better-auth';

import { nowInstant } from '../../prisma/timestamps.js';
import type { auth } from '../auth/auth.js';
import { isUserRole } from '../auth/roles.js';
import type {
  ConsultRequestActor,
  ConsultRequestRow,
  ConsultRequestWrite,
  CreateConsultRequestInput,
  RuleResult,
  UpdateConsultRequestInput,
} from './consult-request.types.js';

export function actorFromSession(
  session: UserSession<typeof auth>,
): RuleResult<ConsultRequestActor> {
  const id = session.user.id;
  const role = session.user.role;
  if (!id || !isUserRole(role)) {
    return { ok: false, status: 403, message: 'Invalid session' };
  }
  return { ok: true, value: { id, role } };
}

export function canAccessConsultRequest(
  actor: ConsultRequestActor,
  row: ConsultRequestRow,
): boolean {
  if (actor.role === 'consumer') {
    return row.consumerId === actor.id;
  }
  if (row.providerId === actor.id) {
    return true;
  }
  return row.status === 'pending' && row.providerId === null;
}

export function planCreateConsultRequest(
  actor: ConsultRequestActor,
  input: CreateConsultRequestInput,
): RuleResult<{
  consumerId: string;
  providerId: null;
  note: string | null;
}> {
  if (actor.role !== 'consumer') {
    return {
      ok: false,
      status: 403,
      message: 'Only consumers can create consult requests',
    };
  }

  return {
    ok: true,
    value: {
      consumerId: actor.id,
      providerId: null,
      note: input.note ?? null,
    },
  };
}

export function planUpdateConsultRequest(
  actor: ConsultRequestActor,
  existing: ConsultRequestRow,
  patch: UpdateConsultRequestInput,
): RuleResult<ConsultRequestWrite> {
  if (!canAccessConsultRequest(actor, existing)) {
    return { ok: false, status: 404, message: 'Consult request not found' };
  }

  if (patch.note === undefined && patch.status === undefined) {
    return {
      ok: false,
      status: 400,
      message: 'Provide note and/or status to update',
    };
  }

  const write: ConsultRequestWrite = {};

  if (patch.note !== undefined) {
    if (actor.role !== 'consumer' || existing.status !== 'pending') {
      return {
        ok: false,
        status: 400,
        message:
          'Note can only be updated on a pending request by the consumer',
      };
    }
    write.note = patch.note;
  }

  if (patch.status === undefined || patch.status === existing.status) {
    return { ok: true, value: write };
  }

  if (patch.status === 'accepted') {
    if (actor.role !== 'provider' || existing.status !== 'pending') {
      return {
        ok: false,
        status: 409,
        message: 'Consult request cannot be accepted',
      };
    }
    write.status = 'accepted';
    write.providerId = actor.id;
    write.acceptedAt = nowInstant();
    return { ok: true, value: write };
  }

  if (patch.status === 'canceled') {
    if (actor.role !== 'consumer' || existing.status !== 'pending') {
      return {
        ok: false,
        status: 409,
        message: 'Consult request cannot be canceled',
      };
    }
    write.status = 'canceled';
    return { ok: true, value: write };
  }

  if (patch.status === 'closed') {
    if (existing.status !== 'accepted') {
      return {
        ok: false,
        status: 409,
        message: 'Consult request cannot be closed',
      };
    }
    write.status = 'closed';
    write.closedAt = nowInstant();
    return { ok: true, value: write };
  }

  return {
    ok: false,
    status: 400,
    message: 'Unsupported status update',
  };
}
