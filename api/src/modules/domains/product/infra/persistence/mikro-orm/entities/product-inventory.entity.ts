import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { ShopEntity } from '~/modules/domains/shop/infra/persistence/entities/shop.entity';
import { ProductEntity } from './product.entity';
import { ProductInventoryReservationEntity } from './product-inventory-reservation.entity';
import { ProductVariantEntity } from './product-variant.entity';
import { VariantPriceEntity } from './variant-price.entity';

@Entity({ tableName: 'product_inventory' })
@Index({ properties: ['product'] })
@Index({ properties: ['productVariant'] })
@Unique({ properties: ['shop', 'sku'] })
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
    nullable: true,
    deleteRule: 'cascade',
  })
  productVariant?: ProductVariantEntity;

  @Property({ fieldName: 'sku', length: 255, nullable: true })
  sku?: string;

  @Property({ fieldName: 'stock' })
  stock!: number;

  @OneToMany(
    () => ProductInventoryReservationEntity,
    (reservation) => reservation.productInventory,
  )
  reservations = new Collection<ProductInventoryReservationEntity>(this);

  @OneToMany(() => VariantPriceEntity, (price) => price.productInventory)
  prices = new Collection<VariantPriceEntity>(this);
}
