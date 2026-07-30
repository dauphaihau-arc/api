import {
  ArrayType, Entity, Enum, Index, ManyToOne, Opt, Property, Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { CurrentUserEntity } from '~/domains/auth/infra/persistence/entities/current-user.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { PaymentType } from '../../../domain/enums/payment-type.enum';

@Entity({ tableName: 'orders' })
@Index({ properties: ['user'] })
@Index({ properties: ['shop'] })
export class OrderEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'order_number', length: 25, nullable: true })
  @Unique()
  orderNumber?: Opt<string>;

  @ManyToOne(() => CurrentUserEntity, {
    fieldName: 'user_id',
    nullable: true,
    deleteRule: 'cascade',
  })
  user?: CurrentUserEntity;

  @Property({ fieldName: 'customer_email', length: 320 })
  customerEmail!: string;

  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @Enum({ items: () => PaymentType, fieldName: 'payment_type' })
  paymentType!: PaymentType;

  @Enum({ items: () => OrderStatus })
  status!: OrderStatus;

  @Enum({ items: () => OrderShippingStatus, fieldName: 'shipping_status' })
  shippingStatus = OrderShippingStatus.PRE_TRANSIT;

  @Property({ length: 3 })
  currency!: string;

  @Property({ fieldName: 'market_code', length: 20, nullable: true })
  marketCode?: string;

  @Property({ type: 'numeric', precision: 12, scale: 2 })
  subtotal!: number;

  @Property({ fieldName: 'subtotal_minor', nullable: true })
  subtotalMinor?: number;

  @Property({
    fieldName: 'total_shipping_fee', type: 'numeric', precision: 12, scale: 2, default: 0, 
  })
  totalShippingFee = 0;

  @Property({ fieldName: 'shipping_minor', nullable: true })
  shippingMinor?: number;

  @Property({
    fieldName: 'total_discount', type: 'numeric', precision: 12, scale: 2, default: 0, 
  })
  totalDiscount = 0;

  @Property({ fieldName: 'discount_minor', nullable: true })
  discountMinor?: number;

  @Property({ type: 'numeric', precision: 12, scale: 2 })
  total!: number;

  @Property({ fieldName: 'total_minor', nullable: true })
  totalMinor?: number;

  @Property({ nullable: true, type: 'text' })
  note?: string;

  @Property({ fieldName: 'promo_codes', type: ArrayType, defaultRaw: '\'{}\'' })
  promoCodes: string[] = [];

  @Property({ fieldName: 'shipping_address', type: 'json' })
  shippingAddress!: Record<string, unknown>;

  @Property({ fieldName: 'shipping_origin_countries', type: ArrayType, defaultRaw: '\'{}\'' })
  shippingOriginCountries: string[] = [];

  @Property({ fieldName: 'shipping_to_country', length: 255 })
  shippingToCountry!: string;

  @Property({ fieldName: 'shipping_estimated_delivery' })
  shippingEstimatedDelivery!: Date;

  @Property({ fieldName: 'tracking_number', length: 255, nullable: true })
  trackingNumber?: string;

  @Property({ fieldName: 'shipping_carrier', length: 255, nullable: true })
  shippingCarrier?: string;

  @Property({ fieldName: 'shipment_note', type: 'text', nullable: true })
  shipmentNote?: string;

  @Property({ fieldName: 'shipped_at', nullable: true })
  shippedAt?: Date;

  @Property({ fieldName: 'delivered_at', nullable: true })
  deliveredAt?: Date;

  @Property({ fieldName: 'canceled_at', nullable: true })
  canceledAt?: Date;

  @Property({ fieldName: 'cancel_reason', type: 'text', nullable: true })
  cancelReason?: string;

  @Property({ fieldName: 'refunded_at', nullable: true })
  refundedAt?: Date;

  @Property({ fieldName: 'support_note', type: 'text', nullable: true })
  supportNote?: string;

  @Property({ fieldName: 'customer_support_note', type: 'text', nullable: true })
  customerSupportNote?: string;

  @Property({ fieldName: 'cancel_requested_at', nullable: true })
  cancelRequestedAt?: Date;

  @Property({ fieldName: 'payment_details', type: 'json', nullable: true })
  paymentDetails?: Record<string, unknown>;
}
