import { User } from 'better-auth';

import type { UserRole } from '../auth/roles.js';

export const CONSULT_REQUEST_STATUSES = [
  'pending',
  'accepted',
  'cancelled',
  'expired',
  'closed',
] as const;

export type ConsultRequestStatus = (typeof CONSULT_REQUEST_STATUSES)[number];

export const CONSULT_REQUEST_UPDATE_STATUSES = [
  'accepted',
  'cancelled',
  'closed',
] as const;

export type ConsultRequestUpdateStatus =
  (typeof CONSULT_REQUEST_UPDATE_STATUSES)[number];

export type ConsultRequestActor = {
  id: string;
  role: UserRole;
};

export type ConsultRequestRow = {
  id: string;
  requestId: string;
  consumerId: string;
  providerId: string | null;
  status: ConsultRequestStatus;
  note: string | null;
  createdAt: unknown;
  acceptedAt: unknown;
  closedAt: unknown;
  consumer?: User | null;
  provider?: User | null;
};

export type CreateConsultRequestInput = {
  note?: string;
};

export type UpdateConsultRequestInput = {
  note?: string | null;
  status?: ConsultRequestUpdateStatus;
};

export type ConsultRequestWrite = {
  note?: string | null;
  status?: ConsultRequestStatus;
  providerId?: string;
  acceptedAt?: Temporal.Instant;
  closedAt?: Temporal.Instant;
};

export type ConsultRequestDto = {
  id: string;
  requestId: string;
  consumerId: string;
  providerId: string | null;
  status: ConsultRequestStatus;
  note: string | null;
  createdAt: string;
  acceptedAt: string | null;
  closedAt: string | null;
  consumer: User;
  provider: User | null;
};

export const DEFAULT_LIST_PAGE = 1;
export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 100;

export const CONSULT_REQUEST_TIMES = [
  'today',
  'this-week',
  'next-week',
  'previous-week',
  'this-month',
  'previous-month',
  'next-month',
] as const;

export type ConsultRequestTime = (typeof CONSULT_REQUEST_TIMES)[number];

export type ConsultRequestListQuery = {
  requestId?: string;
  status?: ConsultRequestStatus;
  consumerId?: string;
  providerId?: string;
  time?: ConsultRequestTime;
  page: number;
  limit: number;
};

export type ConsultRequestListDto = {
  data: ConsultRequestDto[];
  total: number;
  page: number;
  limit: number;
};

export type RuleFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  message: string;
};

export type RuleSuccess<T> = { ok: true; value: T };

export type RuleResult<T> = RuleSuccess<T> | RuleFailure;
