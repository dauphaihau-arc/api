import type { StorefrontLanguage } from '~/platform/config/marketplace.config';

export interface ProductTranslationValues {
  title?: string | null;
  description?: string | null;
}

/**
 * Reads Product translations for public product reads. Implementations must
 * batch lookups by product id so list, suggestion, and recommendation paths
 * never issue one translation query per row.
 */
export abstract class ProductTranslationQueryRepository {
  abstract findProductTranslations(
    productIds: readonly string[],
    language: StorefrontLanguage,
  ): Promise<Map<string, ProductTranslationValues>>;
}
