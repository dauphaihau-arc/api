import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { CheckoutQuoteEntity } from './checkout-quote.entity';

export enum CheckoutStockReservationStatus {
  ACTIVE = 'active',
  CONSUMED = 'consumed',
  RELEASED = 'released',
  EXPIRED = 'expired',
}

@Entity({ tableName: 'checkout_stock_reservations' })
@Index({ properties: ['inventory', 'status', 'expiresAt'] })
@Index({ properties: ['quote'] })
@Index({ properties: ['cartId'] })
@Unique({ properties: ['quote', 'inventory'] })
export class CheckoutStockReservationEntity extends AbstractBaseEntity {
  @ManyToOne(() => CheckoutQuoteEntity, {
    fieldName: 'quote_id',
    deleteRule: 'cascade',
  })
  quote!: CheckoutQuoteEntity;

  @ManyToOne(() => ProductInventoryEntity, {
    fieldName: 'inventory_id',
    deleteRule: 'cascade',
  })
  inventory!: ProductInventoryEntity;

  @ManyToOne(() => UserEntity, {
    fieldName: 'user_id',
    nullable: true,
    deleteRule: 'cascade',
  })
  user?: UserEntity;

  @Property({ fieldName: 'guest_session_id', length: 255, nullable: true })
  guestSessionId?: string;

  @Property({ fieldName: 'cart_id' })
  cartId!: string;

  @Property()
  quantity!: number;

  @Enum({ items: () => CheckoutStockReservationStatus })
  status = CheckoutStockReservationStatus.ACTIVE;

  @Property({ fieldName: 'expires_at' })
  expiresAt!: Date;

  @Property({ fieldName: 'consumed_at', nullable: true })
  consumedAt?: Date;

  @Property({ fieldName: 'released_at', nullable: true })
  releasedAt?: Date;
}
