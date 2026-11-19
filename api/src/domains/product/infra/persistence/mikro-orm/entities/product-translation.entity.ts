import {
  Entity,
  Enum,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import {
  STOREFRONT_LANGUAGES,
  type StorefrontLanguage,
} from '~/platform/config/marketplace.config';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ProductEntity } from './product.entity';

@Entity({ tableName: 'product_translations' })
@Unique({ properties: ['product', 'language'] })
export class ProductTranslationEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  product!: ProductEntity;

  @Enum({ items: () => STOREFRONT_LANGUAGES, fieldName: 'language' })
  language!: StorefrontLanguage;

  @Property({ fieldName: 'title', length: 255, nullable: true })
  title?: string;

  @Property({ fieldName: 'description', type: 'text', nullable: true })
  description?: string;
}
