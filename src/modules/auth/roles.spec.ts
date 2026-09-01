import { describe, expect, it } from 'vitest';

import { DEFAULT_USER_ROLE, isUserRole, USER_ROLES } from './roles.js';

describe('USER_ROLES', () => {
  it('exposes consumer and provider', () => {
    expect(USER_ROLES).toEqual(['consumer', 'provider']);
  });

  it('defaults new users to consumer', () => {
    expect(DEFAULT_USER_ROLE).toBe('consumer');
  });
});

describe('isUserRole', () => {
  it.each(['consumer', 'provider'] as const)('accepts %s', (role) => {
    expect(isUserRole(role)).toBe(true);
  });

  it.each(['admin', 'user', '', 'Consumer', 1, null, undefined, {}, []])(
    'rejects %j',
    (value) => {
      expect(isUserRole(value)).toBe(false);
    },
  );
});
