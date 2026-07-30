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
import { ProductAttributeValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-attribute-value.entity';
import { CategoryAttributeOptionEntity } from './category-attribute-option.entity';
import { CategoryEntity } from './category.entity';

@Entity({ tableName: 'category_attributes' })
@Index({ properties: ['category'] })
@Unique({ properties: ['category', 'key'] })
export class CategoryAttributeEntity extends AbstractBaseEntity {
  @ManyToOne(() => CategoryEntity, {
    fieldName: 'category_id',
    deleteRule: 'cascade',
  })
  category!: CategoryEntity;

  @Property({ fieldName: 'key', length: 255 })
  key!: string;

  @Property({ fieldName: 'name', length: 255 })
  name!: string;

  @Property({ fieldName: 'input_type', length: 30 })
  inputType = 'select';

  @Property({ fieldName: 'is_required' })
  isRequired = false;

  @Property({ fieldName: 'rank' })
  rank = 1;

  @OneToMany(
    () => CategoryAttributeOptionEntity,
    (option) => option.categoryAttribute,
  )
  options = new Collection<CategoryAttributeOptionEntity>(this);

  @OneToMany(
    () => ProductAttributeValueEntity,
    (attributeValue) => attributeValue.categoryAttribute,
  )
  productAttributeValues = new Collection<ProductAttributeValueEntity>(this);
}
