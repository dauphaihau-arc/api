import type { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import type { CategorySummary } from '../app/category.types';
import type { CategoryEntity } from './persistence/entities/category.entity';

export function toCategorySummary(
  category: CategoryEntity,
  storageService: StorageService
): CategorySummary {
  return {
    id: category.id,
    parentId: category.parent?.id,
    name: category.name,
    rank: category.rank,
    imageStorageKey: category.imageStorageKey,
    featuredFacetKeys: category.featuredFacetKeys,
    imageUrl: category.imageStorageKey
      ? storageService.getPublicUrl(category.imageStorageKey)
      : undefined,
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
