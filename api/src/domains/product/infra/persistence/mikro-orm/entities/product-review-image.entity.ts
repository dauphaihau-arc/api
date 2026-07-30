import {
  Collection,
  Entity,
  Enum,
  Index,
  ManyToOne,
  OneToMany,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ProductImageVariantStatus } from '~/domains/product/domain/enums/product-image-variant-status.enum';
import { ProductReviewEntity } from './product-review.entity';
import { ProductReviewImageVariantEntity } from './product-review-image-variant.entity';

@Entity({ tableName: 'product_review_images' })
@Index({ properties: ['review'] })
@Unique({ properties: ['review', 'rank'] })
export class ProductReviewImageEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductReviewEntity, {
    fieldName: 'review_id',
    deleteRule: 'cascade',
  })
  review!: ProductReviewEntity;

  @Property({ fieldName: 'storage_key', length: 500 })
  storageKey!: string;

  @Property({ fieldName: 'size_bytes', type: 'integer', nullable: true })
  sizeBytes?: number;

  @Property()
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

  @OneToMany(() => ProductReviewImageVariantEntity, (variant) => variant.image, {
    orphanRemoval: true,
  })
  variants = new Collection<ProductReviewImageVariantEntity>(this);
}
