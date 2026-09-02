import { BadRequestException } from '@nestjs/common';
import * as v from 'valibot';

const idSchema = v.pipe(v.string(), v.minLength(1));

const providerJoinedSchema = v.object({
  consultRequestId: idSchema,
  consumerId: idSchema,
});

const consumerResponseSchema = v.object({
  consultRequestId: idSchema,
});

export function parseProviderJoinedBody(body: unknown): {
  consultRequestId: string;
  consumerId: string;
} {
  return parse(providerJoinedSchema, body ?? {});
}

export function parseConsumerResponseBody(body: unknown): {
  consultRequestId: string;
} {
  return parse(consumerResponseSchema, body ?? {});
}

function parse<TSchema extends v.GenericSchema>(
  schema: TSchema,
  input: unknown,
): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, input);
  if (!result.success) {
    throw new BadRequestException(
      result.issues[0]?.message ?? 'Invalid payload',
    );
  }
  return result.output;
}
