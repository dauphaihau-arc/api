export interface SaleProjectionTarget {
  shopId: string;
  productId: string;
}

/**
 * The best active Sale percentage applying to a Product, with the Promotion
 * that owns it. Overlapping Sales never compound: only the highest matching
 * percentage is returned, and the regular price it applies to is always the
 * Product's current one, never a frozen creation-time base.
 */
export interface SaleProjection {
  promotionId: string;
  percentOff: number;
}

export interface FindBestSalesForProductsInput {
  targets: SaleProjectionTarget[];
  at?: Date;
}

/**
 * Read port for catalog projection and checkout pricing: resolves the winning
 * Sale per requested Product. Catalog projection is derived display data; the
 * checkout quote and Order commitment re-resolve through the same rule but
 * never trust a projection document.
 */
export abstract class SaleProjectionReader {
  abstract findBestSalesForProducts(
    input: FindBestSalesForProductsInput,
  ): Promise<Map<string, SaleProjection>>;
}
