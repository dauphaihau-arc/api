import type { PublicProductDetail } from '../../../../app/product.types';
import type { PublicProductDetailResponse } from '../responses/public-product-detail.response';

function buildImageUrlsByStorageKey(product: PublicProductDetail): Map<string, string> {
  const urlsByStorageKey = new Map<string, string>();

  product.images.forEach((image) => {
    if (image.url) {
      urlsByStorageKey.set(image.storageKey, image.url);
    }

    image.variants?.forEach((variant) => {
      if (variant.url) {
        urlsByStorageKey.set(variant.storageKey, variant.url);
      }
    });
  });

  return urlsByStorageKey;
}

export const toPublicProductDetailResponse = (
  product: PublicProductDetail,
): PublicProductDetailResponse => {
  const imageUrlsByStorageKey = buildImageUrlsByStorageKey(product);

  return {
    id: product.id,
    shop: {
      id: product.shop.id,
      public_id: product.shop.publicId,
      shop_name: product.shop.shopName,
      slug: product.shop.slug,
    },
    category_id: product.categoryId,
    category_path: product.categoryPath?.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
    })),
    title: product.title,
    slug: product.slug,
    description: product.description,
    who_made: product.whoMade,
    is_digital: product.isDigital,
    stock_notice_threshold: product.stockNoticeThreshold,
    review_summary: {
      average: product.reviewSummary.average,
      count: product.reviewSummary.count,
    },
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url ?? '',
      rank: image.rank,
      variant_status: image.variantStatus,
      variant_error: image.variantError,
      variants_generated_at: image.variantsGeneratedAt,
      variants: image.variants
        ? Object.fromEntries(
          image.variants.map((variant) => [
            variant.variant,
            {
              url: variant.url ?? '',
              width: variant.width,
              height: variant.height,
              format: variant.format,
            },
          ]),
        )
        : undefined,
    })),
    options: (product.options ?? []).map((option) => ({
      id: option.id,
      name: option.name,
      position: option.position,
      values: option.values.map((value) => ({
        id: value.id,
        value: value.value,
        position: value.position,
      })),
    })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      selections: (variant.selections ?? []).map((selection) => ({
        option_id: selection.optionId,
        value_id: selection.valueId,
      })),
      image_url: variant.imageStorageKey
        ? imageUrlsByStorageKey.get(variant.imageStorageKey)
        : undefined,
      rank: variant.rank,
    })),
    inventory: product.inventory.map((inventory) => ({
      id: inventory.id,
      product_variant_id: inventory.productVariantId,
      sku: inventory.sku,
      stock: inventory.stock,
      on_hand_quantity: inventory.onHandQuantity ?? inventory.stock,
      reserved_quantity: inventory.reservedQuantity ?? 0,
      available_quantity: inventory.availableQuantity ?? inventory.stock,
      on_hand_version: inventory.onHandVersion ?? 1,
      shortage: inventory.shortage ?? 0,
      ...(inventory.amountMinor !== undefined
        ? { amount_minor: inventory.amountMinor }
        : {}),
      ...(inventory.originalAmountMinor !== undefined
        ? { original_amount_minor: inventory.originalAmountMinor }
        : {}),
      ...(inventory.currency ? { currency: inventory.currency } : {}),
      ...(inventory.autoSale
        ? {
          auto_sale: {
            coupon_id: inventory.autoSale.couponId,
            percent_off: inventory.autoSale.percentOff,
          },
        }
        : {}),
    })),
    shipping: product.shipping
      ? {
        origin_country: product.shipping.originCountry,
        process_time_label: product.shipping.processTimeLabel,
        destinations: product.shipping.destinations.map((destination) => ({
          id: destination.id,
          country_code: destination.countryCode,
          delivery_time_label: destination.deliveryTimeLabel,
          service: destination.service,
          charge_type: destination.chargeType,
          rank: destination.rank,
        })),
      }
      : undefined,
  };
};
