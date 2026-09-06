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
import { createPublicId } from '~/platform/ids/public-id';
import { CategoryEntity } from '~/domains/category/infra/persistence/entities/category.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ProductState } from '~/domains/product/domain/enums/product-state.enum';
import { ProductVariantType } from '~/domains/product/domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import { ProductAttributeValueEntity } from './product-attribute-value.entity';
import { ProductImageEntity } from './product-image.entity';
import { ProductInventoryEntity } from './product-inventory.entity';
import { ProductShippingProfileEntity } from './product-shipping-profile.entity';
import { ProductVariantEntity } from './product-variant.entity';

@Entity({ tableName: 'products' })
@Index({ properties: ['category'] })
@Index({ properties: ['state'] })
@Index({ properties: ['shop', 'state'] })
@Unique({ properties: ['shop', 'slug'] })
export class ProductEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'public_id', length: 12 })
  @Unique()
  publicId: string = createPublicId();

  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @ManyToOne(() => CategoryEntity, {
    fieldName: 'category_id',
    nullable: true,
    deleteRule: 'set null',
  })
  category?: CategoryEntity;

  @Property({ fieldName: 'title', length: 255 })
  title!: string;

  @Property({ fieldName: 'slug', length: 255 })
  slug!: string;

  @Property({ fieldName: 'description', type: 'text' })
  description!: string;

  @Enum({ items: () => ProductState, fieldName: 'state' })
  state = ProductState.DRAFT;

  @Enum({
    items: () => ProductWhoMade,
    fieldName: 'who_made',
  })
  whoMade!: ProductWhoMade;

  @Property({ fieldName: 'is_digital' })
  isDigital = false;

  @Property({ fieldName: 'non_taxable' })
  nonTaxable = false;

  @Property({ fieldName: 'tags', type: 'json' })
  tags: string[] = [];

  @Enum({
    items: () => ProductVariantType,
    fieldName: 'variant_type',
    nullable: true,
  })
  variantType?: ProductVariantType;

  @Property({
    fieldName: 'variant_group_name',
    length: 255,
    nullable: true,
  })
  variantGroupName?: string;

  @Property({
    fieldName: 'variant_sub_group_name',
    length: 255,
    nullable: true,
  })
  variantSubGroupName?: string;

  @Property({ fieldName: 'views' })
  views = 0;

  @Property({
    fieldName: 'rating_average',
    type: 'numeric',
    precision: 3,
    scale: 1,
  })
  ratingAverage = 0;

  @Property({ fieldName: 'review_count' })
  reviewCount = 0;

  @Property({ fieldName: 'published_at', nullable: true })
  publishedAt?: Date;

  @Property({ fieldName: 'public_sort_prices', type: 'json', nullable: true })
  publicSortPrices?: Record<string, number>;

  @OneToMany(() => ProductImageEntity, (image) => image.product)
  images = new Collection<ProductImageEntity>(this);

  @OneToMany(
    () => ProductAttributeValueEntity,
    (attributeValue) => attributeValue.product,
  )
  attributeValues = new Collection<ProductAttributeValueEntity>(this);

  @OneToMany(() => ProductVariantEntity, (variant) => variant.product)
  variants = new Collection<ProductVariantEntity>(this);

  @OneToMany(() => ProductInventoryEntity, (inventory) => inventory.product)
  inventoryRecords = new Collection<ProductInventoryEntity>(this);

  @OneToMany(
    () => ProductShippingProfileEntity,
    (shippingProfile) => shippingProfile.product,
  )
  shippingProfiles = new Collection<ProductShippingProfileEntity>(this);
}
