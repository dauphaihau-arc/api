import {
  BeforeCreate,
  Collection,
  Entity,
  Enum,
  Index,
  ManyToOne,
  OneToMany,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ProductEntity } from './product.entity';
import { ProductInventoryReservationEntity } from './product-inventory-reservation.entity';
import { ProductStockPoolEntity } from './product-stock-pool.entity';
import { ProductVariantEntity } from './product-variant.entity';
import { VariantPriceEntity } from './variant-price.entity';


export enum ProductInventoryLifecycleState {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  REMOVED = 'removed',
}

@Entity({ tableName: 'product_inventory' })
@Index({ properties: ['product'] })
@Index({ properties: ['productVariant'] })
@Index({ properties: ['shop', 'sku', 'lifecycleState'] })
export class ProductInventoryEntity extends AbstractBaseEntity {
  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    deleteRule: 'cascade',
  })
  product!: ProductEntity;

  @ManyToOne(() => ProductVariantEntity, {
    fieldName: 'product_variant_id',
    deleteRule: 'cascade',
  })
  productVariant!: ProductVariantEntity;

  @Property({ fieldName: 'sku', length: 255, nullable: true })
  sku?: string;

  /**
   * Derived aggregate of this Inventory Item's Stock Pools. The database
   * maintains these four columns from `product_stock_pool`; they are read for
   * catalog, cart, and storefront availability, and no application code writes
   * a balance through them.
   */
  @Property({ fieldName: 'stock' })
  stock!: number;

  @Property({ fieldName: 'on_hand_quantity' })
  onHandQuantity!: number;

  @Property({ fieldName: 'reserved_quantity' })
  reservedQuantity = 0;

  @Property({ fieldName: 'on_hand_version' })
  onHandVersion = 1;

  @Enum({ items: () => ProductInventoryLifecycleState, fieldName: 'lifecycle_state' })
  lifecycleState = ProductInventoryLifecycleState.ACTIVE;

  @Property({ fieldName: 'removed_at', nullable: true })
  removedAt?: Date;

  @OneToMany(
    () => ProductInventoryReservationEntity,
    (reservation) => reservation.productInventory,
  )
  reservations = new Collection<ProductInventoryReservationEntity>(this);

  @OneToMany(() => ProductStockPoolEntity, (stockPool) => stockPool.inventory)
  stockPools = new Collection<ProductStockPoolEntity>(this);

  @OneToMany(() => VariantPriceEntity, (price) => price.productInventory)
  prices = new Collection<VariantPriceEntity>(this);

  @BeforeCreate()
  ensureOnHandQuantityForLegacyStockCreates(): void {
    if (this.onHandQuantity === undefined) {
      this.onHandQuantity = this.stock;
    }
  }

  get availableQuantity(): number {
    return Math.max(0, this.onHandQuantity - this.reservedQuantity);
  }

  get shortage(): number {
    return Math.max(0, this.reservedQuantity - this.onHandQuantity);
  }
}
