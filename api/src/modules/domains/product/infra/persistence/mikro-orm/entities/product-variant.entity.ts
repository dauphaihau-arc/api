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
import { ProductEntity } from './product.entity';
import { ProductInventoryEntity } from './product-inventory.entity';

@Entity({ tableName: 'product_variants' })
@Index({ properties: ['product'] })
@Unique({ properties: ['product', 'name'] })
export class ProductVariantEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    deleteRule: 'cascade',
  })
  product!: ProductEntity;

  @Property({ fieldName: 'name', length: 255 })
  name!: string;

  @Property({ fieldName: 'option_value_1', length: 255, nullable: true })
  optionValue1?: string;

  @Property({ fieldName: 'option_value_2', length: 255, nullable: true })
  optionValue2?: string;

  @Property({ fieldName: 'image_storage_key', length: 500, nullable: true })
  imageStorageKey?: string;

  @Property({ fieldName: 'rank' })
  rank = 1;

  @OneToMany(() => ProductInventoryEntity, (inventory) => inventory.productVariant)
  inventoryRecords = new Collection<ProductInventoryEntity>(this);
}
