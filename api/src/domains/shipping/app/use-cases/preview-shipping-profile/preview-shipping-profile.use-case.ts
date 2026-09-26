import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import {
  matchDestinationRate,
  normalizeCountryCode,
  type ShippingDestination,
  type ShippingDestinationRate,
} from '../../../domain/shipping-destination-matcher';
import { calculateShippingRateArithmetic, type ShippingRateArithmetic } from '../../../domain/shipping-rate-arithmetic';
import type { ShippingDurationRange } from '../../../domain/shipping-duration-range';
import {
  toShippingDurationRange,
  tryCalculateShippingEstimate,
  type ShippingEstimate,
} from '../../../domain/shipping-estimate';
import {
  collectShippingProfileReadinessIssues,
  isShippingProfileCheckoutReady,
  type ShippingProfileReadinessIssue,
} from '../../../domain/shipping-profile-readiness';
import {
  InvalidShippingProfileError,
  ShippingProfileNotFoundError,
} from '../../errors/shipping-app.error';
import { ShippingProfileRepository } from '../../ports/shipping-profile.repository';

export interface PreviewShippingProfileInput {
  countryCode: string;
  quantity: number;
}

export interface ShippingRatePreview {
  shippingProfileId: string;
  shopId: string;
  /**
   * Shop currency the previewed amounts are denominated in. The profile never
   * stores a currency of its own.
   */
  currency: string;
  checkoutReady: boolean;
  readinessIssues: ShippingProfileReadinessIssue[];
  matched: boolean;
  rate?: ShippingDestinationRate;
  arithmetic?: ShippingRateArithmetic;
  /** Seller-configured handling range before dispatch. */
  processingTime?: ShippingDurationRange;
  /** Matched destination's transit range after dispatch. */
  deliveryTime?: ShippingDurationRange;
  /**
   * Combined seller estimate anchored to this preview's server UTC timestamp.
   * Absent when either range is missing or invalid, so a missing range is never
   * presented as a zero-day estimate.
   */
  estimate?: ShippingEstimate;
}

export type PreviewShippingProfileError =
  | ShippingProfileNotFoundError
  | InvalidShippingProfileError;

@Injectable()
export class PreviewShippingProfileUseCase {
  constructor(
    private readonly shippingProfileRepository: ShippingProfileRepository,
  ) {}

  async execute(
    shopId: string,
    shippingProfileId: string,
    input: PreviewShippingProfileInput,
  ): Promise<Result<ShippingRatePreview, PreviewShippingProfileError>> {
    const countryCode = normalizeCountryCode(input.countryCode);

    if (!/^[A-Z]{2}$/.test(countryCode)) {
      return err(new InvalidShippingProfileError('A destination country code is required'));
    }

    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      return err(new InvalidShippingProfileError('Preview quantity must be a positive integer'));
    }

    const profile = await this.shippingProfileRepository.findById(shopId, shippingProfileId);

    if (!profile) {
      return err(new ShippingProfileNotFoundError(shippingProfileId));
    }

    const destination: ShippingDestination = { countryCode };
    const match = matchDestinationRate(profile.rates, destination);
    const base = {
      shippingProfileId: profile.id,
      shopId: profile.shopId,
      currency: profile.shopCurrency,
      checkoutReady: isShippingProfileCheckoutReady(profile),
      readinessIssues: collectShippingProfileReadinessIssues(profile),
    };

    if (!match.matched) {
      return ok({ ...base, matched: false });
    }

    const processingTime = toShippingDurationRange(
      profile.processingTimeMinDays,
      profile.processingTimeMaxDays,
    );
    const deliveryTime = toShippingDurationRange(
      match.rate.deliveryTimeMinDays,
      match.rate.deliveryTimeMaxDays,
    );
    const anchorAt = new Date();

    return ok({
      ...base,
      matched: true,
      rate: match.rate,
      arithmetic: calculateShippingRateArithmetic(match.rate, input.quantity),
      processingTime,
      deliveryTime,
      estimate: tryCalculateShippingEstimate({
        processingTimeMinDays: profile.processingTimeMinDays,
        processingTimeMaxDays: profile.processingTimeMaxDays,
        deliveryTimeMinDays: match.rate.deliveryTimeMinDays,
        deliveryTimeMaxDays: match.rate.deliveryTimeMaxDays,
        anchorAt,
      }),
    });
  }
}
