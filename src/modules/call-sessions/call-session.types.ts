import type { User } from 'better-auth';

import type { ConsultRequestActor } from '../consult-requests/consult-request.types.js';

export const CALL_SESSION_STATUSES = [
  'pending',
  'accepted',
  'canceled',
  'closed',
] as const;

export type CallSessionStatus = (typeof CALL_SESSION_STATUSES)[number];

export const OPEN_CALL_SESSION_STATUSES = ['pending', 'accepted'] as const;

export type CallSessionRow = {
  id: string;
  consultRequestId: string;
  roomId: string;
  providerId: string;
  consumerId: string;
  status: CallSessionStatus;
  startedAt: unknown;
  endedAt: unknown;
  endReason: string | null;
};

export type CallSessionDto = {
  id: string;
  consultRequestId: string;
  roomId: string;
  providerId: string;
  consumerId: string;
  status: CallSessionStatus;
  startedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
};

export type CallSessionWrite = {
  status?: CallSessionStatus;
  startedAt?: Temporal.Instant;
  endedAt?: Temporal.Instant;
  endReason?: string | null;
};

export type CallSignalEvent =
  | 'provider_joined'
  | 'consumer_accepted'
  | 'consumer_declined'
  | 'consumer_not_pickup'
  | 'provider_ended'
  | 'consumer_ended';

export type CallRoomPayload = {
  consultRequestId: string;
};

export type CallAcceptedPayload = CallRoomPayload & {
  consumer: User;
};

export type CallDeclinedPayload = CallRoomPayload & {
  consumerId: string;
};

export type SignalCallRoomResult = {
  session: CallSessionDto;
  actor: ConsultRequestActor;
  event: CallSignalEvent;
};
