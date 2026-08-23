import type { PublicProductReviewListResult } from '../../../../app/product.types';
import type { PublicProductReviewListResponse } from '../responses/public-product-review-list.response';

export function toPublicProductReviewListResponse(
  result: PublicProductReviewListResult,
): PublicProductReviewListResponse {
  return {
    summary: {
      average: result.summary.average,
      count: result.summary.count,
      breakdown: result.summary.breakdown,
      filters: {
        has_images: result.summary.filters.hasImages,
        has_comment: result.summary.filters.hasComment,
      },
    },
    items: result.items.map((item) => ({
      id: item.id,
      rating: item.rating,
      title: item.title,
      body: item.body,
      image: item.images[0]
        ? {
          id: item.images[0].id,
          url: item.images[0].url ?? '',
          rank: item.images[0].rank,
          ...(toVariantRecord(item.images[0].variants)
            ? { variants: toVariantRecord(item.images[0].variants) }
            : {}),
        }
        : undefined,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      verified_purchase: item.verifiedPurchase,
      author: {
        display_name: item.author.displayName,
      },
    })),
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

function toVariantRecord(variants: PublicProductReviewListResult['items'][number]['images'][number]['variants']) {
  if (!variants || variants.length === 0) {
    return undefined;
  }

  return variants.reduce<Record<string, {
    url: string;
    width?: number;
    height?: number;
    format?: string;
  }>>((accumulator, variant) => {
    accumulator[variant.variant] = {
      url: variant.url ?? '',
      width: variant.width,
      height: variant.height,
      format: variant.format,
    };
    return accumulator;
  }, {});
}
