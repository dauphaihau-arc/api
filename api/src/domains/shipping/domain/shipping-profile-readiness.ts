import { ShippingProfileStatus } from './enums/shipping-profile-status.enum';
import {
  collectDurationRangeIssueKind,
  isCompleteDurationRange,
  type ShippingDurationBound,
} from './shipping-duration-range';

/**
 * Reasons a Shipping Profile cannot be used for a checkout quote or publishable
 * Product. Issues never imply free shipping: an unusable profile is
 * unavailable, not zero-cost.
 */
export type ShippingProfileReadinessIssue =
  | 'archived'
  | 'draft'
  | 'missing_name'
  | 'missing_rates'
  | 'missing_processing_time'
  | 'invalid_processing_time'
  | 'missing_delivery_time'
  | 'invalid_delivery_time';

/**
 * Readiness only needs a rate's count and its delivery range, so configured
 * rates and persisted rates both satisfy it without carrying matcher identity.
 */
export interface ShippingRateReadiness {
  deliveryTimeMinDays?: ShippingDurationBound;
  deliveryTimeMaxDays?: ShippingDurationBound;
}

export interface ShippingProfileReadinessInput {
  status: ShippingProfileStatus;
  name: string;
  /** Elapsed calendar-day handling range before dispatch, when configured. */
  processingTimeMinDays?: ShippingDurationBound;
  processingTimeMaxDays?: ShippingDurationBound;
  rates: readonly ShippingRateReadiness[];
}

/** Configuration gaps a seller must fix before a profile can be activated. */
export function collectShippingProfileConfigurationIssues(
  profile: ShippingProfileReadinessInput,
): ShippingProfileReadinessIssue[] {
  const issues: ShippingProfileReadinessIssue[] = [];

  if (profile.name.trim().length === 0) {
    issues.push('missing_name');
  }

  if (profile.rates.length === 0) {
    issues.push('missing_rates');
  }

  const processingIssue = collectDurationRangeIssueKind(
    profile.processingTimeMinDays,
    profile.processingTimeMaxDays,
  );

  if (processingIssue === 'missing') {
    issues.push('missing_processing_time');
  }
  else if (processingIssue === 'invalid') {
    issues.push('invalid_processing_time');
  }

  const deliveryRates = profile.rates;

  const hasMissingDeliveryRange = deliveryRates.some(
    (rate) => !isCompleteDurationRange(rate.deliveryTimeMinDays, rate.deliveryTimeMaxDays),
  );
  const hasInvalidDeliveryRange = deliveryRates.some(
    (rate) => collectDurationRangeIssueKind(rate.deliveryTimeMinDays, rate.deliveryTimeMaxDays) === 'invalid',
  );

  if (hasMissingDeliveryRange) {
    issues.push('missing_delivery_time');
  }
  else if (hasInvalidDeliveryRange) {
    issues.push('invalid_delivery_time');
  }

  return issues;
}

/** Lifecycle plus configuration gaps that make a profile unusable for checkout. */
export function collectShippingProfileReadinessIssues(
  profile: ShippingProfileReadinessInput,
): ShippingProfileReadinessIssue[] {
  const issues: ShippingProfileReadinessIssue[] = [];

  if (profile.status === ShippingProfileStatus.ARCHIVED) {
    issues.push('archived');
  }
  else if (profile.status === ShippingProfileStatus.DRAFT) {
    issues.push('draft');
  }

  issues.push(...collectShippingProfileConfigurationIssues(profile));

  return issues;
}

export function isShippingProfileCheckoutReady(
  profile: ShippingProfileReadinessInput,
): boolean {
  return collectShippingProfileReadinessIssues(profile).length === 0;
}
