import { createdAtMillis } from './consult-request.serialize.js';
import type { ConsultRequestTime } from './consult-request.types.js';

export type ConsultRequestTimeRange = {
  start: Temporal.Instant;
  end: Temporal.Instant;
};

export function consultRequestTimeRange(
  time: ConsultRequestTime,
  now: Temporal.Instant = Temporal.Now.instant(),
): ConsultRequestTimeRange {
  const zoned = now.toZonedDateTimeISO('UTC');
  const startOfToday = zoned.startOfDay();

  if (time === 'today') {
    return {
      start: startOfToday.toInstant(),
      end: startOfToday.add({ days: 1 }).toInstant(),
    };
  }

  if (
    time === 'this-week' ||
    time === 'next-week' ||
    time === 'previous-week'
  ) {
    const weekStart = startOfToday.subtract({ days: zoned.dayOfWeek - 1 });
    const offsetDays = time === 'this-week' ? 0 : time === 'next-week' ? 7 : -7;
    const start = weekStart.add({ days: offsetDays });
    return {
      start: start.toInstant(),
      end: start.add({ days: 7 }).toInstant(),
    };
  }

  const monthStart = zoned.with({ day: 1 }).startOfDay();
  const offsetMonths =
    time === 'this-month' ? 0 : time === 'next-month' ? 1 : -1;
  const start = monthStart.add({ months: offsetMonths });
  return {
    start: start.toInstant(),
    end: start.add({ months: 1 }).toInstant(),
  };
}

export function isCreatedInConsultRequestTime(
  createdAt: unknown,
  time: ConsultRequestTime,
  now: Temporal.Instant = Temporal.Now.instant(),
): boolean {
  const { start, end } = consultRequestTimeRange(time, now);
  const ms = createdAtMillis(createdAt);
  return ms >= start.epochMilliseconds && ms < end.epochMilliseconds;
}
