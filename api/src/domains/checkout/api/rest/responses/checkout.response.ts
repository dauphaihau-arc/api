import type {
  CheckoutQuoteResult,
  CreateOrderResult,
  OrderFulfillmentSummary,
  OrderListResult,
} from '../../../../order/app/order.types';
import type { CheckoutConfig } from '~/platform/config/checkout.config';
import { getMaxOrderTotalMinor } from '~/platform/config/checkout.config';
import {
  toPublicShippingDiscount,
  toPublicShippingQuote,
} from '../../../app/checkout-shipping-snapshot.contract';
import { toOrderShippingResponse } from '../../../../order/api/rest/responses/order.response';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FulfillmentAggregateStatus } from '../../../../fulfillment/domain/enums/fulfillment-aggregate-status.enum';
import { FulfillmentMethod } from '../../../../fulfillment/domain/enums/fulfillment-method.enum';
import { FulfillmentOperator } from '../../../../fulfillment/domain/enums/fulfillment-operator.enum';
import { FulfillmentProvenance } from '../../../../fulfillment/domain/enums/fulfillment-provenance.enum';
import { ShipmentStatus } from '../../../../fulfillment/domain/enums/shipment-status.enum';
import { ShipmentUpdateActorType } from '../../../../fulfillment/domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../../fulfillment/domain/enums/shipment-update-source.enum';
import { PromotionMinOrderType } from '../../../../promotion/domain/enums/promotion-min-order-type.enum';
import { PromotionProductScope } from '../../../../promotion/domain/enums/promotion-product-scope.enum';
import { ShippingDestinationScope } from '../../../../shipping/domain/enums/shipping-destination-scope.enum';

export class CheckoutOrderShopRefShopResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  shop_name!: string;

  @ApiProperty()
  slug!: string;
}

export class CheckoutOrderShopRefResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  order_number!: string;

  @ApiProperty({ type: CheckoutOrderShopRefShopResponseDto })
  @Type(() => CheckoutOrderShopRefShopResponseDto)
  shop!: CheckoutOrderShopRefShopResponseDto;
}

export class CreateOrderResponseDto {
  @ApiProperty({ type: String, required: false })
  checkout_session_url?: string;

  @ApiProperty()
  checkout_pending!: boolean;

  @ApiProperty({ type: [CheckoutOrderShopRefResponseDto] })
  @Type(() => CheckoutOrderShopRefResponseDto)
  order_shops!: CheckoutOrderShopRefResponseDto[];
}

export class CheckoutSessionOrderResponseDto {
  @ApiProperty({ type: [CheckoutOrderShopRefResponseDto] })
  @Type(() => CheckoutOrderShopRefResponseDto)
  order_shops!: CheckoutOrderShopRefResponseDto[];
}

export class ShippingQuoteFxResponseDto {
  @ApiProperty()
  rate!: string;

  @ApiProperty()
  source!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  effective_at!: Date;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  source_timestamp?: Date;
}

export class ShippingQuoteUnitResponseDto {
  @ApiProperty()
  product_id!: string;

  @ApiProperty()
  inventory_id!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  profile_id!: string;

  @ApiProperty()
  profile_version!: number;

  @ApiProperty()
  profile_shop_id!: string;

  @ApiProperty()
  rate_id!: string;

  @ApiProperty({ enum: ShippingDestinationScope })
  rate_destination_scope!: ShippingDestinationScope;

  @ApiProperty({ type: String, required: false })
  rate_destination_country?: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  one_item_fee_minor!: number;

  @ApiProperty()
  additional_item_fee_minor!: number;

  @ApiProperty({ type: String, required: false })
  source_currency?: string;

  @ApiProperty({ type: Number, required: false })
  source_one_item_fee_minor?: number;

  @ApiProperty({ type: Number, required: false })
  source_additional_item_fee_minor?: number;

  @ApiProperty({ type: ShippingQuoteFxResponseDto, required: false })
  @Type(() => ShippingQuoteFxResponseDto)
  fx?: ShippingQuoteFxResponseDto;

  @ApiProperty()
  processing_time_min_days!: number;

  @ApiProperty()
  processing_time_max_days!: number;

  @ApiProperty()
  delivery_time_min_days!: number;

  @ApiProperty()
  delivery_time_max_days!: number;
}

export class ShippingQuoteBaseUnitResponseDto {
  @ApiProperty()
  product_id!: string;

  @ApiProperty()
  inventory_id!: string;

  @ApiProperty()
  one_item_fee_minor!: number;
}

export class ShippingQuoteAdditionalComponentResponseDto {
  @ApiProperty()
  product_id!: string;

  @ApiProperty()
  inventory_id!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  additional_item_fee_minor!: number;
}

export class ShippingQuoteChargeResponseDto {
  @ApiProperty()
  currency!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ type: ShippingQuoteBaseUnitResponseDto })
  @Type(() => ShippingQuoteBaseUnitResponseDto)
  base_unit!: ShippingQuoteBaseUnitResponseDto;

  @ApiProperty()
  base_item_fee_minor!: number;

  @ApiProperty()
  base_item_total_minor!: number;

  @ApiProperty()
  additional_items_quantity!: number;

  @ApiProperty({ type: [ShippingQuoteAdditionalComponentResponseDto] })
  @Type(() => ShippingQuoteAdditionalComponentResponseDto)
  additional_components!: ShippingQuoteAdditionalComponentResponseDto[];

  @ApiProperty()
  additional_item_fee_minor_total!: number;

  @ApiProperty()
  total_minor!: number;
}

export class ShippingQuoteEstimateResponseDto {
  @ApiProperty()
  processing_time_min_days!: number;

  @ApiProperty()
  processing_time_max_days!: number;

  @ApiProperty()
  delivery_time_min_days!: number;

  @ApiProperty()
  delivery_time_max_days!: number;

  @ApiProperty()
  combined_min_days!: number;

  @ApiProperty()
  combined_max_days!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  anchor_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  earliest_delivery_date!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  latest_delivery_date!: Date;
}

export class ShippingQuoteSnapshotResponseDto {
  @ApiProperty()
  shop_id!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ type: ShippingQuoteChargeResponseDto })
  @Type(() => ShippingQuoteChargeResponseDto)
  charge!: ShippingQuoteChargeResponseDto;

  @ApiProperty({ type: ShippingQuoteEstimateResponseDto })
  @Type(() => ShippingQuoteEstimateResponseDto)
  estimate!: ShippingQuoteEstimateResponseDto;

  @ApiProperty({ type: [ShippingQuoteUnitResponseDto] })
  @Type(() => ShippingQuoteUnitResponseDto)
  units!: ShippingQuoteUnitResponseDto[];
}

export class ShippingDiscountResponseDto {
  @ApiProperty()
  promotion_id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: ['free_shipping'] })
  benefit_type!: 'free_shipping';

  @ApiProperty({ enum: PromotionProductScope })
  product_scope!: PromotionProductScope;

  @ApiProperty({ type: [String] })
  product_ids!: string[];

  @ApiProperty({ enum: PromotionMinOrderType })
  min_order_type!: PromotionMinOrderType;

  @ApiProperty()
  min_order_value!: number;

  @ApiProperty()
  min_purchase_quantity!: number;

  @ApiProperty()
  max_redemptions!: number;

  @ApiProperty()
  max_redemptions_per_buyer!: number;

  @ApiProperty()
  redemption_count!: number;

  @ApiProperty()
  waived_minor!: number;

  @ApiProperty()
  currency!: string;
}

export class CheckoutQuoteSelectedOptionResponseDto {
  @ApiProperty({ type: String, required: false })
  option_id?: string;

  @ApiProperty()
  option_name!: string;

  @ApiProperty({ type: String, required: false })
  value_id?: string;

  @ApiProperty()
  value!: string;
}

export class CheckoutQuoteItemResponseDto {
  @ApiProperty()
  inventory_id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, required: false })
  image_url?: string;

  @ApiProperty({ type: String, required: false })
  image_reference?: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ type: String, required: false })
  sku?: string;

  @ApiProperty({ type: [CheckoutQuoteSelectedOptionResponseDto] })
  @Type(() => CheckoutQuoteSelectedOptionResponseDto)
  selected_options!: CheckoutQuoteSelectedOptionResponseDto[];

  @ApiProperty()
  source_currency!: string;

  @ApiProperty()
  unit_price_source_minor!: number;

  @ApiProperty()
  line_total_source_minor!: number;

  @ApiProperty()
  checkout_currency!: string;

  @ApiProperty()
  unit_price_checkout_minor!: number;

  @ApiProperty()
  line_total_checkout_minor!: number;

  @ApiProperty({ type: Number, required: false })
  original_amount_minor?: number;

  @ApiProperty()
  promo_discount_minor!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ enum: ['market_override', 'base_native', 'base_fx'], required: false })
  source_type?: 'market_override' | 'base_native' | 'base_fx';

  @ApiProperty({ type: String, required: false })
  fx_rate?: string;

  @ApiProperty({ type: String, required: false })
  fx_source?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  fx_effective_at?: Date;
}

export class CheckoutQuoteShopResponseDto {
  @ApiProperty()
  shop_id!: string;

  @ApiProperty()
  shop_name!: string;

  @ApiProperty()
  shop_slug!: string;

  @ApiProperty()
  subtotal_minor!: number;

  @ApiProperty()
  discount_minor!: number;

  @ApiProperty()
  sale_discount_minor!: number;

  @ApiProperty()
  shipping_minor!: number;

  @ApiProperty()
  shipping_discount_minor!: number;

  @ApiProperty()
  total_minor!: number;

  @ApiProperty({ type: String, required: false })
  note?: string;

  @ApiProperty({ type: [String] })
  promo_codes!: string[];

  @ApiProperty({ type: [String] })
  origin_countries!: string[];

  @ApiProperty({ type: ShippingQuoteSnapshotResponseDto, required: false })
  @Type(() => ShippingQuoteSnapshotResponseDto)
  shipping?: ShippingQuoteSnapshotResponseDto;

  @ApiProperty({ type: [ShippingDiscountResponseDto] })
  @Type(() => ShippingDiscountResponseDto)
  shipping_discounts!: ShippingDiscountResponseDto[];
}

export class CheckoutPolicyResponseDto {
  @ApiProperty()
  max_order_total_minor!: number;
}

export class CheckoutQuoteResponseDto {
  @ApiProperty()
  quote_id!: string;

  @ApiProperty({ type: String, required: false })
  presentment_currency?: string;

  @ApiProperty()
  checkout_currency!: string;

  @ApiProperty({ type: CheckoutPolicyResponseDto, required: false })
  @Type(() => CheckoutPolicyResponseDto)
  checkout_policy?: CheckoutPolicyResponseDto;

  @ApiProperty()
  subtotal_minor!: number;

  @ApiProperty()
  shipping_minor!: number;

  @ApiProperty()
  discount_minor!: number;

  @ApiProperty()
  sale_discount_minor!: number;

  @ApiProperty()
  total_minor!: number;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  shipping_anchor_at?: Date;

  @ApiProperty({ type: [CheckoutQuoteShopResponseDto] })
  @Type(() => CheckoutQuoteShopResponseDto)
  shops!: CheckoutQuoteShopResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  expires_at!: Date;

  @ApiProperty({ type: [CheckoutQuoteItemResponseDto] })
  @Type(() => CheckoutQuoteItemResponseDto)
  items!: CheckoutQuoteItemResponseDto[];
}

export class CheckoutOrderPaymentResponseDto {
  @ApiProperty()
  type!: string;

  @ApiProperty({ type: String, required: false })
  refund_status?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  refunded_at?: Date;

  @ApiProperty({ type: String, required: false })
  refund_failed_reason?: string;
}

export class CheckoutOrderProductShopResponseDto {
  @ApiProperty()
  slug!: string;
}

export class CheckoutOrderProductDetailsResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: CheckoutOrderProductShopResponseDto })
  @Type(() => CheckoutOrderProductShopResponseDto)
  shop!: CheckoutOrderProductShopResponseDto;

  @ApiProperty({ type: [CheckoutQuoteSelectedOptionResponseDto] })
  @Type(() => CheckoutQuoteSelectedOptionResponseDto)
  selected_options!: CheckoutQuoteSelectedOptionResponseDto[];

  /** Empty placeholder object retained for transport shape compatibility. */
  @ApiProperty({ type: Object })
  shipping!: Record<string, never>;
}

export class CheckoutOrderProductInventoryResponseDto {
  @ApiProperty({ type: String, required: false })
  sku?: string;
}

export class CheckoutOrderProductResponseDto {
  @ApiProperty({ type: CheckoutOrderProductDetailsResponseDto })
  @Type(() => CheckoutOrderProductDetailsResponseDto)
  product!: CheckoutOrderProductDetailsResponseDto;

  @ApiProperty({ type: CheckoutOrderProductInventoryResponseDto })
  @Type(() => CheckoutOrderProductInventoryResponseDto)
  inventory!: CheckoutOrderProductInventoryResponseDto;

  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, required: false })
  image_url?: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  amount_minor!: number;

  @ApiProperty({ type: Number, nullable: true })
  original_amount_minor!: number | null;

  @ApiProperty()
  currency!: string;
}

export class CheckoutOrderPromoCodeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;
}

export class FulfillmentProgressResponseDto {
  @ApiProperty()
  ordered!: number;

  @ApiProperty()
  prepared!: number;

  @ApiProperty()
  dispatched!: number;

  @ApiProperty()
  delivered!: number;

  @ApiProperty()
  canceled!: number;

  @ApiProperty()
  outstanding!: number;
}

export class FulfillmentGroupItemResponseDto {
  @ApiProperty()
  order_item_id!: string;

  @ApiProperty()
  quantity!: number;
}

export class FulfillmentShipmentUpdateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ShipmentStatus })
  status!: ShipmentStatus;

  @ApiProperty({ enum: ShipmentUpdateActorType })
  actor_type!: ShipmentUpdateActorType;

  @ApiProperty({ type: String, required: false })
  actor_id?: string;

  @ApiProperty({ enum: ShipmentUpdateSource })
  source!: ShipmentUpdateSource;

  @ApiProperty({ type: String, format: 'date-time' })
  occurred_at!: Date;

  @ApiProperty({ type: String, required: false })
  note?: string;
}

export class FulfillmentShipmentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  group_id!: string;

  @ApiProperty({ enum: ShipmentStatus })
  status!: ShipmentStatus;

  @ApiProperty({ type: String, required: false })
  carrier?: string;

  @ApiProperty({ type: String, required: false })
  tracking_number?: string;

  @ApiProperty({ type: String, required: false })
  shipment_note?: string;

  @ApiProperty({ type: [String] })
  origin_countries!: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  prepared_at!: Date;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  dispatched_at?: Date;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  delivered_at?: Date;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  voided_at?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;

  @ApiProperty({ type: [FulfillmentGroupItemResponseDto] })
  @Type(() => FulfillmentGroupItemResponseDto)
  items!: FulfillmentGroupItemResponseDto[];

  @ApiProperty({ type: [FulfillmentShipmentUpdateResponseDto] })
  @Type(() => FulfillmentShipmentUpdateResponseDto)
  updates!: FulfillmentShipmentUpdateResponseDto[];
}

export class FulfillmentGroupResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: FulfillmentMethod })
  method!: FulfillmentMethod;

  @ApiProperty({ enum: FulfillmentOperator })
  operator!: FulfillmentOperator;

  @ApiProperty({ enum: FulfillmentProvenance })
  provenance!: FulfillmentProvenance;

  @ApiProperty({ type: [FulfillmentGroupItemResponseDto] })
  @Type(() => FulfillmentGroupItemResponseDto)
  items!: FulfillmentGroupItemResponseDto[];

  @ApiProperty({ type: FulfillmentProgressResponseDto })
  @Type(() => FulfillmentProgressResponseDto)
  progress!: FulfillmentProgressResponseDto;

  @ApiProperty({ type: [FulfillmentShipmentResponseDto] })
  @Type(() => FulfillmentShipmentResponseDto)
  shipments!: FulfillmentShipmentResponseDto[];
}

export class CheckoutLegacyShippingResponseDto {
  @ApiProperty()
  status!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;

  @ApiProperty()
  to_country!: string;

  @ApiProperty({ type: [String] })
  from_countries!: string[];

  @ApiProperty({ type: String, format: 'date-time', required: false })
  estimated_delivery?: Date;

  @ApiProperty({ type: String, required: false })
  tracking_number?: string;

  @ApiProperty({ type: String, required: false })
  carrier?: string;

  @ApiProperty({ type: String, required: false })
  note?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  shipped_at?: Date;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  delivered_at?: Date;
}

export class CheckoutOrderFulfillmentResponseDto {
  @ApiProperty({ enum: FulfillmentAggregateStatus })
  status!: FulfillmentAggregateStatus;

  @ApiProperty()
  requires_reconciliation!: boolean;

  @ApiProperty({ type: FulfillmentProgressResponseDto })
  @Type(() => FulfillmentProgressResponseDto)
  progress!: FulfillmentProgressResponseDto;

  @ApiProperty({ type: [FulfillmentGroupResponseDto] })
  @Type(() => FulfillmentGroupResponseDto)
  groups!: FulfillmentGroupResponseDto[];

  @ApiProperty({ type: CheckoutLegacyShippingResponseDto })
  @Type(() => CheckoutLegacyShippingResponseDto)
  legacy_shipping!: CheckoutLegacyShippingResponseDto;
}

export class CheckoutOrderShopResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  order_number!: string;

  @ApiProperty({ type: CheckoutOrderShopRefShopResponseDto })
  @Type(() => CheckoutOrderShopRefShopResponseDto)
  shop!: CheckoutOrderShopRefShopResponseDto;

  @ApiProperty({ type: CheckoutOrderPaymentResponseDto })
  @Type(() => CheckoutOrderPaymentResponseDto)
  payment!: CheckoutOrderPaymentResponseDto;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: [CheckoutOrderProductResponseDto] })
  @Type(() => CheckoutOrderProductResponseDto)
  products!: CheckoutOrderProductResponseDto[];

  @ApiProperty({ type: [CheckoutOrderPromoCodeResponseDto] })
  @Type(() => CheckoutOrderPromoCodeResponseDto)
  promo_codes!: CheckoutOrderPromoCodeResponseDto[];

  @ApiProperty({ type: CheckoutOrderFulfillmentResponseDto })
  @Type(() => CheckoutOrderFulfillmentResponseDto)
  fulfillment!: CheckoutOrderFulfillmentResponseDto;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  canceled_at?: Date;

  @ApiProperty({ type: String, required: false })
  cancel_reason?: string;

  @ApiProperty({ type: String, required: false })
  customer_support_note?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  cancel_requested_at?: Date;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ type: Number, required: false })
  subtotal_minor?: number;

  @ApiProperty({ type: Number, required: false })
  shipping_minor?: number;

  @ApiProperty({ type: ShippingQuoteSnapshotResponseDto, required: false })
  @Type(() => ShippingQuoteSnapshotResponseDto)
  shipping?: ShippingQuoteSnapshotResponseDto;

  @ApiProperty({ type: Number, required: false })
  shipping_discount_minor?: number;

  @ApiProperty({ type: [ShippingDiscountResponseDto], required: false })
  @Type(() => ShippingDiscountResponseDto)
  shipping_discounts?: ShippingDiscountResponseDto[];

  @ApiProperty({ type: Number, required: false })
  discount_minor?: number;

  @ApiProperty({ type: Number, required: false })
  total_minor?: number;

  @ApiProperty({ type: String, required: false })
  note?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;
}

export class CheckoutOrderListResponseDto {
  @ApiProperty({ type: [CheckoutOrderShopResponseDto] })
  @Type(() => CheckoutOrderShopResponseDto)
  order_shops!: CheckoutOrderShopResponseDto[];
}

function toCheckoutFulfillmentResponse(fulfillment: OrderFulfillmentSummary) {
  const toProgressResponse = (
    progress: OrderFulfillmentSummary['progress'],
  ) => ({
    ordered: progress.ordered,
    prepared: progress.prepared,
    dispatched: progress.dispatched,
    delivered: progress.delivered,
    canceled: progress.canceled,
    outstanding: progress.outstanding,
  });

  return {
    status: fulfillment.status,
    requires_reconciliation: fulfillment.requiresReconciliation,
    progress: toProgressResponse(fulfillment.progress),
    groups: fulfillment.groups.map((group) => ({
      id: group.id,
      method: group.method,
      operator: group.operator,
      provenance: group.provenance,
      items: group.items.map((item) => ({
        order_item_id: item.orderItemId,
        quantity: item.quantity,
      })),
      progress: toProgressResponse(group.progress),
      shipments: group.shipments.map((shipment) => ({
        id: shipment.publicId,
        group_id: shipment.groupId,
        status: shipment.status,
        carrier: shipment.carrier,
        tracking_number: shipment.trackingNumber,
        shipment_note: shipment.note,
        origin_countries: shipment.originCountries,
        prepared_at: shipment.preparedAt,
        dispatched_at: shipment.dispatchedAt,
        delivered_at: shipment.deliveredAt,
        voided_at: shipment.voidedAt,
        created_at: shipment.createdAt,
        updated_at: shipment.updatedAt,
        items: shipment.items.map((item) => ({
          order_item_id: item.orderItemId,
          quantity: item.quantity,
        })),
        updates: shipment.updates.map((update) => ({
          id: update.id,
          status: update.status,
          actor_type: update.actorType,
          actor_id: update.actorId,
          source: update.source,
          occurred_at: update.occurredAt,
          note: update.note,
        })),
      })),
    })),
    legacy_shipping: {
      status: fulfillment.legacyShipping.status,
      updated_at: fulfillment.legacyShipping.updatedAt,
      to_country: fulfillment.legacyShipping.toCountry,
      from_countries: fulfillment.legacyShipping.fromCountries,
      estimated_delivery: fulfillment.legacyShipping.estimatedDelivery,
      tracking_number: fulfillment.legacyShipping.trackingNumber,
      carrier: fulfillment.legacyShipping.carrier,
      note: fulfillment.legacyShipping.note,
      shipped_at: fulfillment.legacyShipping.shippedAt,
      delivered_at: fulfillment.legacyShipping.deliveredAt,
    },
  };
}

export function toCreateOrderResponse(result: CreateOrderResult) {
  return {
    checkout_session_url: result.checkoutSessionUrl,
    checkout_pending: result.checkoutPending ?? false,
    order_shops: result.orderShops.map((orderShop) => ({
      id: orderShop.publicId,
      order_number: orderShop.orderNumber,
      shop: {
        id: orderShop.shopPublicId,
        shop_name: orderShop.shopName,
        slug: orderShop.shopSlug,
      },
    })),
  };
}

export function toCheckoutQuoteResponse(
  result: CheckoutQuoteResult,
  checkoutConfig?: CheckoutConfig,
) {
  return {
    quote_id: result.quoteId,
    presentment_currency: result.presentmentCurrency,
    checkout_currency: result.checkoutCurrency,
    ...(checkoutConfig
      ? {
        checkout_policy: {
          max_order_total_minor: getMaxOrderTotalMinor(
            checkoutConfig,
            result.checkoutCurrency,
          ),
        },
      }
      : {}),
    subtotal_minor: result.subtotalMinor,
    shipping_minor: result.shippingMinor,
    discount_minor: result.discountMinor,
    sale_discount_minor: result.saleDiscountMinor,
    total_minor: result.totalMinor,
    ...(result.shippingAnchorAt
      ? { shipping_anchor_at: result.shippingAnchorAt }
      : {}),
    shops: result.shops.map((shop) => ({
      shop_id: shop.shopPublicId,
      shop_name: shop.shopName,
      shop_slug: shop.shopSlug,
      subtotal_minor: shop.subtotalMinor,
      discount_minor: shop.discountMinor,
      sale_discount_minor: shop.saleDiscountMinor,
      shipping_minor: shop.shippingMinor,
      shipping_discount_minor: shop.shippingDiscountMinor,
      total_minor: shop.totalMinor,
      note: shop.note,
      promo_codes: shop.promoCodes,
      origin_countries: shop.originCountries,
      ...(shop.shipping ? { shipping: toPublicShippingQuote(shop.shipping, shop.shopPublicId, shop.items) } : {}),
      shipping_discounts: shop.shippingDiscounts.map(toPublicShippingDiscount),
    })),
    expires_at: result.expiresAt,
    items: result.items.map((item) => ({
      inventory_id: item.inventoryId,
      title: item.title,
      image_url: item.imageUrl,
      image_reference: item.imageReference,
      quantity: item.quantity,
      sku: item.sku,
      selected_options: (item.selectedOptions ?? []).map((selection) => ({
        option_id: selection.optionId,
        option_name: selection.optionName,
        value_id: selection.valueId,
        value: selection.value,
      })),
      source_currency: item.sourceCurrency,
      unit_price_source_minor: item.unitPriceSourceMinor,
      line_total_source_minor: item.lineTotalSourceMinor,
      checkout_currency: item.checkoutCurrency,
      unit_price_checkout_minor: item.unitPriceCheckoutMinor,
      line_total_checkout_minor: item.lineTotalCheckoutMinor,
      original_amount_minor: item.originalAmountMinor,
      promo_discount_minor: item.promoDiscountMinor,
      currency: item.checkoutCurrency,
      source_type: item.sourceType,
      fx_rate: item.fxRate,
      fx_source: item.fxSource,
      fx_effective_at: item.fxEffectiveAt,
    })),
  };
}

export function toCheckoutSessionOrderResponse(result: CreateOrderResult) {
  return {
    order_shops: result.orderShops.map((orderShop) => ({
      id: orderShop.publicId,
      order_number: orderShop.orderNumber,
      shop: {
        id: orderShop.shopPublicId,
        shop_name: orderShop.shopName,
        slug: orderShop.shopSlug,
      },
    })),
  };
}

export function toCheckoutOrderListResponse(result: OrderListResult) {
  return {
    order_shops: result.orderShops.map((orderShop) => ({
      id: orderShop.publicId,
      order_number: orderShop.orderNumber,
      shop: {
        id: orderShop.shopPublicId,
        shop_name: orderShop.shopName,
        slug: orderShop.shopSlug,
      },
      payment: {
        type: orderShop.paymentType,
        ...(typeof orderShop.paymentDetails?.['refund_status'] === 'string'
          ? { refund_status: orderShop.paymentDetails['refund_status'] }
          : {}),
        ...(orderShop.refundedAt ? { refunded_at: orderShop.refundedAt } : {}),
        ...(typeof orderShop.paymentDetails?.['refund_failed_reason'] === 'string'
          ? { refund_failed_reason: orderShop.paymentDetails['refund_failed_reason'] }
          : {}),
      },
      status: orderShop.status,
      products: orderShop.products.map((product) => ({
        product: {
          id: product.productPublicId,
          slug: product.slug,
          shop: {
            slug: product.shopSlug,
          },
          selected_options: (product.selectedOptions ?? []).map((selection) => ({
            option_id: selection.optionId,
            option_name: selection.optionName,
            value_id: selection.valueId,
            value: selection.value,
          })),
          shipping: {},
        },
        inventory: {
          sku: product.sku,
        },
        id: product.id,
        title: product.title,
        image_url: product.imageUrl,
        quantity: product.quantity,
        amount_minor: product.amountMinor,
        original_amount_minor: product.originalAmountMinor,
        currency: product.currency,
      })),
      promo_codes: orderShop.promoCodes.map((code) => ({
        id: code,
        code,
      })),
      fulfillment: toCheckoutFulfillmentResponse(orderShop.fulfillment),
      canceled_at: orderShop.canceledAt,
      cancel_reason: orderShop.cancelReason,
      customer_support_note: orderShop.customerSupportNote,
      cancel_requested_at: orderShop.cancelRequestedAt,
      currency: orderShop.currency,
      subtotal_minor: orderShop.subtotalMinor,
      shipping_minor: orderShop.shippingMinor,
      ...toOrderShippingResponse(orderShop.shippingQuote, orderShop.shopPublicId, orderShop.products),
      discount_minor: orderShop.discountMinor,
      total_minor: orderShop.totalMinor,
      note: orderShop.note,
      created_at: orderShop.createdAt,
    })),
  };
}
