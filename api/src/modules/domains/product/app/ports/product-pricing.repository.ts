import type { ProductDraftSummary } from '../product.types';

export abstract class ProductPricingRepository {
  abstract replacePricing(input: {
    productId: string;
    pricing: Array<{
      inventoryId: string;
      amountMinor: number;
      originalAmountMinor?: number;
      currency: string;
    }>;
  }): Promise<ProductDraftSummary | null>;
}
