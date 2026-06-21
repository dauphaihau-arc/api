import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { CategoryAttributeEntity } from './category-attribute.entity';

@Entity({ tableName: 'categories' })
@Index({ properties: ['parent'] })
@Index({ properties: ['parent', 'rank'] })
export class CategoryEntity extends AbstractBaseEntity {
  @ManyToOne(() => CategoryEntity, {
    fieldName: 'parent_id',
    nullable: true,
    deleteRule: 'set null',
  })
  parent?: CategoryEntity;

  @OneToMany(() => CategoryEntity, (category) => category.parent)
  children = new Collection<CategoryEntity>(this);

  @Property({ fieldName: 'name', length: 255 })
  name!: string;

  @Property({ fieldName: 'rank' })
  rank!: number;

  @Property({ fieldName: 'image_storage_key', length: 500, nullable: true })
  imageStorageKey?: string;

  @Property({ fieldName: 'featured_facet_keys', type: 'json', nullable: true })
  featuredFacetKeys?: string[];

  @OneToMany(
    () => CategoryAttributeEntity,
    (attribute) => attribute.category,
  )
  attributes = new Collection<CategoryAttributeEntity>(this);

  @OneToMany(() => ProductEntity, (product) => product.category)
  products = new Collection<ProductEntity>(this);
}
