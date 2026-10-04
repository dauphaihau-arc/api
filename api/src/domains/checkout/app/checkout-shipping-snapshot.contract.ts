import type { ShippingDiscountProvenance } from '../../order/app/order.types';
import type { ShippingDestinationScope } from '../../shipping/domain/enums/shipping-destination-scope.enum';
import type {
  CheckoutShippingShopQuote,
  ShippingQuoteUnitSnapshot,
} from '../../shipping/app/shipping.types';


/**
 * The accepted per-shop shipping facts as persisted: the frozen Shipping
 * Charge calculation, matched Shipping Profile/rate identities and versions,
 * converted and source fee amounts, Processing/Delivery ranges, and the
 * combined seller estimate. Quote creation writes it once into
 * `checkout_quotes.priced_shops`, confirmation copies it onto the Order, and
 * every later read parses it back unchanged, so Product or Shipping Profile
 * edits can never rewrite an accepted charge or estimate.
 *
 * This module is the exported application contract both checkout and ordering
 * use. It owns the single serializer/parser pair so quote persistence, order
 * persistence, and order reads cannot drift.
 */

export interface PersistedShippingQuote {
  shop_id: string;
  currency: string;
  charge: {
    currency: string;
    quantity: number;
    base_unit: {
      product_id: string;
      inventory_id: string;
      one_item_fee_minor: number;
    };
    base_item_fee_minor: number;
    base_item_total_minor: number;
    additional_items_quantity: number;
    additional_components: Array<{
      product_id: string;
      inventory_id: string;
      quantity: number;
      additional_item_fee_minor: number;
    }>;
    additional_item_fee_minor_total: number;
    total_minor: number;
  };
  estimate: {
    processing_time_min_days: number;
    processing_time_max_days: number;
    delivery_time_min_days: number;
    delivery_time_max_days: number;
    combined_min_days: number;
    combined_max_days: number;
    anchor_at: string;
    earliest_delivery_date: string;
    latest_delivery_date: string;
  };
  units: Array<{
    product_id: string;
    inventory_id: string;
    quantity: number;
    profile_id: string;
    profile_version: number;
    profile_shop_id: string;
    rate_id: string;
    rate_destination_scope: ShippingDestinationScope;
    rate_destination_country?: string;
    /** Checkout currency the accepted fees below are denominated in. */
    currency: string;
    one_item_fee_minor: number;
    additional_item_fee_minor: number;
    /**
     * Seller-configured amounts in the owning shop's currency, retained only
     * when they were converted into the checkout currency.
     */
    source_currency?: string;
    source_one_item_fee_minor?: number;
    source_additional_item_fee_minor?: number;
    fx?: {
      rate: string;
      source: string;
      effective_at: string;
      source_timestamp?: string;
    };
    processing_time_min_days: number;
    processing_time_max_days: number;
    delivery_time_min_days: number;
    delivery_time_max_days: number;
  }>;
}

export interface PersistedShippingDiscount {
  promotion_id: string;
  code: string;
  benefit_type: 'free_shipping';
  product_scope: ShippingDiscountProvenance['productScope'];
  product_ids: string[];
  min_order_type: ShippingDiscountProvenance['minOrderType'];
  min_order_value: number;
  min_purchase_quantity: number;
  max_redemptions: number;
  max_redemptions_per_buyer: number;
  redemption_count: number;
  waived_minor: number;
  currency: string;
}

export function toPersistedShippingQuote(
  shipping: CheckoutShippingShopQuote,
): PersistedShippingQuote {
  return {
    shop_id: shipping.shopId,
    currency: shipping.currency,
    charge: {
      currency: shipping.charge.currency,
      quantity: shipping.charge.quantity,
      base_unit: {
        product_id: shipping.charge.baseUnit.productId,
        inventory_id: shipping.charge.baseUnit.inventoryId,
        one_item_fee_minor: shipping.charge.baseUnit.oneItemFeeMinor,
      },
      base_item_fee_minor: shipping.charge.baseItemFeeMinor,
      base_item_total_minor: shipping.charge.baseItemTotalMinor,
      additional_items_quantity: shipping.charge.additionalItemsQuantity,
      additional_components: shipping.charge.additionalComponents.map((component) => ({
        product_id: component.productId,
        inventory_id: component.inventoryId,
        quantity: component.quantity,
        additional_item_fee_minor: component.additionalItemFeeMinor,
      })),
      additional_item_fee_minor_total: shipping.charge.additionalItemFeeMinorTotal,
      total_minor: shipping.charge.totalMinor,
    },
    estimate: {
      processing_time_min_days: shipping.estimate.processingTimeMinDays,
      processing_time_max_days: shipping.estimate.processingTimeMaxDays,
      delivery_time_min_days: shipping.estimate.deliveryTimeMinDays,
      delivery_time_max_days: shipping.estimate.deliveryTimeMaxDays,
      combined_min_days: shipping.estimate.combinedMinDays,
      combined_max_days: shipping.estimate.combinedMaxDays,
      anchor_at: shipping.estimate.anchorAt.toISOString(),
      earliest_delivery_date: shipping.estimate.earliestDeliveryDate.toISOString(),
      latest_delivery_date: shipping.estimate.latestDeliveryDate.toISOString(),
    },
    units: shipping.units.map((unit) => ({
      product_id: unit.productId,
      inventory_id: unit.inventoryId,
      quantity: unit.quantity,
      profile_id: unit.profileId,
      profile_version: unit.profileVersion,
      profile_shop_id: unit.profileShopId,
      rate_id: unit.rateId,
      rate_destination_scope: unit.rateDestinationScope,
      ...(unit.rateDestinationCountry
        ? { rate_destination_country: unit.rateDestinationCountry }
        : {}),
      currency: unit.currency,
      one_item_fee_minor: unit.oneItemFeeMinor,
      additional_item_fee_minor: unit.additionalItemFeeMinor,
      ...(unit.sourceCurrency
        ? {
          source_currency: unit.sourceCurrency,
          source_one_item_fee_minor: unit.sourceOneItemFeeMinor,
          source_additional_item_fee_minor: unit.sourceAdditionalItemFeeMinor,
        }
        : {}),
      ...(unit.fx
        ? {
          fx: {
            rate: unit.fx.rate,
            source: unit.fx.source,
            effective_at: unit.fx.effectiveAt.toISOString(),
            ...(unit.fx.sourceTimestamp
              ? { source_timestamp: unit.fx.sourceTimestamp.toISOString() }
              : {}),
          },
        }
        : {}),
      processing_time_min_days: unit.processingTimeMinDays,
      processing_time_max_days: unit.processingTimeMaxDays,
      delivery_time_min_days: unit.deliveryTimeMinDays,
      delivery_time_max_days: unit.deliveryTimeMaxDays,
    })),
  };
}

export function toPersistedShippingDiscount(
  discount: ShippingDiscountProvenance,
): PersistedShippingDiscount {
  return {
    promotion_id: discount.promotionId,
    code: discount.code,
    benefit_type: discount.benefitType,
    product_scope: discount.productScope,
    product_ids: discount.productIds,
    min_order_type: discount.minOrderType,
    min_order_value: discount.minOrderValue,
    min_purchase_quantity: discount.minPurchaseQuantity,
    max_redemptions: discount.maxRedemptions,
    max_redemptions_per_buyer: discount.maxRedemptionsPerBuyer,
    redemption_count: discount.redemptionCount,
    waived_minor: discount.waivedMinor,
    currency: discount.currency,
  };
}

export function parsePersistedShippingQuote(
  shipping: PersistedShippingQuote,
): CheckoutShippingShopQuote {
  return {
    shopId: shipping.shop_id,
    currency: shipping.currency,
    charge: {
      currency: shipping.charge.currency,
      quantity: shipping.charge.quantity,
      baseUnit: {
        productId: shipping.charge.base_unit.product_id,
        inventoryId: shipping.charge.base_unit.inventory_id,
        oneItemFeeMinor: shipping.charge.base_unit.one_item_fee_minor,
      },
      baseItemFeeMinor: shipping.charge.base_item_fee_minor,
      baseItemTotalMinor: shipping.charge.base_item_total_minor,
      additionalItemsQuantity: shipping.charge.additional_items_quantity,
      additionalComponents: shipping.charge.additional_components.map((component) => ({
        productId: component.product_id,
        inventoryId: component.inventory_id,
        quantity: component.quantity,
        additionalItemFeeMinor: component.additional_item_fee_minor,
      })),
      additionalItemFeeMinorTotal: shipping.charge.additional_item_fee_minor_total,
      totalMinor: shipping.charge.total_minor,
    },
    estimate: {
      processingTimeMinDays: shipping.estimate.processing_time_min_days,
      processingTimeMaxDays: shipping.estimate.processing_time_max_days,
      deliveryTimeMinDays: shipping.estimate.delivery_time_min_days,
      deliveryTimeMaxDays: shipping.estimate.delivery_time_max_days,
      combinedMinDays: shipping.estimate.combined_min_days,
      combinedMaxDays: shipping.estimate.combined_max_days,
      anchorAt: new Date(shipping.estimate.anchor_at),
      earliestDeliveryDate: new Date(shipping.estimate.earliest_delivery_date),
      latestDeliveryDate: new Date(shipping.estimate.latest_delivery_date),
    },
    units: shipping.units.map((unit): ShippingQuoteUnitSnapshot => ({
      productId: unit.product_id,
      inventoryId: unit.inventory_id,
      quantity: unit.quantity,
      profileId: unit.profile_id,
      profileVersion: unit.profile_version,
      profileShopId: unit.profile_shop_id,
      rateId: unit.rate_id,
      rateDestinationScope: unit.rate_destination_scope,
      rateDestinationCountry: unit.rate_destination_country,
      currency: unit.currency,
      oneItemFeeMinor: unit.one_item_fee_minor,
      additionalItemFeeMinor: unit.additional_item_fee_minor,
      sourceCurrency: unit.source_currency,
      sourceOneItemFeeMinor: unit.source_one_item_fee_minor,
      sourceAdditionalItemFeeMinor: unit.source_additional_item_fee_minor,
      ...(unit.fx
        ? {
          fx: {
            rate: unit.fx.rate,
            source: unit.fx.source,
            effectiveAt: new Date(unit.fx.effective_at),
            ...(unit.fx.source_timestamp
              ? { sourceTimestamp: new Date(unit.fx.source_timestamp) }
              : {}),
          },
        }
        : {}),
      processingTimeMinDays: unit.processing_time_min_days,
      processingTimeMaxDays: unit.processing_time_max_days,
      deliveryTimeMinDays: unit.delivery_time_min_days,
      deliveryTimeMaxDays: unit.delivery_time_max_days,
    })),
  };
}

export function parsePersistedShippingDiscount(
  discount: PersistedShippingDiscount,
): ShippingDiscountProvenance {
  return {
    promotionId: discount.promotion_id,
    code: discount.code,
    benefitType: discount.benefit_type,
    productScope: discount.product_scope,
    productIds: discount.product_ids,
    minOrderType: discount.min_order_type,
    minOrderValue: discount.min_order_value,
    minPurchaseQuantity: discount.min_purchase_quantity,
    maxRedemptions: discount.max_redemptions,
    maxRedemptionsPerBuyer: discount.max_redemptions_per_buyer,
    redemptionCount: discount.redemption_count,
    waivedMinor: discount.waived_minor,
    currency: discount.currency,
  };
}

/**
 * The accepted shipping facts copied onto a confirmed Order: the frozen
 * per-shop Shipping Charge calculation, matched profile/rate identities and
 * versions, Processing/Delivery ranges, combined estimate, and any shipping
 * waiver. It is written once at confirmation and never rewritten by later
 * Product/Profile edits or by shipment splitting.
 */
export interface PersistedOrderShippingSnapshot {
  shipping: PersistedShippingQuote;
  shipping_discount_minor: number;
  shipping_discounts: PersistedShippingDiscount[];
}

export function toPersistedOrderShippingSnapshot(input: {
  shipping: CheckoutShippingShopQuote;
  shippingDiscountMinor: number;
  shippingDiscounts: ShippingDiscountProvenance[];
}): PersistedOrderShippingSnapshot {
  return {
    shipping: toPersistedShippingQuote(input.shipping),
    shipping_discount_minor: input.shippingDiscountMinor,
    shipping_discounts: input.shippingDiscounts.map(toPersistedShippingDiscount),
  };
}

export function parsePersistedOrderShippingSnapshot(
  snapshot: Record<string, unknown> | undefined,
): {
  shipping: CheckoutShippingShopQuote;
  shippingDiscountMinor: number;
  shippingDiscounts: ShippingDiscountProvenance[];
} | undefined {
  const persisted = snapshot as PersistedOrderShippingSnapshot | undefined;

  if (!persisted?.shipping) {
    return undefined;
  }

  return {
    shipping: parsePersistedShippingQuote(persisted.shipping),
    shippingDiscountMinor: persisted.shipping_discount_minor ?? 0,
    shippingDiscounts: (persisted.shipping_discounts ?? [])
      .map(parsePersistedShippingDiscount),
  };
}
