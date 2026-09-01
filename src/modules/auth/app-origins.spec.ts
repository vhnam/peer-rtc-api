import { describe, expect, it } from 'vitest';

import {
  APP_ORIGIN_POLICIES,
  assertCanRegister,
  assertCanSignIn,
  CONSUMER_ORIGIN,
  PROVIDER_ORIGIN,
  roleForOrigin,
} from './app-origins.js';

describe('app origin policies', () => {
  it('maps consumer and provider apps', () => {
    expect(APP_ORIGIN_POLICIES[CONSUMER_ORIGIN]).toEqual({
      role: 'consumer',
      canRegister: true,
      canSignIn: true,
    });
    expect(APP_ORIGIN_POLICIES[PROVIDER_ORIGIN]).toEqual({
      role: 'provider',
      canRegister: false,
      canSignIn: true,
    });
  });

  it('resolves role from origin', () => {
    expect(roleForOrigin(CONSUMER_ORIGIN)).toBe('consumer');
    expect(roleForOrigin(PROVIDER_ORIGIN)).toBe('provider');
    expect(roleForOrigin('https://evil.example')).toBeNull();
  });

  it('allows registration only from the consumer app', () => {
    expect(assertCanRegister(CONSUMER_ORIGIN)).toBe('consumer');
    expect(() => assertCanRegister(PROVIDER_ORIGIN)).toThrow(
      /Registration is only allowed from the consumer app/,
    );
    expect(() => assertCanRegister(null)).toThrow(
      /Registration is only allowed from the consumer app/,
    );
  });

  it('requires login role and matches Origin + account', () => {
    expect(assertCanSignIn(CONSUMER_ORIGIN, 'consumer')).toBe('consumer');
    expect(assertCanSignIn(PROVIDER_ORIGIN, 'provider', 'provider')).toBe(
      'provider',
    );

    expect(() => assertCanSignIn(CONSUMER_ORIGIN, undefined)).toThrow(
      /role must be one of/,
    );
    expect(() => assertCanSignIn(CONSUMER_ORIGIN, 'admin')).toThrow(
      /role must be one of/,
    );
    expect(() => assertCanSignIn(CONSUMER_ORIGIN, 'provider')).toThrow(
      /consumer accounts only/,
    );
    expect(() =>
      assertCanSignIn(PROVIDER_ORIGIN, 'provider', 'consumer'),
    ).toThrow(/provider accounts only/);
  });
});
