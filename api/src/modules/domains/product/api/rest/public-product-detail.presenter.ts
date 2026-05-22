import type { PublicProductDetail } from '../../app/product.types';
import type { PublicProductDetailResponse } from './public-product-detail.response';

export const toPublicProductDetailResponse = (
  product: PublicProductDetail
): PublicProductDetailResponse => ({
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
  description: product.description,
  who_made: product.whoMade,
  is_digital: product.isDigital,
  variant_type: product.variantType,
  variant_group_name: product.variantGroupName,
  variant_sub_group_name: product.variantSubGroupName,
  images: product.images.map((image) => ({
    id: image.id,
    storage_key: image.storageKey,
    url: image.url,
    rank: image.rank,
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
          ])
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
    sku: inventory.sku,
    stock: inventory.stock,
    price: inventory.price,
    sale_price: inventory.salePrice,
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
