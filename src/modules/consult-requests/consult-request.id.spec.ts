import { describe, expect, it } from 'vitest';

import {
  consultRequestDatePrefix,
  nextConsultRequestId,
} from './consult-request.id.js';

describe('consultRequestDatePrefix', () => {
  it('formats the UTC calendar day as YYYYMMDD', () => {
    expect(
      consultRequestDatePrefix(Temporal.Instant.from('2026-09-01T23:15:00Z')),
    ).toBe('20260901');
  });

  it('rolls to the next day at UTC midnight', () => {
    expect(
      consultRequestDatePrefix(Temporal.Instant.from('2026-09-02T00:00:00Z')),
    ).toBe('20260902');
  });
});

describe('nextConsultRequestId', () => {
  it('starts at 001 for a new day', () => {
    expect(nextConsultRequestId(null, '20260901')).toBe('20260901001');
    expect(nextConsultRequestId('20260831099', '20260901')).toBe('20260901001');
  });

  it('increments the daily sequence', () => {
    expect(nextConsultRequestId('20260901001', '20260901')).toBe('20260901002');
    expect(nextConsultRequestId('20260901098', '20260901')).toBe('20260901099');
  });

  it('allows 999 and rejects overflow', () => {
    expect(nextConsultRequestId('20260901998', '20260901')).toBe('20260901999');
    expect(() => nextConsultRequestId('20260901999', '20260901')).toThrow(
      RangeError,
    );
  });
});
