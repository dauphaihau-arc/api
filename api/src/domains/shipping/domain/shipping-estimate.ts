import {
  collectDurationRangeIssueKind,
  type ShippingDurationBound,
  type ShippingDurationRange,
} from './shipping-duration-range';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ShippingEstimate {
  processingTimeMinDays: number;
  processingTimeMaxDays: number;
  deliveryTimeMinDays: number;
  deliveryTimeMaxDays: number;
  combinedMinDays: number;
  combinedMaxDays: number;
  /** Server-owned UTC instant this estimate was calculated from. */
  anchorAt: Date;
  /** UTC calendar date derived from the anchor day plus the combined bounds. */
  earliestDeliveryDate: Date;
  latestDeliveryDate: Date;
}

export interface ShippingEstimateInput {
  processingTimeMinDays: number;
  processingTimeMaxDays: number;
  deliveryTimeMinDays: number;
  deliveryTimeMaxDays: number;
  anchorAt: Date;
}

export interface PartialShippingEstimateInput {
  processingTimeMinDays?: ShippingDurationBound;
  processingTimeMaxDays?: ShippingDurationBound;
  deliveryTimeMinDays?: ShippingDurationBound;
  deliveryTimeMaxDays?: ShippingDurationBound;
  anchorAt: Date;
}

/**
 * Seller-configured elapsed calendar-day estimate: the handling range before
 * dispatch plus the matched destination's transit range after dispatch. Dates
 * are UTC calendar dates counted from the UTC day of the server anchor, so the
 * result never depends on the running process's local timezone.
 */
export function calculateShippingEstimate(
  input: ShippingEstimateInput,
): ShippingEstimate {
  const combinedMinDays = input.processingTimeMinDays + input.deliveryTimeMinDays;
  const combinedMaxDays = input.processingTimeMaxDays + input.deliveryTimeMaxDays;
  const anchorDay = startOfUtcDay(input.anchorAt);

  return {
    processingTimeMinDays: input.processingTimeMinDays,
    processingTimeMaxDays: input.processingTimeMaxDays,
    deliveryTimeMinDays: input.deliveryTimeMinDays,
    deliveryTimeMaxDays: input.deliveryTimeMaxDays,
    combinedMinDays,
    combinedMaxDays,
    anchorAt: input.anchorAt,
    earliestDeliveryDate: addUtcDays(anchorDay, combinedMinDays),
    latestDeliveryDate: addUtcDays(anchorDay, combinedMaxDays),
  };
}

/**
 * Returns nothing unless both ranges are complete and valid. A missing range is
 * never treated as a zero-day estimate.
 */
export function tryCalculateShippingEstimate(
  input: PartialShippingEstimateInput,
): ShippingEstimate | undefined {
  const processingIssue = collectDurationRangeIssueKind(
    input.processingTimeMinDays,
    input.processingTimeMaxDays,
  );
  const deliveryIssue = collectDurationRangeIssueKind(
    input.deliveryTimeMinDays,
    input.deliveryTimeMaxDays,
  );

  if (processingIssue !== null || deliveryIssue !== null) {
    return undefined;
  }

  return calculateShippingEstimate({
    processingTimeMinDays: input.processingTimeMinDays as number,
    processingTimeMaxDays: input.processingTimeMaxDays as number,
    deliveryTimeMinDays: input.deliveryTimeMinDays as number,
    deliveryTimeMaxDays: input.deliveryTimeMaxDays as number,
    anchorAt: input.anchorAt,
  });
}

export function toShippingDurationRange(
  minDays: ShippingDurationBound,
  maxDays: ShippingDurationBound,
): ShippingDurationRange | undefined {
  if (collectDurationRangeIssueKind(minDays, maxDays) !== null) {
    return undefined;
  }

  return { minDays: minDays as number, maxDays: maxDays as number };
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  ));
}

function addUtcDays(value: Date, days: number): Date {
  return new Date(value.getTime() + (days * MILLISECONDS_PER_DAY));
}
