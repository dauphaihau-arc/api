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
import { CategoryEntity } from './category.entity';

@Entity({ tableName: 'category_translations' })
@Unique({ properties: ['category', 'language'] })
export class CategoryTranslationEntity extends AbstractBaseEntity {
  @ManyToOne(() => CategoryEntity, {
    fieldName: 'category_id',
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  category!: CategoryEntity;

  @Enum({ items: () => STOREFRONT_LANGUAGES, fieldName: 'language' })
  language!: StorefrontLanguage;

  @Property({ fieldName: 'name', length: 255, nullable: true })
  name?: string;
}
