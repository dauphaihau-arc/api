import type { PublicProductListResult } from '../../app/product.types';
import type { PublicProductListResponse } from './public-product-list.response';

export const toPublicProductListResponse = (
  result: PublicProductListResult
): PublicProductListResponse => ({
  items: result.items.map((product) => ({
    id: product.id,
    shop: {
      id: product.shop.id,
      public_id: product.shop.publicId,
      shop_name: product.shop.shopName,
      slug: product.shop.slug,
    },
    category_id: product.categoryId,
    title: product.title,
    slug: product.slug,
    image: product.image
      ? {
        storage_key: product.image.storageKey,
        variant: product.image.variant,
        variants: product.image.variants
          ? Object.fromEntries(
            Object.entries(product.image.variants).map(([name, variant]) => [
              name,
              {
                storage_key: variant.storageKey,
              },
            ])
          )
          : undefined,
      }
      : undefined,
    variant_type: product.variantType,
    inventory: product.inventory
      ? {
        stock: product.inventory.stock,
        sku: product.inventory.sku,
        ...(product.inventory.amountMinor !== undefined
          ? { amount_minor: product.inventory.amountMinor }
          : {}),
        ...(product.inventory.originalAmountMinor !== undefined
          ? { original_amount_minor: product.inventory.originalAmountMinor }
          : {}),
        ...(product.inventory.currency
          ? { currency: product.inventory.currency }
          : {}),
      }
      : undefined,
    created_at: product.createdAt,
  })),
  meta: {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
    total_pages: result.meta.totalPages,
    has_next_page: result.meta.hasNextPage,
    has_previous_page: result.meta.hasPreviousPage,
  },
});
