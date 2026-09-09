import {
  Collection, Entity, Index, ManyToOne, OneToMany, Property, 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ProductOptionEntity } from './product-option.entity';
import { ProductVariantOptionValueEntity } from './product-variant-option-value.entity';

@Entity({ tableName: 'product_option_values' })
@Index({ properties: ['productOption'] })
export class ProductOptionValueEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductOptionEntity, {
    fieldName: 'product_option_id',
    deleteRule: 'cascade',
  })
  productOption!: ProductOptionEntity;

  @Property({ fieldName: 'value', length: 255 })
  value!: string;

  @Property({ fieldName: 'normalized_value', length: 255 })
  normalizedValue!: string;

  @Property({ fieldName: 'position' })
  position!: number;

  @Property({ fieldName: 'removed_at', nullable: true })
  removedAt?: Date;

  @OneToMany(() => ProductVariantOptionValueEntity, (selection) => selection.productOptionValue)
  variantSelections = new Collection<ProductVariantOptionValueEntity>(this);
}
