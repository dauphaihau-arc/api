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
    pricing: product.pricing
      ? {
        ...(product.pricing.minAmountMinor !== undefined
          ? { min_amount_minor: product.pricing.minAmountMinor }
          : {}),
        ...(product.pricing.maxAmountMinor !== undefined
          ? { max_amount_minor: product.pricing.maxAmountMinor }
          : {}),
        ...(product.pricing.originalMinAmountMinor !== undefined
          ? { original_min_amount_minor: product.pricing.originalMinAmountMinor }
          : {}),
        ...(product.pricing.originalMaxAmountMinor !== undefined
          ? { original_max_amount_minor: product.pricing.originalMaxAmountMinor }
          : {}),
        ...(product.pricing.currency
          ? { currency: product.pricing.currency }
          : {}),
      }
      : undefined,
    availability: {
      in_stock: product.availability.inStock,
      low_stock: product.availability.lowStock,
      stock_total: product.availability.stockTotal,
    },
    variant_count: product.variantCount,
    ...(product.hasFreeShipping !== undefined
      ? { has_free_shipping: product.hasFreeShipping }
      : {}),
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
