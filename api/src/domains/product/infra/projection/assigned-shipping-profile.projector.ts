import type { ShippingDestinationRate } from '~/domains/shipping/domain/shipping-destination-matcher';
import {
  collectShippingProfileReadinessIssues,
  isShippingProfileCheckoutReady,
} from '~/domains/shipping/domain/shipping-profile-readiness';
import type { ShippingProfileEntity } from '~/domains/shipping/infra/persistence/entities/shipping-profile.entity';
import type {
  ProductShippingSummary,
  PublicProductShippingDestinationSummary,
} from '../../app/product.types';

/**
 * Single mapping from the assigned reusable Shipping Profile to the Product
 * read model, so seller, storefront, and catalog projections cannot drift.
 */
export function toProductShippingSummary(
  profile: ShippingProfileEntity,
): ProductShippingSummary {
  const rates = toProfileRates(profile);

  return {
    id: profile.id,
    name: profile.name,
    status: profile.status,
    version: profile.version,
    shopCurrency: profile.shop.currency,
    shipFromCountry: profile.shipFromCountry,
    shipFromPostal: profile.shipFromPostal,
    processingTimeMinDays: profile.processingTimeMinDays ?? undefined,
    processingTimeMaxDays: profile.processingTimeMaxDays ?? undefined,
    checkoutReady: isShippingProfileCheckoutReady({
      status: profile.status,
      name: profile.name,
      processingTimeMinDays: profile.processingTimeMinDays,
      processingTimeMaxDays: profile.processingTimeMaxDays,
      rates,
    }),
    readinessIssues: collectShippingProfileReadinessIssues({
      status: profile.status,
      name: profile.name,
      processingTimeMinDays: profile.processingTimeMinDays,
      processingTimeMaxDays: profile.processingTimeMaxDays,
      rates,
    }),
    rates,
  };
}

/**
 * Buyer-facing coverage of the assigned profile. Buyers see where a seller
 * ships, never the seller-internal profile name or fee schedule.
 */
export function toPublicShippingDestinations(
  profile: ShippingProfileEntity,
): PublicProductShippingDestinationSummary[] {
  return profile.rates
    .getItems()
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((rate) => ({
      destinationScope: rate.destinationScope,
      destinationCountry: rate.destinationCountry ?? undefined,
    }));
}

function toProfileRates(profile: ShippingProfileEntity): ShippingDestinationRate[] {
  return profile.rates
    .getItems()
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((rate) => ({
      id: rate.id,
      position: rate.position,
      destinationScope: rate.destinationScope,
      destinationCountry: rate.destinationCountry ?? undefined,
      oneItemFeeMinor: rate.oneItemFeeMinor,
      additionalItemFeeMinor: rate.additionalItemFeeMinor,
      deliveryTimeMinDays: rate.deliveryTimeMinDays ?? undefined,
      deliveryTimeMaxDays: rate.deliveryTimeMaxDays ?? undefined,
    }));
}
