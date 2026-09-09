import type { ShopProductListResult } from '~/domains/product/app/product.types';
import type { ShopProductListResponse } from './shop-product-list.response';

function resolveShopListImage(
  image: ShopProductListResult['items'][number]['images'][number],
): { url?: string } {
  const thumbnailVariant = image.variants?.find(
    (variant) => variant.variant === 'thumb_1x1',
  );

  return {
    url: thumbnailVariant?.url ?? image.url,
  };
}

export const toShopProductListResponse = (
  result: ShopProductListResult,
): ShopProductListResponse => ({
  items: result.items.map((product) => {
    const primaryImage = product.images[0]
      ? resolveShopListImage(product.images[0])
      : undefined;
    const visibleVariants = product.variants.filter((variant) => variant.lifecycleState !== 'removed');
    const visibleVariantIds = new Set(visibleVariants.map((variant) => variant.id));
    const visibleInventory = product.inventory.filter((inventory) =>
      inventory.lifecycleState !== 'removed'
      && (!inventory.productVariantId || visibleVariantIds.has(inventory.productVariantId)));

    return {
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
      tags: product.tags ?? [],
      image_url: primaryImage?.url,
      images: product.images.map((image) => {
        const listImage = resolveShopListImage(image);

        return {
          id: image.id,
          image_url: listImage.url,
          rank: image.rank,
          variant_status: image.variantStatus,
          variant_error: image.variantError,
          variants_generated_at: image.variantsGeneratedAt,
          variants: image.variants?.map((variant) => ({
            id: variant.id,
            variant: variant.variant,
            image_url: variant.url,
            width: variant.width,
            height: variant.height,
            format: variant.format,
          })),
        };
      }),
      attributes: product.attributes.map((attribute) => ({
        id: attribute.id,
        category_attribute_id: attribute.categoryAttributeId,
        category_attribute_name: attribute.categoryAttributeName,
        input_type: attribute.inputType,
        selected_option_id: attribute.selectedOptionId,
        selected_option_value: attribute.selectedOptionValue,
        selected_text: attribute.selectedText,
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
      variants: visibleVariants.map((variant) => ({
        id: variant.id,
        selections: (variant.selections ?? []).map((selection) => ({
          option_id: selection.optionId,
          value_id: selection.valueId,
        })),
        rank: variant.rank,
      })),
      inventory: visibleInventory.map((inventory) => ({
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
      })),
    };
  }),
  meta: {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
    total_pages: result.meta.totalPages,
    has_next_page: result.meta.hasNextPage,
    has_previous_page: result.meta.hasPreviousPage,
  },
  state_counts: result.stateCounts,
});
