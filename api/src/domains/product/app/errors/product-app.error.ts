import type { ProductDraftSummary } from '../product.types';

import { DomainError } from '~/platform/errors/domain.error';

export abstract class ProductAppError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

export class ActorCannotCreateProductDraftError extends ProductAppError {
  constructor() {
    super('Actor is not allowed to create a product draft for this shop');
  }
}

export class CategoryNotFoundError extends ProductAppError {
  constructor(categoryId: string) {
    super(`Category "${categoryId}" was not found`);
  }
}

export class InvalidProductVariantConfigurationError extends ProductAppError {
  constructor(message: string) {
    super(message);
  }
}

export type ProductSkuConflictDetail = {
  sku: string;
  inventoryId?: string;
  variantId?: string;
  clientRef?: string;
};

export class ProductConfigurationConflictError extends ProductAppError {
  constructor(
    public readonly code: 'ProductSkuConflict' | 'ProductReservationConflict' | 'ProductOnHandVersionConflict',
    public readonly affectedIds: string[],
    public readonly currentProduct: ProductDraftSummary,
    public readonly skuConflicts: ProductSkuConflictDetail[] = [],
  ) {
    super(code);
  }
}

export class InvalidProductAttributeSelectionError extends ProductAppError {
  constructor(message: string) {
    super(message);
  }
}

export class ProductSlugAlreadyExistsError extends ProductAppError {
  constructor(slug: string) {
    super(`A product with slug "${slug}" already exists in this shop`);
  }
}

export class ProductNotFoundError extends ProductAppError {
  constructor(productId: string) {
    super(`Product "${productId}" was not found`);
  }
}

export class ProductNotReadyToPublishError extends ProductAppError {
  constructor(message: string) {
    super(message);
  }
}

export class PublishedProductReplacementRejectedError extends ProductAppError {
  constructor() {
    super('Published Products cannot replace Product Variants or Inventory as a complete collection');
  }
}

export class ProductVersionConflictError extends ProductAppError {
  constructor(public readonly currentProduct: ProductDraftSummary) {
    super('Product Version conflict');
  }
}

export class ProductOnHandVersionConflictError extends ProductAppError {
  constructor(
    public readonly currentInventory: {
      id: string;
      onHandQuantity?: number;
      reservedQuantity?: number;
      onHandVersion?: number;
    },
  ) {
    super('On-hand Version conflict');
  }
}

export class ProductDraftIncompleteError extends ProductAppError {
  constructor(
    public readonly productId: string,
    public readonly failedStep:
      | 'images'
      | 'attributes'
      | 'variants'
      | 'inventory'
      | 'shipping',
    message: string,
  ) {
    super(message);
  }
}

export class ProductReviewOrderItemNotFoundError extends ProductAppError {
  constructor(orderItemId: string) {
    super(`Order item "${orderItemId}" was not found`);
  }
}

export class ProductReviewNotEligibleError extends ProductAppError {
  constructor(message: string) {
    super(message);
  }
}

export class ProductReviewEditLimitExceededError extends ProductAppError {
  constructor(limit: number) {
    super(`A product review can be edited at most ${limit} times per day`);
  }
}

export class InvalidProductReviewImageError extends ProductAppError {
  constructor(message: string) {
    super(message);
  }
}
