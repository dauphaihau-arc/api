import type {
  OrderFulfillmentSummary,
  AdminOrderListResult,
  CheckoutQuoteResult,
  AdminOrderDetail,
  CreateOrderResult,
  MyOrderDetail,
  OrderListResult,
  OrderShippingQuote,
  ShopDashboardResult,
  ShopOrderDetail,
  ShopOrderListResult,
  ShopOrderSummary,
} from '../../../app/order.types';
import {
  toPublicShippingDiscount,
  toPublicShippingQuote,
} from '../../../../checkout/app/checkout-shipping-snapshot.contract';
import { toMinorUnits } from '~/platform/money/money';
import type { CheckoutConfig } from '~/platform/config/checkout.config';
import { getMaxOrderTotalMinor } from '~/platform/config/checkout.config';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class OrderShopRefResponseDto {
  @ApiProperty({ description: 'Shop public id (shop_…).' })
  id!: string;

  @ApiProperty()
  shop_name!: string;

  @ApiProperty()
  slug!: string;
}

export class OrderProductShopRefResponseDto {
  @ApiProperty()
  slug!: string;
}

export class OrderSelectedOptionResponseDto {
  @ApiProperty()
  option_id!: string;

  @ApiProperty()
  option_name!: string;

  @ApiProperty()
  value_id!: string;

  @ApiProperty()
  value!: string;
}

export class OrderProductRefResponseDto {
  @ApiProperty({ description: 'Product public id (prod_…).' })
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: OrderProductShopRefResponseDto })
  @Type(() => OrderProductShopRefResponseDto)
  shop!: OrderProductShopRefResponseDto;

  @ApiProperty({ type: [OrderSelectedOptionResponseDto] })
  @Type(() => OrderSelectedOptionResponseDto)
  selected_options!: OrderSelectedOptionResponseDto[];

  @ApiProperty({ type: Object, description: 'Reserved; always an empty object.' })
  shipping!: Record<string, never>;
}

export class OrderInventorySkuResponseDto {
  @ApiProperty({ required: false })
  sku?: string;
}

export class OrderReviewImageVariantResponseDto {
  @ApiProperty()
  url!: string;

  @ApiProperty({ required: false })
  width?: number;

  @ApiProperty({ required: false })
  height?: number;

  @ApiProperty({ required: false })
  format?: string;
}

export class OrderReviewImageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty({ required: false })
  size_bytes?: number;

  @ApiProperty()
  rank!: number;

  @ApiProperty({ required: false })
  variant_status?: string;

  @ApiProperty({ required: false })
  variant_error?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  variants_generated_at?: Date;

  @ApiProperty({ type: Object, required: false })
  variants?: Record<string, OrderReviewImageVariantResponseDto>;
}

export class OrderReviewResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  rating!: number;

  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty({ required: false })
  body?: string;

  @ApiProperty({ enum: ['published', 'hidden'] })
  status!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;

  @ApiProperty({ type: [OrderReviewImageResponseDto] })
  @Type(() => OrderReviewImageResponseDto)
  images!: OrderReviewImageResponseDto[];
}

export class OrderProductLineResponseDto {
  @ApiProperty({ type: OrderProductRefResponseDto })
  @Type(() => OrderProductRefResponseDto)
  product!: OrderProductRefResponseDto;

  @ApiProperty({ type: OrderInventorySkuResponseDto })
  @Type(() => OrderInventorySkuResponseDto)
  inventory!: OrderInventorySkuResponseDto;

  @ApiProperty({ description: 'Order item internal id.' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ required: false })
  image_url?: string;

  @ApiProperty({ required: false })
  image_reference?: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  amount_minor!: number;

  @ApiProperty()
  original_amount_minor!: number;

  @ApiProperty()
  promo_discount_minor!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ type: OrderReviewResponseDto, required: false })
  @Type(() => OrderReviewResponseDto)
  my_review?: OrderReviewResponseDto;
}

export class OrderPaymentResponseDto {
  @ApiProperty()
  type!: string;

  @ApiProperty({ required: false })
  refund_status?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  refunded_at?: Date;

  @ApiProperty({ required: false })
  refund_failed_reason?: string;
}

export class OrderPromoCodeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;
}

export class OrderAmountSummaryResponseDto {
  @ApiProperty()
  currency!: string;

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
}

export class OrderFulfillmentProgressResponseDto {
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

export class OrderShipmentItemResponseDto {
  @ApiProperty({ description: 'Order item internal id.' })
  order_item_id!: string;

  @ApiProperty()
  quantity!: number;
}

export class OrderShipmentUpdateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  actor_type!: string;

  @ApiProperty({ required: false })
  actor_id?: string;

  @ApiProperty({ required: false })
  source?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  occurred_at!: Date;

  @ApiProperty({ required: false })
  note?: string;
}

export class OrderShipmentResponseDto {
  @ApiProperty({ description: 'Shipment public id (shp_…).' })
  id!: string;

  @ApiProperty()
  group_id!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ required: false })
  carrier?: string;

  @ApiProperty({ required: false })
  tracking_number?: string;

  @ApiProperty({ required: false })
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

  @ApiProperty({ type: [OrderShipmentItemResponseDto] })
  @Type(() => OrderShipmentItemResponseDto)
  items!: OrderShipmentItemResponseDto[];

  @ApiProperty({ type: [OrderShipmentUpdateResponseDto] })
  @Type(() => OrderShipmentUpdateResponseDto)
  updates!: OrderShipmentUpdateResponseDto[];
}

export class OrderFulfillmentGroupResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  method!: string;

  @ApiProperty()
  operator!: string;

  @ApiProperty()
  provenance!: string;

  @ApiProperty({ type: [OrderShipmentItemResponseDto] })
  @Type(() => OrderShipmentItemResponseDto)
  items!: OrderShipmentItemResponseDto[];

  @ApiProperty({ type: OrderFulfillmentProgressResponseDto })
  @Type(() => OrderFulfillmentProgressResponseDto)
  progress!: OrderFulfillmentProgressResponseDto;

  @ApiProperty({ type: [OrderShipmentResponseDto] })
  @Type(() => OrderShipmentResponseDto)
  shipments!: OrderShipmentResponseDto[];
}

export class OrderLegacyShippingResponseDto {
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

  @ApiProperty({ required: false })
  tracking_number?: string;

  @ApiProperty({ required: false })
  carrier?: string;

  @ApiProperty({ required: false })
  note?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  shipped_at?: Date;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  delivered_at?: Date;
}

export class OrderFulfillmentSummaryResponseDto {
  @ApiProperty()
  status!: string;

  @ApiProperty()
  requires_reconciliation!: boolean;

  @ApiProperty({ type: OrderFulfillmentProgressResponseDto })
  @Type(() => OrderFulfillmentProgressResponseDto)
  progress!: OrderFulfillmentProgressResponseDto;

  @ApiProperty({ type: [OrderFulfillmentGroupResponseDto] })
  @Type(() => OrderFulfillmentGroupResponseDto)
  groups!: OrderFulfillmentGroupResponseDto[];

  @ApiProperty({ type: OrderLegacyShippingResponseDto })
  @Type(() => OrderLegacyShippingResponseDto)
  legacy_shipping!: OrderLegacyShippingResponseDto;
}

export class OrderShippingQuoteChargeUnitResponseDto {
  @ApiProperty({ description: 'Product public id (prod_…).' })
  product_id!: string;

  @ApiProperty()
  inventory_id!: string;

  @ApiProperty()
  one_item_fee_minor!: number;
}

export class OrderShippingQuoteChargeComponentResponseDto {
  @ApiProperty({ description: 'Product public id (prod_…).' })
  product_id!: string;

  @ApiProperty()
  inventory_id!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  additional_item_fee_minor!: number;
}

export class OrderShippingQuoteChargeResponseDto {
  @ApiProperty()
  currency!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ type: OrderShippingQuoteChargeUnitResponseDto })
  @Type(() => OrderShippingQuoteChargeUnitResponseDto)
  base_unit!: OrderShippingQuoteChargeUnitResponseDto;

  @ApiProperty()
  base_item_fee_minor!: number;

  @ApiProperty()
  base_item_total_minor!: number;

  @ApiProperty()
  additional_items_quantity!: number;

  @ApiProperty({ type: [OrderShippingQuoteChargeComponentResponseDto] })
  @Type(() => OrderShippingQuoteChargeComponentResponseDto)
  additional_components!: OrderShippingQuoteChargeComponentResponseDto[];

  @ApiProperty()
  additional_item_fee_minor_total!: number;

  @ApiProperty()
  total_minor!: number;
}

export class OrderShippingQuoteEstimateResponseDto {
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

  @ApiProperty()
  anchor_at!: string;

  @ApiProperty()
  earliest_delivery_date!: string;

  @ApiProperty()
  latest_delivery_date!: string;
}

export class OrderShippingQuoteFxResponseDto {
  @ApiProperty()
  rate!: string;

  @ApiProperty()
  source!: string;

  @ApiProperty()
  effective_at!: string;

  @ApiProperty({ required: false })
  source_timestamp?: string;
}

export class OrderShippingQuoteUnitResponseDto {
  @ApiProperty({ description: 'Product public id (prod_…).' })
  product_id!: string;

  @ApiProperty()
  inventory_id!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  profile_id!: string;

  @ApiProperty()
  profile_version!: number;

  @ApiProperty({ description: 'Shop public id (shop_…).' })
  profile_shop_id!: string;

  @ApiProperty()
  rate_id!: string;

  @ApiProperty({ enum: ['country', 'everywhere_else'] })
  rate_destination_scope!: string;

  @ApiProperty({ required: false })
  rate_destination_country?: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  one_item_fee_minor!: number;

  @ApiProperty()
  additional_item_fee_minor!: number;

  @ApiProperty({ required: false })
  source_currency?: string;

  @ApiProperty({ required: false })
  source_one_item_fee_minor?: number;

  @ApiProperty({ required: false })
  source_additional_item_fee_minor?: number;

  @ApiProperty({ type: OrderShippingQuoteFxResponseDto, required: false })
  @Type(() => OrderShippingQuoteFxResponseDto)
  fx?: OrderShippingQuoteFxResponseDto;

  @ApiProperty()
  processing_time_min_days!: number;

  @ApiProperty()
  processing_time_max_days!: number;

  @ApiProperty()
  delivery_time_min_days!: number;

  @ApiProperty()
  delivery_time_max_days!: number;
}

export class OrderShippingQuoteResponseDto {
  @ApiProperty({ description: 'Shop public id (shop_…).' })
  shop_id!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ type: OrderShippingQuoteChargeResponseDto })
  @Type(() => OrderShippingQuoteChargeResponseDto)
  charge!: OrderShippingQuoteChargeResponseDto;

  @ApiProperty({ type: OrderShippingQuoteEstimateResponseDto })
  @Type(() => OrderShippingQuoteEstimateResponseDto)
  estimate!: OrderShippingQuoteEstimateResponseDto;

  @ApiProperty({ type: [OrderShippingQuoteUnitResponseDto] })
  @Type(() => OrderShippingQuoteUnitResponseDto)
  units!: OrderShippingQuoteUnitResponseDto[];
}

export class OrderShippingDiscountResponseDto {
  @ApiProperty({ description: 'Promotion public id (prm_…).' })
  promotion_id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: ['free_shipping'] })
  benefit_type!: string;

  @ApiProperty()
  product_scope!: string;

  @ApiProperty({ type: [String], description: 'Product public ids (prod_…).' })
  product_ids!: string[];

  @ApiProperty()
  min_order_type!: string;

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

export class OrderShippingAddressResponseDto {
  @ApiProperty()
  full_name!: string;

  @ApiProperty()
  address1!: string;

  @ApiProperty({ required: false })
  address2?: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  country!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty()
  zip!: string;

  @ApiProperty({ required: false })
  phone?: string;
}

export class OrderTimelineEventResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  occurred_at!: Date;

  @ApiProperty()
  actor_type!: string;

  @ApiProperty({ required: false })
  actor_id?: string;

  @ApiProperty({ required: false })
  source?: string;

  @ApiProperty({ type: Object, required: false })
  payload?: Record<string, unknown>;
}

export class OrderShopEntryResponseDto extends OrderAmountSummaryResponseDto {
  @ApiProperty({ description: 'Order public id (ord_…).' })
  id!: string;

  @ApiProperty()
  order_number!: string;

  @ApiProperty({ type: OrderShopRefResponseDto })
  @Type(() => OrderShopRefResponseDto)
  shop!: OrderShopRefResponseDto;

  @ApiProperty({ type: OrderPaymentResponseDto })
  @Type(() => OrderPaymentResponseDto)
  payment!: OrderPaymentResponseDto;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: [OrderProductLineResponseDto] })
  @Type(() => OrderProductLineResponseDto)
  products!: OrderProductLineResponseDto[];

  @ApiProperty({ type: [OrderPromoCodeResponseDto] })
  @Type(() => OrderPromoCodeResponseDto)
  promo_codes!: OrderPromoCodeResponseDto[];

  @ApiProperty({ type: OrderFulfillmentSummaryResponseDto })
  @Type(() => OrderFulfillmentSummaryResponseDto)
  fulfillment!: OrderFulfillmentSummaryResponseDto;

  @ApiProperty({ type: OrderShippingQuoteResponseDto, required: false })
  @Type(() => OrderShippingQuoteResponseDto)
  shipping?: OrderShippingQuoteResponseDto;

  @ApiProperty({ required: false })
  shipping_discount_minor?: number;

  @ApiProperty({ type: [OrderShippingDiscountResponseDto], required: false })
  @Type(() => OrderShippingDiscountResponseDto)
  shipping_discounts?: OrderShippingDiscountResponseDto[];

  @ApiProperty({ required: false })
  note?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  canceled_at?: Date;

  @ApiProperty({ required: false })
  cancel_reason?: string;

  @ApiProperty({ required: false })
  customer_support_note?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  cancel_requested_at?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;
}

export class OrderListResponseDto {
  @ApiProperty({ type: [OrderShopEntryResponseDto] })
  @Type(() => OrderShopEntryResponseDto)
  order_shops!: OrderShopEntryResponseDto[];
}

export class MyOrderCustomerResponseDto {
  @ApiProperty()
  email!: string;
}

export class MyOrderDetailOrderShopResponseDto extends OrderAmountSummaryResponseDto {
  @ApiProperty({ description: 'Order public id (ord_…).' })
  id!: string;

  @ApiProperty()
  order_number!: string;

  @ApiProperty({ type: OrderShopRefResponseDto })
  @Type(() => OrderShopRefResponseDto)
  shop!: OrderShopRefResponseDto;

  @ApiProperty({ type: MyOrderCustomerResponseDto })
  @Type(() => MyOrderCustomerResponseDto)
  customer!: MyOrderCustomerResponseDto;

  @ApiProperty({ type: OrderPaymentResponseDto })
  @Type(() => OrderPaymentResponseDto)
  payment!: OrderPaymentResponseDto;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: [OrderProductLineResponseDto] })
  @Type(() => OrderProductLineResponseDto)
  products!: OrderProductLineResponseDto[];

  @ApiProperty({ type: [OrderPromoCodeResponseDto] })
  @Type(() => OrderPromoCodeResponseDto)
  promo_codes!: OrderPromoCodeResponseDto[];

  @ApiProperty({ type: OrderFulfillmentSummaryResponseDto })
  @Type(() => OrderFulfillmentSummaryResponseDto)
  fulfillment!: OrderFulfillmentSummaryResponseDto;

  @ApiProperty({ type: OrderShippingAddressResponseDto })
  @Type(() => OrderShippingAddressResponseDto)
  shipping_address!: OrderShippingAddressResponseDto;

  @ApiProperty({ type: OrderShippingQuoteResponseDto, required: false })
  @Type(() => OrderShippingQuoteResponseDto)
  shipping?: OrderShippingQuoteResponseDto;

  @ApiProperty({ required: false })
  shipping_discount_minor?: number;

  @ApiProperty({ type: [OrderShippingDiscountResponseDto], required: false })
  @Type(() => OrderShippingDiscountResponseDto)
  shipping_discounts?: OrderShippingDiscountResponseDto[];

  @ApiProperty({ required: false })
  note?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  canceled_at?: Date;

  @ApiProperty({ required: false })
  cancel_reason?: string;

  @ApiProperty({ required: false })
  customer_support_note?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  cancel_requested_at?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;
}

export class MyOrderDetailResponseDto {
  @ApiProperty({ type: MyOrderDetailOrderShopResponseDto })
  @Type(() => MyOrderDetailOrderShopResponseDto)
  order_shop!: MyOrderDetailOrderShopResponseDto;
}

export class ShopOrderCustomerResponseDto {
  @ApiProperty()
  email!: string;

  @ApiProperty()
  full_name!: string;
}

export class ShopOrderSummaryResponseDto extends OrderAmountSummaryResponseDto {
  @ApiProperty({ description: 'Order public id (ord_…).' })
  id!: string;

  @ApiProperty()
  order_number!: string;

  @ApiProperty({ type: OrderShopRefResponseDto })
  @Type(() => OrderShopRefResponseDto)
  shop!: OrderShopRefResponseDto;

  @ApiProperty({ type: ShopOrderCustomerResponseDto })
  @Type(() => ShopOrderCustomerResponseDto)
  customer!: ShopOrderCustomerResponseDto;

  @ApiProperty({ type: OrderPaymentResponseDto })
  @Type(() => OrderPaymentResponseDto)
  payment!: OrderPaymentResponseDto;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: [OrderProductLineResponseDto] })
  @Type(() => OrderProductLineResponseDto)
  products!: OrderProductLineResponseDto[];

  @ApiProperty({ type: [OrderPromoCodeResponseDto] })
  @Type(() => OrderPromoCodeResponseDto)
  promo_codes!: OrderPromoCodeResponseDto[];

  @ApiProperty({ type: OrderFulfillmentSummaryResponseDto })
  @Type(() => OrderFulfillmentSummaryResponseDto)
  fulfillment!: OrderFulfillmentSummaryResponseDto;

  @ApiProperty({ type: OrderShippingQuoteResponseDto, required: false })
  @Type(() => OrderShippingQuoteResponseDto)
  shipping?: OrderShippingQuoteResponseDto;

  @ApiProperty({ required: false })
  shipping_discount_minor?: number;

  @ApiProperty({ type: [OrderShippingDiscountResponseDto], required: false })
  @Type(() => OrderShippingDiscountResponseDto)
  shipping_discounts?: OrderShippingDiscountResponseDto[];

  @ApiProperty({ required: false })
  note?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  canceled_at?: Date;

  @ApiProperty({ required: false })
  cancel_reason?: string;

  @ApiProperty({ required: false })
  customer_support_note?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  cancel_requested_at?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;
}

export class ShopOrderStatusCountsResponseDto {
  @ApiProperty()
  all!: number;

  @ApiProperty()
  awaiting_payment!: number;

  @ApiProperty()
  pending!: number;

  @ApiProperty()
  paid!: number;

  @ApiProperty()
  refunded!: number;

  @ApiProperty()
  completed!: number;

  @ApiProperty()
  canceled!: number;

  @ApiProperty()
  expired!: number;

  @ApiProperty()
  archived!: number;
}

export class ShopOrderListResponseDto {
  @ApiProperty({ type: [ShopOrderSummaryResponseDto] })
  @Type(() => ShopOrderSummaryResponseDto)
  results!: ShopOrderSummaryResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total_pages!: number;

  @ApiProperty()
  total_results!: number;

  @ApiProperty({ type: ShopOrderStatusCountsResponseDto })
  @Type(() => ShopOrderStatusCountsResponseDto)
  status_counts!: ShopOrderStatusCountsResponseDto;
}

export class ShopOrderDetailOrderResponseDto extends ShopOrderSummaryResponseDto {
  @ApiProperty({ type: OrderShippingAddressResponseDto })
  @Type(() => OrderShippingAddressResponseDto)
  shipping_address!: OrderShippingAddressResponseDto;
}

export class ShopOrderDetailResponseDto {
  @ApiProperty({ type: ShopOrderDetailOrderResponseDto })
  @Type(() => ShopOrderDetailOrderResponseDto)
  order!: ShopOrderDetailOrderResponseDto;

  @ApiProperty({ type: [OrderTimelineEventResponseDto] })
  @Type(() => OrderTimelineEventResponseDto)
  timeline!: OrderTimelineEventResponseDto[];
}

export class ShopDashboardPeriodResponseDto {
  @ApiProperty({ enum: ['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_month', 'last_month', 'all_time'] })
  range!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  from!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  to!: Date;
}

export class ShopDashboardSummaryResponseDto {
  @ApiProperty()
  revenue_minor!: number;

  @ApiProperty()
  order_count!: number;

  @ApiProperty()
  items_sold!: number;

  @ApiProperty()
  average_order_value_minor!: number;

  @ApiProperty()
  currency!: string;
}

export class ShopDashboardRevenuePointResponseDto {
  @ApiProperty()
  date!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  revenue_minor!: number;

  @ApiProperty()
  order_count!: number;
}

export class ShopDashboardTopProductResponseDto {
  @ApiProperty({ description: 'Product public id (prod_…).' })
  product_id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ required: false })
  image_url?: string;

  @ApiProperty()
  quantity_sold!: number;

  @ApiProperty()
  order_count!: number;

  @ApiProperty()
  revenue_minor!: number;

  @ApiProperty()
  currency!: string;
}

export class ShopDashboardResponseDto {
  @ApiProperty({ type: ShopDashboardPeriodResponseDto })
  @Type(() => ShopDashboardPeriodResponseDto)
  period!: ShopDashboardPeriodResponseDto;

  @ApiProperty({ type: ShopDashboardSummaryResponseDto })
  @Type(() => ShopDashboardSummaryResponseDto)
  summary!: ShopDashboardSummaryResponseDto;

  @ApiProperty({ type: [ShopDashboardRevenuePointResponseDto] })
  @Type(() => ShopDashboardRevenuePointResponseDto)
  revenue_series!: ShopDashboardRevenuePointResponseDto[];

  @ApiProperty({ type: [ShopOrderSummaryResponseDto] })
  @Type(() => ShopOrderSummaryResponseDto)
  recent_orders!: ShopOrderSummaryResponseDto[];

  @ApiProperty({ type: [ShopDashboardTopProductResponseDto] })
  @Type(() => ShopDashboardTopProductResponseDto)
  top_selling_products!: ShopDashboardTopProductResponseDto[];
}

export class AdminOrderProductLineResponseDto {
  @ApiProperty({ type: OrderProductRefResponseDto })
  @Type(() => OrderProductRefResponseDto)
  product!: OrderProductRefResponseDto;

  @ApiProperty({ type: OrderInventorySkuResponseDto })
  @Type(() => OrderInventorySkuResponseDto)
  inventory!: OrderInventorySkuResponseDto;

  @ApiProperty({ description: 'Order item internal id.' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ required: false })
  image_url?: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  amount_minor!: number;

  @ApiProperty()
  original_amount_minor!: number;

  @ApiProperty()
  promo_discount_minor!: number;

  @ApiProperty()
  currency!: string;
}

export class AdminOrderPaymentResponseDto {
  @ApiProperty()
  type!: string;

  @ApiProperty({ type: Object, nullable: true })
  details!: Record<string, unknown> | null;
}

export class AdminOrderPaymentTypeResponseDto {
  @ApiProperty()
  type!: string;
}

export class AdminOrderFulfillmentStatusResponseDto {
  @ApiProperty()
  status!: string;
}

export class AdminOrderListEntryResponseDto {
  @ApiProperty({ description: 'Order public id (ord_…).' })
  id!: string;

  @ApiProperty()
  order_number!: string;

  @ApiProperty({ type: OrderShopRefResponseDto })
  @Type(() => OrderShopRefResponseDto)
  shop!: OrderShopRefResponseDto;

  @ApiProperty({ type: MyOrderCustomerResponseDto })
  @Type(() => MyOrderCustomerResponseDto)
  customer!: MyOrderCustomerResponseDto;

  @ApiProperty({ type: AdminOrderPaymentTypeResponseDto })
  @Type(() => AdminOrderPaymentTypeResponseDto)
  payment!: AdminOrderPaymentTypeResponseDto;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: AdminOrderFulfillmentStatusResponseDto })
  @Type(() => AdminOrderFulfillmentStatusResponseDto)
  fulfillment!: AdminOrderFulfillmentStatusResponseDto;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  total_minor!: number;

  @ApiProperty({ required: false })
  support_note?: string;

  @ApiProperty({ required: false })
  cancel_reason?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  refunded_at?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;
}

export class AdminOrderListResponseDto {
  @ApiProperty({ type: [AdminOrderListEntryResponseDto] })
  @Type(() => AdminOrderListEntryResponseDto)
  results!: AdminOrderListEntryResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total_pages!: number;

  @ApiProperty()
  total_results!: number;
}

export class AdminOrderDetailOrderResponseDto extends OrderAmountSummaryResponseDto {
  @ApiProperty({ description: 'Order public id (ord_…).' })
  id!: string;

  @ApiProperty()
  order_number!: string;

  @ApiProperty({ type: OrderShopRefResponseDto })
  @Type(() => OrderShopRefResponseDto)
  shop!: OrderShopRefResponseDto;

  @ApiProperty({ type: MyOrderCustomerResponseDto })
  @Type(() => MyOrderCustomerResponseDto)
  customer!: MyOrderCustomerResponseDto;

  @ApiProperty({ type: AdminOrderPaymentResponseDto })
  @Type(() => AdminOrderPaymentResponseDto)
  payment!: AdminOrderPaymentResponseDto;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: [AdminOrderProductLineResponseDto] })
  @Type(() => AdminOrderProductLineResponseDto)
  products!: AdminOrderProductLineResponseDto[];

  @ApiProperty({ type: [OrderPromoCodeResponseDto] })
  @Type(() => OrderPromoCodeResponseDto)
  promo_codes!: OrderPromoCodeResponseDto[];

  @ApiProperty({ type: OrderFulfillmentSummaryResponseDto })
  @Type(() => OrderFulfillmentSummaryResponseDto)
  fulfillment!: OrderFulfillmentSummaryResponseDto;

  @ApiProperty({ type: OrderShippingAddressResponseDto })
  @Type(() => OrderShippingAddressResponseDto)
  shipping_address!: OrderShippingAddressResponseDto;

  @ApiProperty({ type: OrderShippingQuoteResponseDto, required: false })
  @Type(() => OrderShippingQuoteResponseDto)
  shipping?: OrderShippingQuoteResponseDto;

  @ApiProperty({ required: false })
  shipping_discount_minor?: number;

  @ApiProperty({ type: [OrderShippingDiscountResponseDto], required: false })
  @Type(() => OrderShippingDiscountResponseDto)
  shipping_discounts?: OrderShippingDiscountResponseDto[];

  @ApiProperty({ required: false })
  note?: string;

  @ApiProperty({ required: false })
  support_note?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  canceled_at?: Date;

  @ApiProperty({ required: false })
  cancel_reason?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  refunded_at?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;
}

export class AdminOrderDetailResponseDto {
  @ApiProperty({ type: AdminOrderDetailOrderResponseDto })
  @Type(() => AdminOrderDetailOrderResponseDto)
  order!: AdminOrderDetailOrderResponseDto;
}

/**
 * The webhook acknowledgement body is always an empty object; Stripe inspects
 * only the HTTP status, never response fields.
 */
export class StripeWebhookAckResponseDto {}

export function toMyReviewResponse(review?: {
  id: string;
  rating: number;
  title?: string;
  body?: string;
  status: 'published' | 'hidden';
  createdAt: Date;
  updatedAt: Date;
  images: Array<{
    id: string;
    url?: string;
    sizeBytes?: number;
    rank: number;
    variantStatus?: string;
    variantError?: string;
    variantsGeneratedAt?: Date;
    variants?: Array<{
      variant: string;
      url?: string;
      width?: number;
      height?: number;
      format?: string;
    }>;
  }>;
}) {
  if (!review) {
    return undefined;
  }

  return {
    id: review.id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    status: review.status,
    created_at: review.createdAt,
    updated_at: review.updatedAt,
    images: review.images.map((image) => ({
      id: image.id,
      url: image.url ?? '',
      size_bytes: image.sizeBytes,
      rank: image.rank,
      ...(image.variantStatus ? { variant_status: image.variantStatus } : {}),
      ...(image.variantError ? { variant_error: image.variantError } : {}),
      ...(image.variantsGeneratedAt ? { variants_generated_at: image.variantsGeneratedAt } : {}),
      ...(toVariantRecord(image.variants) ? { variants: toVariantRecord(image.variants) } : {}),
    })),
  };
}

function toVariantRecord(variants?: Array<{
  variant: string;
  url?: string;
  width?: number;
  height?: number;
  format?: string;
}>) {
  if (!variants || variants.length === 0) {
    return undefined;
  }

  return variants.reduce<Record<string, {
    url: string;
    width?: number;
    height?: number;
    format?: string;
  }>>((accumulator, variant) => {
    accumulator[variant.variant] = {
      url: variant.url ?? '',
      width: variant.width,
      height: variant.height,
      format: variant.format,
    };
    return accumulator;
  }, {});
}

function toPaymentResponse(order: {
  paymentType: string;
  refundedAt?: Date;
  paymentDetails?: Record<string, unknown>;
}) {
  const refundStatus = typeof order.paymentDetails?.['refund_status'] === 'string'
    ? order.paymentDetails['refund_status']
    : undefined;
  const refundFailedReason = typeof order.paymentDetails?.['refund_failed_reason'] === 'string'
    ? order.paymentDetails['refund_failed_reason']
    : undefined;

  return {
    type: order.paymentType,
    ...(refundStatus ? { refund_status: refundStatus } : {}),
    ...(order.refundedAt ? { refunded_at: order.refundedAt } : {}),
    ...(refundFailedReason ? { refund_failed_reason: refundFailedReason } : {}),
  };
}

function toMinorTotals(input: {
  currency: string;
  subtotal: number;
  subtotalMinor?: number;
  totalShippingFee: number;
  shippingMinor?: number;
  totalDiscount: number;
  discountMinor?: number;
  saleDiscountMinor?: number;
  total: number;
  totalMinor?: number;
}) {
  return {
    currency: input.currency,
    subtotal_minor: input.subtotalMinor ?? toMinorUnits(input.subtotal, input.currency),
    shipping_minor: input.shippingMinor ?? toMinorUnits(input.totalShippingFee, input.currency),
    discount_minor: input.discountMinor ?? toMinorUnits(input.totalDiscount, input.currency),
    sale_discount_minor: input.saleDiscountMinor ?? 0,
    total_minor: input.totalMinor ?? toMinorUnits(input.total, input.currency),
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
    total_minor: result.totalMinor,
    expires_at: result.expiresAt,
    items: result.items.map((item) => ({
      inventory_id: item.inventoryId,
      title: item.title,
      image_url: item.imageUrl,
      quantity: item.quantity,
      source_currency: item.sourceCurrency,
      unit_price_source_minor: item.unitPriceSourceMinor,
      line_total_source_minor: item.lineTotalSourceMinor,
      checkout_currency: item.checkoutCurrency,
      unit_price_checkout_minor: item.unitPriceCheckoutMinor,
      line_total_checkout_minor: item.lineTotalCheckoutMinor,
      original_amount_minor: item.originalAmountMinor,
      currency: item.checkoutCurrency,
      source_type: item.sourceType,
      fx_rate: item.fxRate,
      fx_source: item.fxSource,
      fx_effective_at: item.fxEffectiveAt,
      selected_options: (item.selectedOptions ?? []).map((selection) => ({
        option_id: selection.optionId,
        option_name: selection.optionName,
        value_id: selection.valueId,
        value: selection.value,
      })),
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

export function toOrderListResponse(result: OrderListResult) {
  return {
    order_shops: result.orderShops.map((orderShop) => ({
      id: orderShop.publicId,
      order_number: orderShop.orderNumber,
      shop: {
        id: orderShop.shopPublicId,
        shop_name: orderShop.shopName,
        slug: orderShop.shopSlug,
      },
      payment: toPaymentResponse(orderShop),
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
        image_reference: product.imageReference,
        quantity: product.quantity,
        amount_minor: product.amountMinor,
        original_amount_minor: product.originalAmountMinor,
        promo_discount_minor: product.promoDiscountMinor,
        currency: product.currency,
        ...(product.myReview ? { my_review: toMyReviewResponse(product.myReview) } : {}),
      })),
      promo_codes: orderShop.promoCodes.map((code) => ({
        id: code,
        code,
      })),
      fulfillment: toFulfillmentSummaryResponse(orderShop.fulfillment),
      ...toMinorTotals(orderShop),
      ...toOrderShippingResponse(orderShop.shippingQuote, orderShop.shopPublicId, orderShop.products),
      note: orderShop.note,
      canceled_at: orderShop.canceledAt,
      cancel_reason: orderShop.cancelReason,
      customer_support_note: orderShop.customerSupportNote,
      cancel_requested_at: orderShop.cancelRequestedAt,
      created_at: orderShop.createdAt,
    })),
  };
}

function toShopOrderProductResponse(orderShop: ShopOrderSummary) {
  return orderShop.products.map((product) => ({
    id: product.id,
    title: product.title,
    image_url: product.imageUrl,
    image_reference: product.imageReference,
    quantity: product.quantity,
    amount_minor: product.amountMinor,
    original_amount_minor: product.originalAmountMinor,
    promo_discount_minor: product.promoDiscountMinor,
    currency: product.currency,
    inventory: {
      sku: product.sku,
    },
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
    },
    ...(product.myReview ? { my_review: toMyReviewResponse(product.myReview) } : {}),
  }));
}


export function toFulfillmentSummaryResponse(
  fulfillment: OrderFulfillmentSummary,
) {
  return {
    status: fulfillment.status,
    requires_reconciliation: fulfillment.requiresReconciliation,
    progress: toFulfillmentProgressResponse(fulfillment.progress),
    groups: fulfillment.groups.map((group) => ({
      id: group.id,
      method: group.method,
      operator: group.operator,
      provenance: group.provenance,
      items: group.items.map((item) => ({
        order_item_id: item.orderItemId,
        quantity: item.quantity,
      })),
      progress: toFulfillmentProgressResponse(group.progress),
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

export function toFulfillmentProgressResponse(progress: OrderFulfillmentSummary['progress']) {
  return {
    ordered: progress.ordered,
    prepared: progress.prepared,
    dispatched: progress.dispatched,
    delivered: progress.delivered,
    canceled: progress.canceled,
    outstanding: progress.outstanding,
  };
}

/**
 * The accepted shipping facts of a confirmed Order, in transport shape, beside
 * `shipping_minor`. It is the purchase-time snapshot in the same snake_case
 * shape a checkout quote shop returns, so a buyer, guest, seller, or admin view
 * never re-derives shipping from current configuration.
 */
export function toOrderShippingResponse(
  shippingQuote: OrderShippingQuote | undefined,
  shopPublicId: string,
  products: Array<{ productId: string; productPublicId: string }>,
) {
  if (!shippingQuote) {
    return {};
  }

  return {
    shipping: toPublicShippingQuote(shippingQuote.shipping, shopPublicId, products),
    shipping_discount_minor: shippingQuote.shippingDiscountMinor,
    shipping_discounts: shippingQuote.shippingDiscounts.map(toPublicShippingDiscount),
  };
}

export function toShopOrderSummaryResponse(orderShop: ShopOrderSummary) {
  return {
    id: orderShop.publicId,
    order_number: orderShop.orderNumber,
    shop: {
      id: orderShop.shopPublicId,
      shop_name: orderShop.shopName,
      slug: orderShop.shopSlug,
    },
    customer: {
      email: orderShop.customerEmail,
      full_name: orderShop.customerFullName,
    },
    payment: toPaymentResponse(orderShop),
    status: orderShop.status,
    products: toShopOrderProductResponse(orderShop),
    promo_codes: orderShop.promoCodes.map((code) => ({
      id: code,
      code,
    })),
    fulfillment: toFulfillmentSummaryResponse(orderShop.fulfillment),
    ...toMinorTotals(orderShop),
    ...toOrderShippingResponse(orderShop.shippingQuote, orderShop.shopPublicId, orderShop.products),
    note: orderShop.note,
    canceled_at: orderShop.canceledAt,
    cancel_reason: orderShop.cancelReason,
    customer_support_note: orderShop.customerSupportNote,
    cancel_requested_at: orderShop.cancelRequestedAt,
    created_at: orderShop.createdAt,
  };
}

export function toShopOrderListResponse(result: ShopOrderListResult) {
  return {
    results: result.results.map(toShopOrderSummaryResponse),
    page: result.page,
    limit: result.limit,
    total_pages: result.totalPages,
    total_results: result.totalResults,
    status_counts: result.statusCounts,
  };
}

export function toShopDashboardResponse(result: ShopDashboardResult) {
  return {
    period: {
      range: result.period.range,
      from: result.period.from,
      to: result.period.to,
    },
    summary: {
      revenue_minor: result.summary.revenueMinor,
      order_count: result.summary.orderCount,
      items_sold: result.summary.itemsSold,
      average_order_value_minor: result.summary.averageOrderValueMinor,
      currency: result.summary.currency,
    },
    revenue_series: result.revenueSeries.map((point) => ({
      date: point.date,
      label: point.label,
      revenue_minor: point.revenueMinor,
      order_count: point.orderCount,
    })),
    recent_orders: result.recentOrders.map(toShopOrderSummaryResponse),
    top_selling_products: result.topSellingProducts.map((product) => ({
      product_id: product.productPublicId,
      title: product.title,
      slug: product.slug,
      image_url: product.imageUrl,
      quantity_sold: product.quantitySold,
      order_count: product.orderCount,
      revenue_minor: product.revenueMinor,
      currency: product.currency,
    })),
  };
}

export function toShopOrderDetailResponse(order: ShopOrderDetail) {
  return {
    order: {
      ...toShopOrderSummaryResponse(order),
      products: order.products.map((product) => ({
        id: product.id,
        title: product.title,
        image_url: product.imageUrl,
        image_reference: product.imageReference,
        quantity: product.quantity,
        amount_minor: product.amountMinor,
        original_amount_minor: product.originalAmountMinor,
        promo_discount_minor: product.promoDiscountMinor,
        currency: product.currency,
        inventory: {
          sku: product.sku,
        },
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
        },
      })),
      shipping_address: {
        full_name: order.shippingAddress.fullName,
        address1: order.shippingAddress.address1,
        address2: order.shippingAddress.address2,
        city: order.shippingAddress.city,
        country: order.shippingAddress.country,
        state: order.shippingAddress.state,
        zip: order.shippingAddress.zip,
        phone: order.shippingAddress.phone,
      },
    },
    timeline: order.timeline.map((event) => ({
      id: event.id,
      type: event.type,
      occurred_at: event.occurredAt,
      actor_type: event.actorType,
      actor_id: event.actorId,
      source: event.source,
      payload: event.payload,
    })),
  };
}

export function toMyOrderDetailResponse(order: MyOrderDetail) {
  return {
    order_shop: {
      id: order.publicId,
      order_number: order.orderNumber,
      shop: {
        id: order.shopPublicId,
        shop_name: order.shopName,
        slug: order.shopSlug,
      },
      customer: {
        email: order.customerEmail,
      },
      payment: toPaymentResponse(order),
      status: order.status,
      products: order.products.map((product) => ({
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
        image_reference: product.imageReference,
        quantity: product.quantity,
        amount_minor: product.amountMinor,
        original_amount_minor: product.originalAmountMinor,
        promo_discount_minor: product.promoDiscountMinor,
        currency: product.currency,
        ...(product.myReview ? { my_review: toMyReviewResponse(product.myReview) } : {}),
      })),
      promo_codes: order.promoCodes.map((code) => ({
        id: code,
        code,
      })),
      fulfillment: toFulfillmentSummaryResponse(order.fulfillment),
      shipping_address: {
        full_name: order.shippingAddress.fullName,
        address1: order.shippingAddress.address1,
        address2: order.shippingAddress.address2,
        city: order.shippingAddress.city,
        country: order.shippingAddress.country,
        state: order.shippingAddress.state,
        zip: order.shippingAddress.zip,
        phone: order.shippingAddress.phone,
      },
      ...toMinorTotals(order),
      ...toOrderShippingResponse(order.shippingQuote, order.shopPublicId, order.products),
      note: order.note,
      canceled_at: order.canceledAt,
      cancel_reason: order.cancelReason,
      customer_support_note: order.customerSupportNote,
      cancel_requested_at: order.cancelRequestedAt,
      created_at: order.createdAt,
    },
  };
}

export function toAdminOrderDetailResponse(order: AdminOrderDetail) {
  return {
    order: {
      id: order.publicId,
      order_number: order.orderNumber,
      shop: {
        id: order.shopPublicId,
        shop_name: order.shopName,
        slug: order.shopSlug,
      },
      customer: {
        email: order.customerEmail,
      },
      payment: {
        type: order.paymentType,
        details: order.paymentDetails ?? null,
      },
      status: order.status,
      products: order.products.map((product) => ({
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
        promo_discount_minor: product.promoDiscountMinor,
        currency: product.currency,
      })),
      promo_codes: order.promoCodes.map((code) => ({
        id: code,
        code,
      })),
      fulfillment: toFulfillmentSummaryResponse(order.fulfillment),
      shipping_address: {
        full_name: order.shippingAddress.fullName,
        address1: order.shippingAddress.address1,
        address2: order.shippingAddress.address2,
        city: order.shippingAddress.city,
        country: order.shippingAddress.country,
        state: order.shippingAddress.state,
        zip: order.shippingAddress.zip,
        phone: order.shippingAddress.phone,
      },
      ...toMinorTotals(order),
      ...toOrderShippingResponse(order.shippingQuote, order.shopPublicId, order.products),
      note: order.note,
      support_note: order.supportNote,
      canceled_at: order.canceledAt,
      cancel_reason: order.cancelReason,
      refunded_at: order.refundedAt,
      created_at: order.createdAt,
    },
  };
}

export function toAdminOrderListResponse(result: AdminOrderListResult) {
  return {
    results: result.results.map((order) => ({
      id: order.publicId,
      order_number: order.orderNumber,
      shop: {
        id: order.shopPublicId,
        shop_name: order.shopName,
        slug: order.shopSlug,
      },
      customer: {
        email: order.customerEmail,
      },
      payment: {
        type: order.paymentType,
      },
      status: order.status,
      fulfillment: {
        status: order.fulfillmentStatus,
      },
      currency: order.currency,
      total_minor: order.totalMinor ?? toMinorUnits(order.total, order.currency),
      support_note: order.supportNote,
      cancel_reason: order.cancelReason,
      refunded_at: order.refundedAt,
      created_at: order.createdAt,
    })),
    page: result.page,
    limit: result.limit,
    total_pages: result.totalPages,
    total_results: result.totalResults,
  };
}
