import { BadRequestException } from '@nestjs/common';
import * as v from 'valibot';

import {
  CONSULT_REQUEST_STATUSES,
  CONSULT_REQUEST_TIMES,
  CONSULT_REQUEST_UPDATE_STATUSES,
  type ConsultRequestListQuery,
  type CreateConsultRequestInput,
  DEFAULT_LIST_LIMIT,
  DEFAULT_LIST_PAGE,
  MAX_LIST_LIMIT,
  type UpdateConsultRequestInput,
} from './consult-request.types.js';

const createSchema = v.object({
  note: v.optional(v.pipe(v.string(), v.maxLength(2000))),
});

const updateSchema = v.object({
  note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(2000)))),
  status: v.optional(v.picklist(CONSULT_REQUEST_UPDATE_STATUSES)),
});

const positiveInt = v.pipe(
  v.union([v.string(), v.number()]),
  v.transform((value) => Number(value)),
  v.number(),
  v.integer(),
  v.minValue(1),
);

const listQuerySchema = v.object({
  requestId: v.optional(v.pipe(v.string(), v.minLength(1))),
  status: v.optional(v.picklist(CONSULT_REQUEST_STATUSES)),
  consumerId: v.optional(v.pipe(v.string(), v.minLength(1))),
  time: v.optional(v.picklist(CONSULT_REQUEST_TIMES)),
  page: v.optional(positiveInt, DEFAULT_LIST_PAGE),
  limit: v.optional(
    v.pipe(positiveInt, v.maxValue(MAX_LIST_LIMIT)),
    DEFAULT_LIST_LIMIT,
  ),
});

export function parseCreateConsultRequestBody(
  body: unknown,
): CreateConsultRequestInput {
  return parse(createSchema, body ?? {});
}

export function parseUpdateConsultRequestBody(
  body: unknown,
): UpdateConsultRequestInput {
  return parse(updateSchema, body ?? {});
}

export function parseListConsultRequestQuery(
  query: unknown,
): ConsultRequestListQuery {
  const source =
    query && typeof query === 'object'
      ? Object.fromEntries(
          Object.entries(query as Record<string, unknown>).filter(
            ([, value]) => value !== undefined && value !== '',
          ),
        )
      : {};
  return parse(listQuerySchema, source);
}

function parse<TSchema extends v.GenericSchema>(
  schema: TSchema,
  input: unknown,
): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, input);
  if (!result.success) {
    const issue = result.issues[0];
    throw new BadRequestException(issue?.message ?? 'Invalid request');
  }
  return result.output;
}
