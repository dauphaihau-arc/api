import type {
  StorefrontIndexedInventoryPrice,
  StorefrontIndexedInventoryPricingMatrix,
  StorefrontIndexedPriceSummary,
  StorefrontIndexedPricingSummaryMatrix,
} from '../../../../app/storefront-indexed-pricing';
import type { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';

export interface CatalogProductPriceDocument {
  _id: string;
  productId: string;
  summaryByMarket?: StorefrontIndexedPricingSummaryMatrix;
  inventoryPricingById: Record<string, {
    basePrice?: StorefrontIndexedInventoryPrice;
    marketOverrides?: StorefrontIndexedInventoryPricingMatrix;
    resolvedByMarket?: StorefrontIndexedInventoryPricingMatrix;
  }>;
  updatedAt: Date;
  sourceVersion: number;
}

export function toCatalogProductPriceDocument(
  product: ProductEntity,
  indexedPricingProjection: {
    baseSummary?: StorefrontIndexedPriceSummary;
    summaryByMarket?: StorefrontIndexedPricingSummaryMatrix;
    inventoryPricingById: Map<string, {
      basePrice?: StorefrontIndexedInventoryPrice;
      marketOverrides?: StorefrontIndexedInventoryPricingMatrix;
      resolvedByMarket?: StorefrontIndexedInventoryPricingMatrix;
    }>;
  },
): CatalogProductPriceDocument {
  const inventoryPricingById = Object.fromEntries(
    product.inventoryRecords.getItems().map((inventory) => {
      const indexedPricing = indexedPricingProjection.inventoryPricingById.get(inventory.id);

      return [
        inventory.id,
        {
          ...(indexedPricing?.basePrice
            ? { basePrice: indexedPricing.basePrice }
            : {}),
          ...(indexedPricing?.marketOverrides
            ? { marketOverrides: indexedPricing.marketOverrides }
            : {}),
          ...(indexedPricing?.resolvedByMarket
            ? { resolvedByMarket: indexedPricing.resolvedByMarket }
            : {}),
        },
      ];
    }),
  );

  return {
    _id: product.id,
    productId: product.id,
    summaryByMarket: indexedPricingProjection.summaryByMarket,
    inventoryPricingById,
    updatedAt: product.updatedAt,
    sourceVersion: product.updatedAt.getTime(),
  };
}
