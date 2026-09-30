/**
 * Resolves a seller-entered local wall-clock time in an explicit IANA timezone
 * into the instant a Promotion actually starts or ends, and reports the two
 * daylight-saving edge cases a silent resolution would hide:
 *
 * - a nonexistent local time (spring-forward gap), which must be rejected;
 * - an ambiguous local time (fall-back repeat), where two instants share the
 *   same wall clock and the caller must disambiguate explicitly.
 *
 * The math uses `Intl.DateTimeFormat` only, so the domain layer stays free of
 * third-party timezone dependencies.
 */

export interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export type LocalDateTimeResolution =
  | { kind: 'instant'; instant: Date }
  | { kind: 'nonexistent' }
  | { kind: 'ambiguous'; earlier: Date; later: Date };

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Parses the wall-clock wire format `YYYY-MM-DDTHH:mm`. Returns `undefined` for
 * anything else, so a transport layer can reject it as invalid input rather
 * than silently reinterpreting it.
 */
export function parseLocalDateTime(value: string): LocalDateTimeParts | undefined {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);

  if (!match) {
    return undefined;
  }

  const parts: LocalDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };

  if (
    parts.month < 1 || parts.month > 12
    || parts.day < 1 || parts.day > 31
    || parts.hour > 23 || parts.minute > 59
  ) {
    return undefined;
  }

  return parts;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });

    return true;
  }
  catch {
    return false;
  }
}

export function resolveLocalDateTime(
  parts: LocalDateTimeParts,
  timeZone: string,
): LocalDateTimeResolution {
  const instants = candidateInstants(parts, timeZone);

  if (instants.length === 0) {
    return { kind: 'nonexistent' };
  }

  if (instants.length === 1) {
    return { kind: 'instant', instant: new Date(instants[0]) };
  }

  return {
    kind: 'ambiguous',
    earlier: new Date(instants[0]),
    later: new Date(instants[instants.length - 1]),
  };
}

/**
 * Resolves a local time with a caller-supplied UTC offset in minutes (east of
 * UTC), the explicit disambiguation for a repeated fall-back local time.
 * Returns `undefined` when the offset does not reproduce the requested wall
 * clock, which is exactly a nonexistent spring-forward local time.
 */
export function resolveLocalDateTimeWithOffset(
  parts: LocalDateTimeParts,
  timeZone: string,
  offsetMinutes: number,
): Date | undefined {
  const instant = localPartsToUtcMillis(parts) - (offsetMinutes * 60_000);

  return sameParts(zonedParts(instant, timeZone), parts)
    ? new Date(instant)
    : undefined;
}

function candidateInstants(
  parts: LocalDateTimeParts,
  timeZone: string,
): number[] {
  const naiveMillis = localPartsToUtcMillis(parts);
  const offsets = new Set<number>([
    offsetMinutesAt(naiveMillis - 86_400_000, timeZone),
    offsetMinutesAt(naiveMillis, timeZone),
    offsetMinutesAt(naiveMillis + 86_400_000, timeZone),
  ]);

  const instants = new Set<number>();
  for (const offset of offsets) {
    const instant = naiveMillis - (offset * 60_000);

    if (sameParts(zonedParts(instant, timeZone), parts)) {
      instants.add(instant);
    }
  }

  return [...instants].sort((left, right) => left - right);
}

function localPartsToUtcMillis(parts: LocalDateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

/**
 * The wall clock an instant shows in `timeZone`.
 */
function zonedParts(instantMillis: number, timeZone: string): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const values: Record<string, number> = {};

  for (const part of formatter.formatToParts(new Date(instantMillis))) {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

/**
 * The timezone offset (minutes east of UTC) in effect at an instant.
 */
function offsetMinutesAt(instantMillis: number, timeZone: string): number {
  const parts = zonedParts(instantMillis, timeZone);
  const wallClockAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );

  return Math.round((wallClockAsUtc - instantMillis) / 60_000);
}

function sameParts(left: LocalDateTimeParts, right: LocalDateTimeParts): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute;
}
