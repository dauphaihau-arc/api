import type { PublicProductListItem } from '../../../../app/product.types';
import type { PublicProductListItemResponse } from '../responses/public-product-list-item.response';

export const toPublicProductListItemResponse = (
  product: PublicProductListItem,
): PublicProductListItemResponse => ({
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
      url: product.image.url,
      variant: product.image.variant,
      variants: product.image.variants
        ? Object.fromEntries(
          Object.entries(product.image.variants).map(([name, variant]) => [
            name,
            {
              url: variant.url,
            },
          ]),
        )
        : undefined,
    }
    : undefined,
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
      ...(product.pricing.autoSale
        ? {
          auto_sale: {
            coupon_id: product.pricing.autoSale.couponId,
            percent_off: product.pricing.autoSale.percentOff,
          },
        }
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
});
