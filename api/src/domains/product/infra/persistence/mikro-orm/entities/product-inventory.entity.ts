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
import { ProductVariantEntity } from './product-variant.entity';
import { VariantPriceEntity } from './variant-price.entity';


export enum ProductInventoryLifecycleState {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  REMOVED = 'removed',
}

export class ProductInventoryOnHandVersionConflictError extends Error {
  constructor(
    public readonly currentOnHandQuantity: number,
    public readonly currentReservedQuantity: number,
    public readonly currentOnHandVersion: number,
  ) {
    super('On-hand Version conflict');
  }
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

  applyOnHandCount(input: {
    onHandQuantity: number;
    expectedOnHandVersion: number;
  }): void {
    if (input.expectedOnHandVersion !== this.onHandVersion) {
      throw new ProductInventoryOnHandVersionConflictError(
        this.onHandQuantity,
        this.reservedQuantity,
        this.onHandVersion,
      );
    }

    this.onHandQuantity = input.onHandQuantity;
    this.onHandVersion += 1;
    this.stock = this.availableQuantity;
  }

  reserve(quantity: number): void {
    this.reservedQuantity += quantity;
    this.stock = this.availableQuantity;
  }

  release(quantity: number): void {
    this.reservedQuantity = Math.max(0, this.reservedQuantity - quantity);
    this.stock = this.availableQuantity;
  }

  consumeReserved(quantity: number): void {
    if (this.onHandQuantity < quantity || this.reservedQuantity < quantity) {
      throw new Error('Inventory reservation cannot be consumed');
    }

    this.onHandQuantity -= quantity;
    this.reservedQuantity -= quantity;
    this.stock = this.availableQuantity;
  }
}
