import { describe, expect, it } from 'vitest';

import {
  consultRequestTimeRange,
  isCreatedInConsultRequestTime,
} from './consult-request.time.js';

const noonTuesday = Temporal.Instant.from('2026-09-01T12:00:00Z');

function iso(instant: Temporal.Instant) {
  return instant.toString();
}

describe('consultRequestTimeRange', () => {
  it('uses UTC calendar bounds for today', () => {
    expect(iso(consultRequestTimeRange('today', noonTuesday).start)).toBe(
      '2026-09-01T00:00:00Z',
    );
    expect(iso(consultRequestTimeRange('today', noonTuesday).end)).toBe(
      '2026-09-02T00:00:00Z',
    );
  });

  it('uses ISO weeks starting Monday UTC', () => {
    expect(iso(consultRequestTimeRange('this-week', noonTuesday).start)).toBe(
      '2026-08-31T00:00:00Z',
    );
    expect(iso(consultRequestTimeRange('this-week', noonTuesday).end)).toBe(
      '2026-09-07T00:00:00Z',
    );
    expect(
      iso(consultRequestTimeRange('previous-week', noonTuesday).start),
    ).toBe('2026-08-24T00:00:00Z');
    expect(iso(consultRequestTimeRange('next-week', noonTuesday).start)).toBe(
      '2026-09-07T00:00:00Z',
    );
  });

  it('uses UTC calendar months', () => {
    expect(iso(consultRequestTimeRange('this-month', noonTuesday).start)).toBe(
      '2026-09-01T00:00:00Z',
    );
    expect(iso(consultRequestTimeRange('this-month', noonTuesday).end)).toBe(
      '2026-10-01T00:00:00Z',
    );
    expect(
      iso(consultRequestTimeRange('previous-month', noonTuesday).start),
    ).toBe('2026-08-01T00:00:00Z');
    expect(iso(consultRequestTimeRange('next-month', noonTuesday).start)).toBe(
      '2026-10-01T00:00:00Z',
    );
  });
});

describe('isCreatedInConsultRequestTime', () => {
  it('includes createdAt in [start, end)', () => {
    expect(
      isCreatedInConsultRequestTime(
        '2026-09-01T00:00:00.000Z',
        'today',
        noonTuesday,
      ),
    ).toBe(true);
    expect(
      isCreatedInConsultRequestTime(
        '2026-09-02T00:00:00.000Z',
        'today',
        noonTuesday,
      ),
    ).toBe(false);
    expect(
      isCreatedInConsultRequestTime(
        '2026-08-31T23:59:59.000Z',
        'today',
        noonTuesday,
      ),
    ).toBe(false);
  });
});
