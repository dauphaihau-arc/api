import type { PublicProductReviewImageListResult } from '../../../../app/product.types';
import type { PublicProductReviewImageListResponse } from '../responses/public-product-review-image-list.response';

export function toPublicProductReviewImageListResponse(
  result: PublicProductReviewImageListResult,
): PublicProductReviewImageListResponse {
  return {
    items: result.items.map((item) => ({
      id: item.id,
      storage_key: item.storageKey,
      url: item.url,
      rank: item.rank,
      review_id: item.reviewId,
      review_title: item.reviewTitle,
      created_at: item.createdAt,
      ...(toVariantRecord(item.variants) ? { variants: toVariantRecord(item.variants) } : {}),
      author: {
        display_name: item.author.displayName,
      },
    })),
    meta: {
      next_cursor: result.meta.nextCursor,
      has_more: result.meta.hasMore,
    },
  };
}

function toVariantRecord(variants: PublicProductReviewImageListResult['items'][number]['variants']) {
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
