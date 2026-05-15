import {
  ArrayType, Entity, Enum, Index, ManyToOne, Property 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { ShopEntity } from '~/modules/domains/shop/infra/persistence/entities/shop.entity';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { PaymentType } from '../../../domain/enums/payment-type.enum';

@Entity({ tableName: 'orders' })
@Index({ properties: ['user'] })
@Index({ properties: ['shop'] })
export class OrderEntity extends AbstractBaseEntity {
  @ManyToOne(() => CurrentUserEntity, {
    fieldName: 'user_id',
    deleteRule: 'cascade',
  })
  user!: CurrentUserEntity;

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

  @Property({ type: 'numeric', precision: 12, scale: 2 })
  subtotal!: number;

  @Property({
    fieldName: 'total_shipping_fee', type: 'numeric', precision: 12, scale: 2, default: 0, 
  })
  totalShippingFee = 0;

  @Property({
    fieldName: 'total_discount', type: 'numeric', precision: 12, scale: 2, default: 0, 
  })
  totalDiscount = 0;

  @Property({ type: 'numeric', precision: 12, scale: 2 })
  total!: number;

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

  @Property({ fieldName: 'payment_details', type: 'json', nullable: true })
  paymentDetails?: Record<string, unknown>;
}
