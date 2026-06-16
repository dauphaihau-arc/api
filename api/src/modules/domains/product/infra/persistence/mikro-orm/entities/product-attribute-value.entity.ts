import {
  Entity, Index, ManyToOne, Property, Unique 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { CategoryAttributeEntity } from '~/modules/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryAttributeOptionEntity } from '~/modules/domains/category/infra/persistence/entities/category-attribute-option.entity';
import { ProductEntity } from './product.entity';

@Entity({ tableName: 'product_attribute_values' })
@Index({ properties: ['product'] })
@Unique({ properties: ['product', 'categoryAttribute'] })
export class ProductAttributeValueEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    deleteRule: 'cascade',
  })
  product!: ProductEntity;

  @ManyToOne(() => CategoryAttributeEntity, {
    fieldName: 'category_attribute_id',
    deleteRule: 'restrict',
  })
  categoryAttribute!: CategoryAttributeEntity;

  @ManyToOne(() => CategoryAttributeOptionEntity, {
    fieldName: 'selected_option_id',
    nullable: true,
    deleteRule: 'restrict',
  })
  selectedOption?: CategoryAttributeOptionEntity;

  @Property({ fieldName: 'selected_text', length: 255, nullable: true })
  selectedText?: string;
}
