import { Injectable } from '@nestjs/common';
import {
  matchDestinationRate,
  type ShippingDestination,
  type ShippingDestinationRate,
} from '../../domain/shipping-destination-matcher';
import {
  collectShippingProfileReadinessIssues,
  isShippingProfileCheckoutReady,
} from '../../domain/shipping-profile-readiness';
import {
  calculateShippingEstimate,
  toShippingDurationRange,
} from '../../domain/shipping-estimate';
import type { FxRateCache } from '~/integrations/currency/fx-rate.service';
import { MoneyConversionService } from '~/integrations/currency/money-conversion.service';
import { ProductShippingAssignmentPort } from '../ports/product-shipping-assignment.port';
import { ShippingProfileRepository } from '../ports/shipping-profile.repository';
import type {
  CheckoutShippingQuote,
  CheckoutShippingQuoteInput,
  CheckoutShippingShopQuote,
  CheckoutShippingUnitInput,
  ProductShippingResolution,
  ShippingQuoteAdditionalComponent,
  ShippingQuoteEstimate,
  ShippingQuoteFxProvenance,
  ShippingQuoteUnavailableProduct,
  ShippingQuoteUnitSnapshot,
} from '../shipping.types';

export interface ResolveProductShippingInput {
  productIds: string[];
  destination: ShippingDestination;
}

/**
 * Shipping's published contract for downstream checkout work: it resolves each
 * purchased Product to its assigned Shipping Profile, checks readiness, and
 * matches exactly one destination rate through the shared matcher. Consumers
 * must not implement another matcher, calculator, Product fallback, or
 * shop-wide rule.
 */
@Injectable()
export class ShippingQuoteService {
  constructor(
    private readonly shippingProfileRepository: ShippingProfileRepository,
    private readonly productShippingAssignmentPort: ProductShippingAssignmentPort,
    private readonly moneyConversionService: MoneyConversionService,
  ) {}

  async resolveForProducts(
    input: ResolveProductShippingInput,
  ): Promise<ProductShippingResolution[]> {
    const assignments = await this.productShippingAssignmentPort.listByProductIds(
      input.productIds,
    );

    const assignmentByProductId = new Map(
      assignments.map((assignment) => [assignment.productId, assignment]),
    );

    const profiles = await this.shippingProfileRepository.findByIds(
      assignments
        .map((assignment) => assignment.shippingProfileId)
        .filter((shippingProfileId): shippingProfileId is string => Boolean(shippingProfileId)),
    );

    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

    const destination: ShippingDestination = {
      countryCode: input.destination.countryCode,
    };

    return input.productIds.map((productId) => {
      const assignment = assignmentByProductId.get(productId);

      // A digital Product is not carrier-delivered: it needs no Shipping
      // Profile and is never priced, estimated, or reported as unavailable for
      // shipping reasons.
      if (assignment?.isDigital) {
        return {
          productId,
          isDigital: true,
          available: true,
          readinessIssues: [],
        };
      }

      if (!assignment?.shippingProfileId) {
        return {
          productId,
          isDigital: false,
          available: false,
          reason: 'missing_assignment',
          readinessIssues: [],
        };
      }

      const profile = profileById.get(assignment.shippingProfileId);

      if (!profile) {
        return {
          productId,
          profileId: assignment.shippingProfileId,
          isDigital: false,
          available: false,
          reason: 'profile_not_found',
          readinessIssues: [],
        };
      }

      const readinessIssues = collectShippingProfileReadinessIssues(profile);

      if (!isShippingProfileCheckoutReady(profile)) {
        return {
          productId,
          profileId: profile.id,
          profileName: profile.name,
          isDigital: false,
          available: false,
          reason: 'profile_not_ready',
          readinessIssues,
          currency: profile.shopCurrency,
        };
      }

      const match = matchDestinationRate(profile.rates, destination);

      if (!match.matched) {
        return {
          productId,
          profileId: profile.id,
          profileName: profile.name,
          isDigital: false,
          available: false,
          reason: 'unsupported_destination',
          readinessIssues,
          currency: profile.shopCurrency,
        };
      }

      return {
        productId,
        profileId: profile.id,
        profileName: profile.name,
        profileVersion: profile.version,
        profileShopId: profile.shopId,
        isDigital: false,
        available: true,
        readinessIssues,
        currency: profile.shopCurrency,
        rate: match.rate,
        processingTime: toShippingDurationRange(
          profile.processingTimeMinDays,
          profile.processingTimeMaxDays,
        ),
        deliveryTime: toShippingDurationRange(
          match.rate.deliveryTimeMinDays,
          match.rate.deliveryTimeMaxDays,
        ),
      };
    });
  }

  /**
   * Seller-arranged shipping money and estimate for a whole checkout. Each shop
   * is priced independently and a Product that cannot be delivered makes its
   * shop unavailable instead of falling back to zero, another Product's
   * profile, or a shop-wide rule.
   */
  async quoteForCheckout(
    input: CheckoutShippingQuoteInput,
  ): Promise<CheckoutShippingQuote> {
    const productIds = [...new Set(input.units.map((unit) => unit.productId))];

    const resolutions = await this.resolveForProducts({
      productIds,
      destination: input.destination,
    });

    const resolutionByProductId = new Map(
      resolutions.map((resolution) => [resolution.productId, resolution]),
    );

    const unitsByShopId = new Map<string, CheckoutShippingUnitInput[]>();

    for (const unit of input.units) {
      if (unit.quantity <= 0) {
        continue;
      }
      const existing = unitsByShopId.get(unit.shopId) ?? [];
      existing.push(unit);
      unitsByShopId.set(unit.shopId, existing);
    }

    const unavailable: ShippingQuoteUnavailableProduct[] = [];
    const shops: CheckoutShippingShopQuote[] = [];
    const rateCache: FxRateCache = new Map();

    for (const shopId of [...unitsByShopId.keys()].sort()) {
      const shopUnits = unitsByShopId.get(shopId) ?? [];
      const resolvedUnits: ResolvedCheckoutShippingUnit[] = [];
      let shopUnavailable = false;

      for (const unit of shopUnits) {
        const resolution = resolutionByProductId.get(unit.productId);

        // Digital units are delivered by download, not by carrier: they are
        // excluded from the charge, estimate, and profile snapshots instead of
        // being priced or reported unavailable.
        if (resolution?.isDigital) {
          continue;
        }

        const resolved = toResolvedCheckoutShippingUnit(unit, resolution);

        if (!resolved) {
          shopUnavailable = true;
          unavailable.push({
            productId: unit.productId,
            inventoryId: unit.inventoryId,
            quantity: unit.quantity,
            reason: resolution?.reason ?? 'missing_assignment',
            readinessIssues: resolution?.readinessIssues ?? [],
          });
          continue;
        }

        resolvedUnits.push(resolved);
      }

      if (!shopUnavailable && resolvedUnits.length > 0) {
        const convertedUnits = await this.convertUnitsToCheckoutCurrency(
          resolvedUnits,
          input.checkoutCurrency,
          input.anchorAt,
          rateCache,
        );

        if (!convertedUnits) {
          // The shop's rates cannot be converted into the checkout currency:
          // its units stay unavailable rather than being charged as if the
          // seller's minor units were already the buyer's currency.
          for (const unit of resolvedUnits) {
            unavailable.push({
              productId: unit.input.productId,
              inventoryId: unit.input.inventoryId,
              quantity: unit.input.quantity,
              reason: 'unsupported_currency',
              readinessIssues: [],
            });
          }

          continue;
        }

        shops.push(buildShopShippingQuote(shopId, convertedUnits, input.anchorAt));
      }
    }

    unavailable.sort((left, right) =>
      left.productId.localeCompare(right.productId)
      || left.inventoryId.localeCompare(right.inventoryId));

    return { anchorAt: input.anchorAt, shops, unavailable };
  }

  /**
   * Distinct ship-from countries of the profiles assigned to the given
   * Products. This is dispatch context for confirmed Orders, never a pricing
   * input, and it replaces per-Product shipping origin fields.
   */
  async listOriginCountries(productIds: string[]): Promise<string[]> {
    const assignments = await this.productShippingAssignmentPort.listByProductIds(productIds);

    const profiles = await this.shippingProfileRepository.findByIds(
      assignments
        .map((assignment) => assignment.shippingProfileId)
        .filter((shippingProfileId): shippingProfileId is string => Boolean(shippingProfileId)),
    );

    return [
      ...new Set(
        profiles
          .map((profile) => profile.shipFromCountry)
          .filter((country): country is string => Boolean(country)),
      ),
    ].sort();
  }

  /**
   * Converts every unit's seller-configured fee amounts from the owning shop's
   * currency into the checkout currency through the canonical FX seam, so the
   * accepted Shipping Charge is denominated in the buyer's checkout currency.
   * Returns nothing when a required rate is missing: the shop is then
   * unavailable rather than charged with the wrong minor units.
   */
  private async convertUnitsToCheckoutCurrency(
    units: ResolvedCheckoutShippingUnit[],
    checkoutCurrency: string,
    anchorAt: Date,
    rateCache: FxRateCache,
  ): Promise<ConvertedCheckoutShippingUnit[] | undefined> {
    const converted: ConvertedCheckoutShippingUnit[] = [];

    for (const unit of units) {
      const oneItemFee = await this.moneyConversionService.convert({
        amountMinor: unit.rate.oneItemFeeMinor,
        fromCurrency: unit.currency,
        toCurrency: checkoutCurrency,
        at: anchorAt,
        calculationType: 'shipping',
        rateCache,
      });
      const additionalItemFee = await this.moneyConversionService.convert({
        amountMinor: unit.rate.additionalItemFeeMinor,
        fromCurrency: unit.currency,
        toCurrency: checkoutCurrency,
        at: anchorAt,
        calculationType: 'shipping',
        rateCache,
      });

      if (!oneItemFee || !additionalItemFee) {
        return undefined;
      }

      converted.push({
        input: unit.input,
        profileId: unit.profileId,
        profileVersion: unit.profileVersion,
        profileShopId: unit.profileShopId,
        rate: unit.rate,
        sourceCurrency: unit.currency,
        checkoutCurrency,
        oneItemFeeMinor: oneItemFee.amountMinor,
        additionalItemFeeMinor: additionalItemFee.amountMinor,
        fx: oneItemFee.fx,
        processingTimeMinDays: unit.processingTimeMinDays,
        processingTimeMaxDays: unit.processingTimeMaxDays,
        deliveryTimeMinDays: unit.deliveryTimeMinDays,
        deliveryTimeMaxDays: unit.deliveryTimeMaxDays,
      });
    }

    return converted;
  }
}

interface ResolvedCheckoutShippingUnit {
  input: CheckoutShippingUnitInput;
  profileId: string;
  profileVersion: number;
  profileShopId: string;
  rate: ShippingDestinationRate;
  /** Currency the seller's rate amounts are denominated in (the Shop currency). */
  currency: string;
  processingTimeMinDays: number;
  processingTimeMaxDays: number;
  deliveryTimeMinDays: number;
  deliveryTimeMaxDays: number;
}

/**
 * A resolved unit whose accepted fees are already denominated in the checkout
 * currency. The seller's source amounts and the applied rate stay attached as
 * audit provenance.
 */
interface ConvertedCheckoutShippingUnit {
  input: CheckoutShippingUnitInput;
  profileId: string;
  profileVersion: number;
  profileShopId: string;
  rate: ShippingDestinationRate;
  sourceCurrency: string;
  checkoutCurrency: string;
  oneItemFeeMinor: number;
  additionalItemFeeMinor: number;
  fx?: ShippingQuoteFxProvenance;
  processingTimeMinDays: number;
  processingTimeMaxDays: number;
  deliveryTimeMinDays: number;
  deliveryTimeMaxDays: number;
}

/**
 * A unit is only priceable when the Product has an available resolution with a
 * matched rate, profile identity, and complete Processing/Delivery ranges.
 * Anything else is unavailable rather than priced.
 */
function toResolvedCheckoutShippingUnit(
  input: CheckoutShippingUnitInput,
  resolution: ProductShippingResolution | undefined,
): ResolvedCheckoutShippingUnit | undefined {
  const rate = resolution?.rate;
  const processingTime = resolution?.processingTime;
  const deliveryTime = resolution?.deliveryTime;

  if (
    !resolution?.available
    || !rate
    || !processingTime
    || !deliveryTime
    || !resolution.currency
    || !resolution.profileId
    || resolution.profileVersion === undefined
    || !resolution.profileShopId
  ) {
    return undefined;
  }

  return {
    input,
    profileId: resolution.profileId,
    profileVersion: resolution.profileVersion,
    profileShopId: resolution.profileShopId,
    rate,
    currency: resolution.currency,
    processingTimeMinDays: processingTime.minDays,
    processingTimeMaxDays: processingTime.maxDays,
    deliveryTimeMinDays: deliveryTime.minDays,
    deliveryTimeMaxDays: deliveryTime.maxDays,
  };
}

/**
 * Etsy-style combined fixed shipping: the unit with the highest applicable
 * one-item fee is charged once, then every remaining purchased unit (including
 * repeated quantity of the same Product Variant) adds its applicable
 * additional-item fee. Ties are broken by stable Product then Variant identity.
 */
function buildShopShippingQuote(
  shopId: string,
  units: ConvertedCheckoutShippingUnit[],
  anchorAt: Date,
): CheckoutShippingShopQuote {
  const sortedUnits = [...units].sort((left, right) =>
    left.input.productId.localeCompare(right.input.productId)
    || left.input.inventoryId.localeCompare(right.input.inventoryId));

  const instances: ConvertedCheckoutShippingUnit[] = [];
  for (const unit of sortedUnits) {
    for (let copy = 0; copy < unit.input.quantity; copy += 1) {
      instances.push(unit);
    }
  }

  let baseIndex = 0;
  for (let index = 1; index < instances.length; index += 1) {
    if (
      instances[index].oneItemFeeMinor >
      instances[baseIndex].oneItemFeeMinor
    ) {
      baseIndex = index;
    }
  }

  const baseInstance = instances[baseIndex];
  const additionalComponents: ShippingQuoteAdditionalComponent[] = [];

  for (const [index, instance] of instances.entries()) {
    if (index === baseIndex) {
      continue;
    }

    const existing = additionalComponents.find(
      (component) =>
        component.productId === instance.input.productId
        && component.inventoryId === instance.input.inventoryId,
    );

    if (existing) {
      existing.quantity += 1;
      continue;
    }

    additionalComponents.push({
      productId: instance.input.productId,
      inventoryId: instance.input.inventoryId,
      quantity: 1,
      additionalItemFeeMinor: instance.additionalItemFeeMinor,
    });
  }

  const baseItemFeeMinor = baseInstance.oneItemFeeMinor;
  const additionalItemFeeMinorTotal = additionalComponents.reduce(
    (total, component) => total + (component.additionalItemFeeMinor * component.quantity),
    0,
  );

  const estimate: ShippingQuoteEstimate = calculateShippingEstimate({
    processingTimeMinDays: Math.min(...sortedUnits.map((unit) => unit.processingTimeMinDays)),
    processingTimeMaxDays: Math.max(...sortedUnits.map((unit) => unit.processingTimeMaxDays)),
    deliveryTimeMinDays: Math.min(...sortedUnits.map((unit) => unit.deliveryTimeMinDays)),
    deliveryTimeMaxDays: Math.max(...sortedUnits.map((unit) => unit.deliveryTimeMaxDays)),
    anchorAt,
  });

  const snapshots: ShippingQuoteUnitSnapshot[] = sortedUnits.map((unit) => ({
    productId: unit.input.productId,
    inventoryId: unit.input.inventoryId,
    quantity: unit.input.quantity,
    profileId: unit.profileId,
    profileVersion: unit.profileVersion,
    profileShopId: unit.profileShopId,
    rateId: unit.rate.id,
    rateDestinationScope: unit.rate.destinationScope,
    rateDestinationCountry: unit.rate.destinationCountry,
    currency: unit.checkoutCurrency,
    oneItemFeeMinor: unit.oneItemFeeMinor,
    additionalItemFeeMinor: unit.additionalItemFeeMinor,
    ...(unit.sourceCurrency === unit.checkoutCurrency
      ? {}
      : {
        sourceCurrency: unit.sourceCurrency,
        sourceOneItemFeeMinor: unit.rate.oneItemFeeMinor,
        sourceAdditionalItemFeeMinor: unit.rate.additionalItemFeeMinor,
        ...(unit.fx ? { fx: unit.fx } : {}),
      }),
    processingTimeMinDays: unit.processingTimeMinDays,
    processingTimeMaxDays: unit.processingTimeMaxDays,
    deliveryTimeMinDays: unit.deliveryTimeMinDays,
    deliveryTimeMaxDays: unit.deliveryTimeMaxDays,
  }));

  return {
    shopId,
    currency: sortedUnits[0]?.checkoutCurrency ?? '',
    charge: {
      currency: sortedUnits[0]?.checkoutCurrency ?? '',
      quantity: instances.length,
      baseUnit: {
        productId: baseInstance.input.productId,
        inventoryId: baseInstance.input.inventoryId,
        oneItemFeeMinor: baseItemFeeMinor,
      },
      baseItemFeeMinor,
      baseItemTotalMinor: baseItemFeeMinor,
      additionalItemsQuantity: instances.length - 1,
      additionalComponents,
      additionalItemFeeMinorTotal,
      totalMinor: baseItemFeeMinor + additionalItemFeeMinorTotal,
    },
    estimate,
    units: snapshots,
  };
}
