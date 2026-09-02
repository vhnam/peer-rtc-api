import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  parseConsumerResponseBody,
  parseProviderJoinedBody,
} from './call-session.dto.js';

describe('parseProviderJoinedBody', () => {
  it('accepts consult request and consumer ids', () => {
    expect(
      parseProviderJoinedBody({
        consultRequestId: 'req-1',
        consumerId: 'consumer-1',
      }),
    ).toEqual({
      consultRequestId: 'req-1',
      consumerId: 'consumer-1',
    });
  });

  it('rejects a missing consumer id', () => {
    expect(() =>
      parseProviderJoinedBody({ consultRequestId: 'req-1' }),
    ).toThrow(BadRequestException);
  });

  it('rejects a missing consult request id', () => {
    expect(() => parseProviderJoinedBody({ consumerId: 'consumer-1' })).toThrow(
      BadRequestException,
    );
  });
});

describe('parseConsumerResponseBody', () => {
  it('accepts a consult request id', () => {
    expect(parseConsumerResponseBody({ consultRequestId: 'req-1' })).toEqual({
      consultRequestId: 'req-1',
    });
  });

  it('rejects a missing consult request id', () => {
    expect(() => parseConsumerResponseBody({})).toThrow(BadRequestException);
  });
});
