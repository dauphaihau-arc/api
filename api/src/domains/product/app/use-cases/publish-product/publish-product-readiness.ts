import { ProductState } from '../../../domain/enums/product-state.enum';
import { ProductNotReadyToPublishError } from '../../errors/product-app.error';
import type { ProductDraftSummary } from '../../product.types';

export function validatePublishReadiness(
  product: ProductDraftSummary,
): ProductNotReadyToPublishError | null {
  const visibleVariants = product.variants.filter((variant) => variant.lifecycleState !== 'removed');
  const visibleInventory = product.inventory.filter((inventory) => inventory.lifecycleState !== 'removed');

  if (
    product.state === ProductState.REMOVED
    || product.state === ProductState.UNAVAILABLE
  ) {
    return new ProductNotReadyToPublishError(
      'Removed or unavailable products cannot be published',
    );
  }

  if (product.title.trim().length < 2) {
    return new ProductNotReadyToPublishError(
      'Product title is required before publishing',
    );
  }

  if (product.description.trim().length < 2) {
    return new ProductNotReadyToPublishError(
      'Product description is required before publishing',
    );
  }

  if (!product.categoryId) {
    return new ProductNotReadyToPublishError(
      'Product category is required before publishing',
    );
  }

  if (product.images.length === 0) {
    return new ProductNotReadyToPublishError(
      'At least one product image is required before publishing',
    );
  }

  if (!product.shipping) {
    return new ProductNotReadyToPublishError(
      'Shipping configuration is required before publishing',
    );
  }

  if (product.shipping.destinations.length === 0) {
    return new ProductNotReadyToPublishError(
      'At least one shipping destination is required before publishing',
    );
  }

  if (visibleInventory.length === 0) {
    return new ProductNotReadyToPublishError(
      'Inventory is required before publishing',
    );
  }

  for (const inventory of visibleInventory) {
    if (!inventory.sku?.trim()) {
      return new ProductNotReadyToPublishError(
        'SKU is required for every inventory row before publishing',
      );
    }

    if (inventory.amountMinor === undefined || !inventory.currency) {
      return new ProductNotReadyToPublishError(
        'Pricing is required for every inventory row before publishing',
      );
    }
  }

  const optionCount = product.options?.filter((option) => option.values.length > 0).length ?? 0;

  if (optionCount === 0) {
    if (visibleVariants.length !== 1 || visibleVariants[0].selections.length !== 0 || visibleInventory.length !== 1) {
      return new ProductNotReadyToPublishError(
        'Products without options must have exactly one default variant and inventory row before publishing',
      );
    }
  }
  else {
    if (visibleVariants.length === 0) {
      return new ProductNotReadyToPublishError(
        'Products with options must define variants before publishing',
      );
    }

    if (visibleInventory.length !== visibleVariants.length) {
      return new ProductNotReadyToPublishError(
        'Products with options must have one inventory row per variant before publishing',
      );
    }
  }

  return null;
}
