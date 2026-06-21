import type { MyProductReview } from '../../../app/product.types';

export function toMyProductReviewResponse(review: MyProductReview) {
  return {
    id: review.id,
    order_id: review.orderId,
    order_item_id: review.orderItemId,
    product: {
      id: review.product.id,
      slug: review.product.slug,
      title: review.product.title,
      shop_slug: review.product.shopSlug,
    },
    rating: review.rating,
    title: review.title,
    body: review.body,
    images: review.images.map((image) => ({
      id: image.id,
      storage_key: image.storageKey,
      url: image.url,
      size_bytes: image.sizeBytes,
      rank: image.rank,
      ...(image.variantStatus ? { variant_status: image.variantStatus } : {}),
      ...(image.variantError ? { variant_error: image.variantError } : {}),
      ...(image.variantsGeneratedAt ? { variants_generated_at: image.variantsGeneratedAt } : {}),
      ...(toVariantRecord(image.variants) ? { variants: toVariantRecord(image.variants) } : {}),
    })),
    status: review.status,
    created_at: review.createdAt,
    updated_at: review.updatedAt,
  };
}

function toVariantRecord(variants: MyProductReview['images'][number]['variants']) {
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
