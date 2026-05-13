import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  Property,
  Unique
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { ProductAttributeValueEntity } from '~/modules/domains/product/infra/persistence/entities/product-attribute-value.entity';
import { CategoryAttributeEntity } from './category-attribute.entity';

@Entity({ tableName: 'category_attribute_options' })
@Index({ properties: ['categoryAttribute'] })
@Unique({ properties: ['categoryAttribute', 'value'] })
export class CategoryAttributeOptionEntity extends AbstractBaseEntity {
  @ManyToOne(() => CategoryAttributeEntity, {
    fieldName: 'category_attribute_id',
    deleteRule: 'cascade',
  })
  categoryAttribute!: CategoryAttributeEntity;

  @Property({ fieldName: 'value', length: 255 })
  value!: string;

  @Property({ fieldName: 'rank' })
  rank = 1;

  @OneToMany(
    () => ProductAttributeValueEntity,
    (attributeValue) => attributeValue.selectedOption
  )
  productAttributeValues = new Collection<ProductAttributeValueEntity>(this);
}
