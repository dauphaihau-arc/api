import { DomainError } from '~/platform/errors/domain.error';
import {
  parseLocalDateTime,
  resolveLocalDateTime,
  resolveLocalDateTimeWithOffset,
} from './local-date-time';

/** The authored local wall-clock time for a Promotion boundary is missing or malformed. */
export class InvalidPromotionScheduleError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/** A spring-forward local time that never exists on the calendar in the selected timezone. */
export class NonexistentPromotionLocalTimeError extends DomainError {
  constructor(public readonly boundary: 'start' | 'end') {
    super(`The ${boundary} is a local time that does not exist in the selected timezone`);
  }
}

/** A fall-back local time that occurs twice and needs explicit disambiguation. */
export class AmbiguousPromotionLocalTimeError extends DomainError {
  constructor(public readonly boundary: 'start' | 'end') {
    super(`The ${boundary} occurs twice in the selected timezone; choose which occurrence to use`);
  }
}

/**
 * Resolves one authored wall clock into the instant a Promotion boundary falls on,
 * rejecting the two daylight-saving cases a silent resolution would hide.
 * An explicit UTC offset in minutes disambiguates a repeated fall-back local
 * time; a local time that does not exist is always rejected.
 */
export function resolvePromotionScheduleBoundary(
  boundary: 'start' | 'end',
  local: string | undefined,
  offsetMinutes: number | undefined,
  timezone: string,
): Date {
  const parts = local ? parseLocalDateTime(local) : undefined;

  if (!parts) {
    throw new InvalidPromotionScheduleError(`The ${boundary} is missing or malformed`);
  }

  if (offsetMinutes !== undefined) {
    const instant = resolveLocalDateTimeWithOffset(parts, timezone, offsetMinutes);

    if (!instant) {
      throw new NonexistentPromotionLocalTimeError(boundary);
    }

    return instant;
  }

  const resolution = resolveLocalDateTime(parts, timezone);

  if (resolution.kind === 'nonexistent') {
    throw new NonexistentPromotionLocalTimeError(boundary);
  }

  if (resolution.kind === 'ambiguous') {
    throw new AmbiguousPromotionLocalTimeError(boundary);
  }

  return resolution.instant;
}
