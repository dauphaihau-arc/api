import {
  Entity, Index, ManyToOne, PrimaryKeyProp, 
} from '@mikro-orm/core';
import { ProductEntity } from './product.entity';
import { ProductOptionEntity } from './product-option.entity';
import { ProductOptionValueEntity } from './product-option-value.entity';
import { ProductVariantEntity } from './product-variant.entity';

@Entity({ tableName: 'product_variant_option_values' })
@Index({ properties: ['product'] })
@Index({ properties: ['productOption'] })
@Index({ properties: ['productOptionValue'] })
export class ProductVariantOptionValueEntity {
  [PrimaryKeyProp]?: ['productVariant', 'productOption'];

  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    deleteRule: 'cascade',
  })
  product!: ProductEntity;

  @ManyToOne(() => ProductVariantEntity, {
    fieldName: 'product_variant_id',
    deleteRule: 'cascade',
    primary: true,
  })
  productVariant!: ProductVariantEntity;

  @ManyToOne(() => ProductOptionEntity, {
    fieldName: 'product_option_id',
    deleteRule: 'cascade',
    primary: true,
  })
  productOption!: ProductOptionEntity;

  @ManyToOne(() => ProductOptionValueEntity, {
    fieldName: 'product_option_value_id',
    deleteRule: 'restrict',
  })
  productOptionValue!: ProductOptionValueEntity;
}
