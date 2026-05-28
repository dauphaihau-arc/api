import type { ShopProductListResult } from '~/modules/domains/product/app/product.types';
import type { ShopProductListResponse } from './shop-product-list.response';

export const toShopProductListResponse = (
  result: ShopProductListResult
): ShopProductListResponse => ({
  items: result.items.map((product) => ({
    id: product.id,
    public_id: product.publicId,
    shop_id: product.shopId,
    shop_public_id: product.shopPublicId,
    category_id: product.categoryId,
    title: product.title,
    slug: product.slug,
    description: product.description,
    state: product.state,
    who_made: product.whoMade,
    is_digital: product.isDigital,
    non_taxable: product.nonTaxable,
    variant_type: product.variantType,
    variant_group_name: product.variantGroupName,
    variant_sub_group_name: product.variantSubGroupName,
    images: product.images.map((image) => ({
      id: image.id,
      storage_key: image.storageKey,
      url: image.url,
      rank: image.rank,
      variant_status: image.variantStatus,
      variant_error: image.variantError,
      variants_generated_at: image.variantsGeneratedAt,
      variants: image.variants?.map((variant) => ({
        id: variant.id,
        variant: variant.variant,
        storage_key: variant.storageKey,
        url: variant.url,
        width: variant.width,
        height: variant.height,
        format: variant.format,
      })),
    })),
    attributes: product.attributes.map((attribute) => ({
      id: attribute.id,
      category_attribute_id: attribute.categoryAttributeId,
      category_attribute_name: attribute.categoryAttributeName,
      input_type: attribute.inputType,
      selected_option_id: attribute.selectedOptionId,
      selected_option_value: attribute.selectedOptionValue,
      selected_text: attribute.selectedText,
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
      ...(inventory.amountMinor !== undefined
        ? { amount_minor: inventory.amountMinor }
        : {}),
      ...(inventory.originalAmountMinor !== undefined
        ? { original_amount_minor: inventory.originalAmountMinor }
        : {}),
      ...(inventory.currency ? { currency: inventory.currency } : {}),
    })),
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
