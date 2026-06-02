import { ProductState } from '../../../domain/enums/product-state.enum';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import { ProductNotReadyToPublishError } from '../../errors/product-app.error';
import type { ProductDraftSummary } from '../../product.types';

export function validatePublishReadiness(
  product: ProductDraftSummary
): ProductNotReadyToPublishError | null {
  if (
    product.state === ProductState.REMOVED
    || product.state === ProductState.UNAVAILABLE
  ) {
    return new ProductNotReadyToPublishError(
      'Removed or unavailable products cannot be published'
    );
  }

  if (product.title.trim().length < 2) {
    return new ProductNotReadyToPublishError(
      'Product title is required before publishing'
    );
  }

  if (product.description.trim().length < 2) {
    return new ProductNotReadyToPublishError(
      'Product description is required before publishing'
    );
  }

  if (!product.categoryId) {
    return new ProductNotReadyToPublishError(
      'Product category is required before publishing'
    );
  }

  if (product.images.length === 0) {
    return new ProductNotReadyToPublishError(
      'At least one product image is required before publishing'
    );
  }

  if (!product.shipping) {
    return new ProductNotReadyToPublishError(
      'Shipping configuration is required before publishing'
    );
  }

  if (product.shipping.destinations.length === 0) {
    return new ProductNotReadyToPublishError(
      'At least one shipping destination is required before publishing'
    );
  }

  if (product.inventory.length === 0) {
    return new ProductNotReadyToPublishError(
      'Inventory is required before publishing'
    );
  }

  for (const inventory of product.inventory) {
    if (inventory.amountMinor === undefined || !inventory.currency) {
      return new ProductNotReadyToPublishError(
        'Pricing is required for every inventory row before publishing'
      );
    }
  }

  const variantType = product.variantType ?? ProductVariantType.NONE;

  if (variantType === ProductVariantType.NONE) {
    if (product.inventory.length !== 1) {
      return new ProductNotReadyToPublishError(
        'Products without variants must have exactly one inventory row before publishing'
      );
    }
  }
  else {
    if (product.variants.length === 0) {
      return new ProductNotReadyToPublishError(
        'Variant-enabled products must define variants before publishing'
      );
    }

    if (product.inventory.length !== product.variants.length) {
      return new ProductNotReadyToPublishError(
        'Variant-enabled products must have one inventory row per variant before publishing'
      );
    }
  }

  return null;
}
