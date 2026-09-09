import {
  Collection, Entity, Index, ManyToOne, OneToMany, Property, 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ProductEntity } from './product.entity';
import { ProductOptionValueEntity } from './product-option-value.entity';

@Entity({ tableName: 'product_options' })
@Index({ properties: ['product'] })
export class ProductOptionEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    deleteRule: 'cascade',
  })
  product!: ProductEntity;

  @Property({ fieldName: 'name', length: 255 })
  name!: string;

  @Property({ fieldName: 'normalized_name', length: 255 })
  normalizedName!: string;

  @Property({ fieldName: 'position' })
  position!: number;

  @Property({ fieldName: 'removed_at', nullable: true })
  removedAt?: Date;

  @OneToMany(() => ProductOptionValueEntity, (value) => value.productOption)
  values = new Collection<ProductOptionValueEntity>(this);
}
