import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import {
  CATEGORY_IMAGE_VARIANTS,
  buildCategoryVariantStorageKey,
  type CategoryImageVariant,
} from '../app/config/category-image-variant.config';

export type CategoryImageVariantUrls = Partial<Record<CategoryImageVariant, string>>;

/**
 * Resolves the public URL of every generated category image variant for an
 * original storage key.
 *
 * Variants are written by the image pipeline under
 * `images/variants/<variant>.webp`. Keys that do not follow that layout resolve
 * to nothing, so the response keeps falling back to the original `image_url`
 * instead of pointing at an object that will 404.
 */
export function resolveCategoryImageVariantUrls(
  storageService: StorageService,
  originalStorageKey: string | undefined,
): CategoryImageVariantUrls | undefined {
  if (!originalStorageKey) {
    return undefined;
  }

  const urls: CategoryImageVariantUrls = {};

  for (const variant of Object.values(CATEGORY_IMAGE_VARIANTS)) {
    const storageKey = buildCategoryVariantStorageKey(originalStorageKey, variant);
    const url = storageKey ? storageService.getPublicUrl(storageKey) : undefined;

    if (url) {
      urls[variant] = url;
    }
  }

  return Object.keys(urls).length > 0 ? urls : undefined;
}
