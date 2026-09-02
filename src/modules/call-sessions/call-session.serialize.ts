import { toIsoString } from '../consult-requests/consult-request.serialize.js';
import type { CallSessionDto, CallSessionRow } from './call-session.types.js';

export function serializeCallSession(row: CallSessionRow): CallSessionDto {
  return {
    id: row.id,
    consultRequestId: row.consultRequestId,
    roomId: row.roomId,
    providerId: row.providerId,
    consumerId: row.consumerId,
    status: row.status,
    startedAt: toIsoString(row.startedAt),
    endedAt: toIsoString(row.endedAt),
    endReason: row.endReason,
  };
}
