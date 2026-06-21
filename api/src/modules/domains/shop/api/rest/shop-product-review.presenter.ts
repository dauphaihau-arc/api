import type {
  ShopProductReviewItem,
  ShopProductReviewListResult,
} from '~/modules/domains/product/app/product.types';
import type {
  ShopProductReviewListResponse,
  ShopProductReviewResponse,
} from './shop-product-review.response';

function toShopProductReviewResponse(
  review: ShopProductReviewItem,
): ShopProductReviewResponse {
  return {
    id: review.id,
    order_id: review.orderId,
    order_item_id: review.orderItemId,
    rating: review.rating,
    title: review.title,
    body: review.body,
    status: review.status,
    images: review.images.map((image) => ({
      id: image.id,
      storage_key: image.storageKey,
      url: image.url,
      rank: image.rank,
      ...(image.variantStatus ? { variant_status: image.variantStatus } : {}),
      ...(image.variantError ? { variant_error: image.variantError } : {}),
      ...(image.variantsGeneratedAt ? { variants_generated_at: image.variantsGeneratedAt } : {}),
      ...(toVariantRecord(image.variants) ? { variants: toVariantRecord(image.variants) } : {}),
    })),
    created_at: review.createdAt,
    updated_at: review.updatedAt,
    author: {
      id: review.author.id,
      display_name: review.author.displayName,
      email: review.author.email,
    },
    product: {
      id: review.product.id,
      title: review.product.title,
      slug: review.product.slug,
    },
  };
}

function toVariantRecord(variants: ShopProductReviewItem['images'][number]['variants']) {
  if (!variants || variants.length === 0) {
    return undefined;
  }

  return variants.reduce<Record<string, {
    storage_key: string;
    url?: string;
    width?: number;
    height?: number;
    format?: string;
  }>>((accumulator, variant) => {
    accumulator[variant.variant] = {
      storage_key: variant.storageKey,
      url: variant.url,
      width: variant.width,
      height: variant.height,
      format: variant.format,
    };
    return accumulator;
  }, {});
}

export function toShopProductReviewListResponse(
  result: ShopProductReviewListResult,
): ShopProductReviewListResponse {
  return {
    items: result.items.map(toShopProductReviewResponse),
    counts: result.counts,
    meta: {
      page: result.meta.page,
      limit: result.meta.limit,
      total: result.meta.total,
      total_pages: result.meta.totalPages,
      has_next_page: result.meta.hasNextPage,
      has_previous_page: result.meta.hasPreviousPage,
    },
  };
}
