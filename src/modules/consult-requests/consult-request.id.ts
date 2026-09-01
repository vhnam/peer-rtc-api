export const MAX_DAILY_CONSULT_REQUESTS = 999;

export function consultRequestDatePrefix(
  now: Temporal.Instant = Temporal.Now.instant(),
): string {
  const zoned = now.toZonedDateTimeISO('UTC');
  const year = String(zoned.year).padStart(4, '0');
  const month = String(zoned.month).padStart(2, '0');
  const day = String(zoned.day).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function nextConsultRequestId(
  latestTodayId: string | null | undefined,
  prefix = consultRequestDatePrefix(),
): string {
  let sequence = 1;
  if (latestTodayId?.startsWith(prefix) && latestTodayId.length === 11) {
    sequence = Number(latestTodayId.slice(8)) + 1;
  }
  if (
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    sequence > MAX_DAILY_CONSULT_REQUESTS
  ) {
    throw new RangeError('Daily consult request limit reached');
  }
  return `${prefix}${String(sequence).padStart(3, '0')}`;
}
