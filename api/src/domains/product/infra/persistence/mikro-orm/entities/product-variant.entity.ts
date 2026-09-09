import {
  Collection,
  Enum,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ProductVariantLifecycleState } from '~/domains/product/domain/enums/product-variant-lifecycle-state.enum';
import { ProductEntity } from './product.entity';
import { ProductInventoryEntity } from './product-inventory.entity';
import { ProductVariantOptionValueEntity } from './product-variant-option-value.entity';

@Entity({ tableName: 'product_variants' })
@Index({ properties: ['product'] })
@Index({ properties: ['product', 'combinationKey', 'lifecycleState'] })
export class ProductVariantEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    deleteRule: 'cascade',
  })
  product!: ProductEntity;


  @Property({ fieldName: 'combination_key', type: 'text' })
  combinationKey!: string;

  @Property({ fieldName: 'image_storage_key', length: 500, nullable: true })
  imageStorageKey?: string;

  @Property({ fieldName: 'rank' })
  rank = 1;

  @Enum({
    items: () => ProductVariantLifecycleState,
    fieldName: 'lifecycle_state',
  })
  lifecycleState = ProductVariantLifecycleState.ACTIVE;

  @Property({ fieldName: 'removed_at', nullable: true })
  removedAt?: Date;

  @OneToMany(() => ProductInventoryEntity, (inventory) => inventory.productVariant)
  inventoryRecords = new Collection<ProductInventoryEntity>(this);

  @OneToMany(() => ProductVariantOptionValueEntity, (selection) => selection.productVariant)
  selections = new Collection<ProductVariantOptionValueEntity>(this);

}
