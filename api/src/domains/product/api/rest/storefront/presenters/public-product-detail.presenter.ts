import type { PublicProductDetail } from '../../../../app/product.types';
import type { PublicProductDetailResponse } from '../responses/public-product-detail.response';

export const toPublicProductDetailResponse = (
  product: PublicProductDetail,
): PublicProductDetailResponse => ({
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
  variant_type: product.variantType,
  variant_group_name: product.variantGroupName,
  variant_sub_group_name: product.variantSubGroupName,
  stock_notice_threshold: product.stockNoticeThreshold,
  review_summary: {
    average: product.reviewSummary.average,
    count: product.reviewSummary.count,
  },
  images: product.images.map((image) => ({
    id: image.id,
    storage_key: image.storageKey,
    url: image.url,
    rank: image.rank,
    variant_status: image.variantStatus,
    variant_error: image.variantError,
    variants_generated_at: image.variantsGeneratedAt,
    variants: image.variants
      ? Object.fromEntries(
        image.variants.map((variant) => [
          variant.variant,
          {
            storage_key: variant.storageKey,
            url: variant.url,
            width: variant.width,
            height: variant.height,
            format: variant.format,
          },
        ]),
      )
      : undefined,
  })),
  variants: product.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    option_value_1: variant.optionValue1,
    option_value_2: variant.optionValue2,
    image_storage_key: variant.imageStorageKey,
    rank: variant.rank,
  })),
  inventory: product.inventory.map((inventory) => ({
    id: inventory.id,
    product_variant_id: inventory.productVariantId,
    option_value_1: inventory.optionValue1,
    option_value_2: inventory.optionValue2,
    sku: inventory.sku,
    stock: inventory.stock,
    ...(inventory.amountMinor !== undefined
      ? { amount_minor: inventory.amountMinor }
      : {}),
    ...(inventory.originalAmountMinor !== undefined
      ? { original_amount_minor: inventory.originalAmountMinor }
      : {}),
    ...(inventory.currency ? { currency: inventory.currency } : {}),
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
});
