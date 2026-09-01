import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  parseCreateConsultRequestBody,
  parseListConsultRequestQuery,
  parseUpdateConsultRequestBody,
} from './consult-request.dto.js';

describe('parseCreateConsultRequestBody', () => {
  it('accepts an empty body', () => {
    expect(parseCreateConsultRequestBody({})).toEqual({});
  });

  it('accepts a note', () => {
    expect(parseCreateConsultRequestBody({ note: 'help' })).toEqual({
      note: 'help',
    });
  });

  it('ignores providerId on create', () => {
    expect(
      parseCreateConsultRequestBody({
        note: 'help',
        providerId: 'provider-1',
      }),
    ).toEqual({ note: 'help' });
  });

  it('rejects a note that is too long', () => {
    expect(() =>
      parseCreateConsultRequestBody({ note: 'x'.repeat(2001) }),
    ).toThrow(BadRequestException);
  });
});

describe('parseUpdateConsultRequestBody', () => {
  it('accepts a cancellable status', () => {
    expect(parseUpdateConsultRequestBody({ status: 'cancelled' })).toEqual({
      status: 'cancelled',
    });
  });

  it('accepts clearing the note', () => {
    expect(parseUpdateConsultRequestBody({ note: null })).toEqual({
      note: null,
    });
  });

  it('rejects pending as an update status', () => {
    expect(() => parseUpdateConsultRequestBody({ status: 'pending' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects expired as an update status', () => {
    expect(() => parseUpdateConsultRequestBody({ status: 'expired' })).toThrow(
      BadRequestException,
    );
  });
});

describe('parseListConsultRequestQuery', () => {
  it('defaults page and limit', () => {
    expect(parseListConsultRequestQuery({ status: '' })).toEqual({
      page: 1,
      limit: 20,
    });
  });

  it('accepts a known status', () => {
    expect(parseListConsultRequestQuery({ status: 'pending' })).toEqual({
      status: 'pending',
      page: 1,
      limit: 20,
    });
  });

  it('accepts a requestId', () => {
    expect(parseListConsultRequestQuery({ requestId: '20260901001' })).toEqual({
      requestId: '20260901001',
      page: 1,
      limit: 20,
    });
  });

  it('omits an empty requestId', () => {
    expect(parseListConsultRequestQuery({ requestId: '' })).toEqual({
      page: 1,
      limit: 20,
    });
  });

  it('accepts a consumerId', () => {
    expect(parseListConsultRequestQuery({ consumerId: 'consumer-1' })).toEqual({
      consumerId: 'consumer-1',
      page: 1,
      limit: 20,
    });
  });

  it('omits an empty consumerId', () => {
    expect(parseListConsultRequestQuery({ consumerId: '' })).toEqual({
      page: 1,
      limit: 20,
    });
  });

  it('accepts a time window', () => {
    expect(parseListConsultRequestQuery({ time: 'this-week' })).toEqual({
      time: 'this-week',
      page: 1,
      limit: 20,
    });
  });

  it('rejects an unknown time window', () => {
    expect(() => parseListConsultRequestQuery({ time: 'yesterday' })).toThrow(
      BadRequestException,
    );
  });

  it('parses page and limit from strings', () => {
    expect(parseListConsultRequestQuery({ page: '2', limit: '10' })).toEqual({
      page: 2,
      limit: 10,
    });
  });

  it('rejects an unknown status', () => {
    expect(() => parseListConsultRequestQuery({ status: 'ringing' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects a non-positive page', () => {
    expect(() => parseListConsultRequestQuery({ page: '0' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects a limit above 100', () => {
    expect(() => parseListConsultRequestQuery({ limit: '101' })).toThrow(
      BadRequestException,
    );
  });
});
