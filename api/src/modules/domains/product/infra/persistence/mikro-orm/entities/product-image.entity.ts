import {
  Collection, Entity, Enum, Index, ManyToOne, OneToMany, Property, Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { ProductImageVariantStatus } from '~/modules/domains/product/domain/enums/product-image-variant-status.enum';
import { ProductEntity } from './product.entity';
import { ProductImageVariantEntity } from './product-image-variant.entity';

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

  @Enum({
    items: () => ProductImageVariantStatus,
    fieldName: 'variant_status',
  })
  variantStatus = ProductImageVariantStatus.PENDING;

  @Property({ fieldName: 'variant_error', type: 'text', nullable: true })
  variantError?: string;

  @Property({ fieldName: 'variants_generated_at', nullable: true })
  variantsGeneratedAt?: Date;

  @OneToMany(() => ProductImageVariantEntity, (variant) => variant.image)
  variants = new Collection<ProductImageVariantEntity>(this);
}
