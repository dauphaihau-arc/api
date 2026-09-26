/**
 * Seller-configured elapsed calendar-day duration ranges.
 *
 * Processing time is a profile-level handling range before dispatch; delivery
 * time is a per-destination-rate transit range after dispatch. Ranges are
 * estimates configured by the seller, never carrier or platform guarantees.
 */
export interface ShippingDurationRange {
  minDays: number;
  maxDays: number;
}

export type ShippingDurationRangeIssueKind = 'missing' | 'invalid';

/** Nullable columns surface as `null`; a stored null bound means "not set". */
export type ShippingDurationBound = number | null | undefined;

function isSet(value: ShippingDurationBound): value is number {
  return value !== undefined && value !== null;
}

export function isCompleteDurationRange(
  minDays: ShippingDurationBound,
  maxDays: ShippingDurationBound,
): boolean {
  return isSet(minDays) && isSet(maxDays);
}

export function isValidDurationRange(
  minDays: ShippingDurationBound,
  maxDays: ShippingDurationBound,
): boolean {
  if (!isSet(minDays) || !isSet(maxDays)) {
    return false;
  }

  return Number.isInteger(minDays)
    && Number.isInteger(maxDays)
    && minDays >= 0
    && maxDays >= 0
    && minDays <= maxDays;
}

/**
 * Missing and invalid ranges are distinguished so a seller sees an actionable
 * reason and a missing range is never read as a zero-day estimate.
 */
export function collectDurationRangeIssueKind(
  minDays: ShippingDurationBound,
  maxDays: ShippingDurationBound,
): ShippingDurationRangeIssueKind | null {
  if (!isCompleteDurationRange(minDays, maxDays)) {
    return 'missing';
  }

  return isValidDurationRange(minDays, maxDays) ? null : 'invalid';
}
