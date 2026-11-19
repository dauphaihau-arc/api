import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import {
  DEFAULT_STOREFRONT_LANGUAGE,
  resolveLocalizedValue,
} from '~/platform/localization/storefront-language';
import type { StorefrontLanguage } from '~/platform/config/marketplace.config';
import type { CategorySummary } from '../app/category.types';
import { resolveCategoryImageVariantUrls } from './category-image-urls';
import type { CategoryEntity } from './persistence/entities/category.entity';

/**
 * Resolves a category's display name for the active Storefront Language. Only
 * the name is localized; slugs are identity and stay as authored. Categories
 * whose translations were not populated fall back to the English base value.
 */
export function resolveCategoryName(
  category: Pick<CategoryEntity, 'name' | 'translations'>,
  language: StorefrontLanguage,
): string {
  const translations = category.translations?.isInitialized()
    ? category.translations.getItems()
    : [];
  const translatedName = translations.find(
    (translation) => translation.language === language,
  )?.name;

  return resolveLocalizedValue(language, category.name, translatedName);
}

export function toCategorySummary(
  category: CategoryEntity,
  storageService: StorageService,
  language: StorefrontLanguage = DEFAULT_STOREFRONT_LANGUAGE,
): CategorySummary {
  return {
    id: category.id,
    publicId: category.publicId,
    slug: category.slug,
    parentId: category.parent?.id,
    parentPublicId: category.parent?.publicId,
    name: resolveCategoryName(category, language),
    rank: category.rank,
    imageStorageKey: category.imageStorageKey,
    featuredFacetKeys: category.featuredFacetKeys,
    imageUrl: category.imageStorageKey
      ? storageService.getPublicUrl(category.imageStorageKey)
      : undefined,
    imageVariantUrls: resolveCategoryImageVariantUrls(
      storageService,
      category.imageStorageKey,
    ),
    attributes: category.attributes
      .getItems()
      .sort((left, right) => left.rank - right.rank)
      .map((attribute) => ({
        id: attribute.id,
        key: attribute.key,
        name: attribute.name,
        inputType: attribute.inputType,
        isRequired: attribute.isRequired,
        rank: attribute.rank,
        options: attribute.options
          .getItems()
          .sort((left, right) => left.rank - right.rank)
          .map((option) => ({
            id: option.id,
            value: option.value,
            rank: option.rank,
          })),
      })),
  };
}
