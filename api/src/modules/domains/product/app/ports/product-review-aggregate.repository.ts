export abstract class ProductReviewAggregateRepository {
  abstract recalculateForProduct(productId: string): Promise<void>;
}
