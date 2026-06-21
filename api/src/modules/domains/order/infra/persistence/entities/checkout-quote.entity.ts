import {
  Entity, Enum, Index, ManyToOne, Property, 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';

export enum CheckoutQuoteActorType {
  USER = 'user',
  GUEST = 'guest',
}

@Entity({ tableName: 'checkout_quotes' })
@Index({ properties: ['user'] })
@Index({ properties: ['cartId'] })
export class CheckoutQuoteEntity extends AbstractBaseEntity {
  @Enum({ items: () => CheckoutQuoteActorType, fieldName: 'actor_type' })
  actorType!: CheckoutQuoteActorType;

  @ManyToOne(() => CurrentUserEntity, {
    fieldName: 'user_id',
    nullable: true,
    deleteRule: 'cascade',
  })
  user?: CurrentUserEntity;

  @Property({ fieldName: 'guest_session_id', length: 255, nullable: true })
  guestSessionId?: string;

  @Property({ fieldName: 'cart_id' })
  cartId!: string;

  @Property({ fieldName: 'presentment_currency', length: 3, nullable: true })
  presentmentCurrency?: string;

  @Property({ fieldName: 'market_code', length: 20, nullable: true })
  marketCode?: string;

  @Property({ fieldName: 'checkout_currency', length: 3 })
  checkoutCurrency!: string;

  @Property({ fieldName: 'subtotal_minor' })
  subtotalMinor!: number;

  @Property({ fieldName: 'shipping_minor', default: 0 })
  shippingMinor = 0;

  @Property({ fieldName: 'discount_minor', default: 0 })
  discountMinor = 0;

  @Property({ fieldName: 'total_minor' })
  totalMinor!: number;

  @Property({ fieldName: 'shipping_address', type: 'json' })
  shippingAddress!: Record<string, unknown>;

  @Property({ fieldName: 'shop_adjustments', type: 'json', nullable: true })
  shopAdjustments?: Record<string, unknown>[];

  @Property({ fieldName: 'priced_shops', type: 'json' })
  pricedShops!: Record<string, unknown>[];

  @Property({ fieldName: 'expires_at' })
  expiresAt!: Date;
}
