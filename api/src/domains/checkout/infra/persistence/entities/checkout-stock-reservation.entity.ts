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

export enum CheckoutStockReservationStatus {
  ACTIVE = 'active',
  CONSUMED = 'consumed',
  RELEASED = 'released',
  EXPIRED = 'expired',
}

/**
 * A Checkout Stock Reservation is owned by the Order that holds the stock: one
 * row per Inventory Item, identified by `(order_id, inventory_id)`.
 */
@Entity({ tableName: 'checkout_stock_reservations' })
@Index({ properties: ['inventory', 'status', 'expiresAt'] })
@Index({ properties: ['orderId'] })
@Index({ properties: ['cartId'] })
@Unique({ properties: ['orderId', 'inventory'] })
export class CheckoutStockReservationEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'order_id', columnType: 'uuid' })
  orderId!: string;

  @ManyToOne(() => ProductInventoryEntity, {
    fieldName: 'inventory_id',
    deleteRule: 'cascade',
  })
  inventory!: ProductInventoryEntity;

  @Property({ fieldName: 'stock_pool_id', columnType: 'uuid' })
  stockPoolId!: string;

  @ManyToOne(() => UserEntity, {
    fieldName: 'user_id',
    nullable: true,
    deleteRule: 'cascade',
  })
  user?: UserEntity;

  @Property({ fieldName: 'guest_session_id', length: 255, nullable: true })
  guestSessionId?: string;

  @Property({ fieldName: 'cart_id', columnType: 'uuid' })
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
