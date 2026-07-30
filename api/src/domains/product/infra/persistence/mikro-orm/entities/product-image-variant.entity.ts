import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ProductImageVariant } from '~/domains/product/domain/enums/product-image-variant.enum';
import { ProductImageEntity } from './product-image.entity';

@Entity({ tableName: 'product_image_variants' })
@Index({ properties: ['image'] })
@Unique({ properties: ['image', 'variant'] })
export class ProductImageVariantEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductImageEntity, {
    fieldName: 'product_image_id',
    deleteRule: 'cascade',
  })
  image!: ProductImageEntity;

  @Enum({
    items: () => ProductImageVariant,
    fieldName: 'variant',
  })
  variant!: ProductImageVariant;

  @Property({ fieldName: 'storage_key', length: 500 })
  storageKey!: string;

  @Property({ fieldName: 'width', nullable: true })
  width?: number;

  @Property({ fieldName: 'height', nullable: true })
  height?: number;

  @Property({ fieldName: 'format', length: 20, nullable: true })
  format?: string;
}
