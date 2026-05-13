import {
  Entity, Index, ManyToOne, Property, Unique 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { ProductEntity } from './product.entity';

@Entity({ tableName: 'product_images' })
@Index({ properties: ['product'] })
@Unique({ properties: ['product', 'rank'] })
export class ProductImageEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    deleteRule: 'cascade',
  })
  product!: ProductEntity;

  @Property({ fieldName: 'storage_key', length: 500 })
  storageKey!: string;

  @Property({ fieldName: 'rank' })
  rank!: number;
}
