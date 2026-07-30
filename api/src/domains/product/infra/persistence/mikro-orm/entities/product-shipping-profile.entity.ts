import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ProductEntity } from './product.entity';
import { ProductShippingDestinationEntity } from './product-shipping-destination.entity';

@Entity({ tableName: 'product_shipping_profiles' })
@Index({ properties: ['shop'] })
@Unique({ properties: ['product'] })
export class ProductShippingProfileEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    deleteRule: 'cascade',
  })
  product!: ProductEntity;

  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @Property({ fieldName: 'origin_country', length: 2 })
  originCountry!: string;

  @Property({ fieldName: 'origin_zip', length: 50 })
  originZip!: string;

  @Property({ fieldName: 'process_time_label', length: 100 })
  processTimeLabel!: string;

  @OneToMany(
    () => ProductShippingDestinationEntity,
    (destination) => destination.shippingProfile,
  )
  destinations = new Collection<ProductShippingDestinationEntity>(this);
}
