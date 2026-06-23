import type {
  StorefrontIndexedInventoryPrice,
  StorefrontIndexedInventoryPricingMatrix,
  StorefrontIndexedPricingSummaryMatrix,
} from '../../../../app/storefront-indexed-pricing';
import type { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import type { VariantPriceEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';

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
    summaryByMarket?: StorefrontIndexedPricingSummaryMatrix;
    inventoryPricingById: Map<string, {
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
          ...(toBasePriceDocument(inventory.prices.getItems())
            ? { basePrice: toBasePriceDocument(inventory.prices.getItems()) }
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

function toBasePriceDocument(
  prices: VariantPriceEntity[],
): StorefrontIndexedInventoryPrice | undefined {
  const basePrice = prices.find((price) => !price.marketCode && !price.activeTo);

  if (!basePrice) {
    return undefined;
  }

  return {
    amountMinor: basePrice.amountMinor,
    ...(basePrice.originalAmountMinor != null
      ? { originalAmountMinor: basePrice.originalAmountMinor }
      : {}),
    currency: basePrice.currency,
  };
}
