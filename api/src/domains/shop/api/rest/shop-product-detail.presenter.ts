import type { ProductDraftSummary } from '~/domains/product/app/product.types';
import type { ShopProductDetailResponse } from './shop-product-detail.response';

function buildImageUrlsByStorageKey(product: ProductDraftSummary): Map<string, string> {
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

export const toShopProductDetailResponse = (
  product: ProductDraftSummary,
): ShopProductDetailResponse => {
  const imageUrlsByStorageKey = buildImageUrlsByStorageKey(product);
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
    category: product.categoryId
      ? {
        id: product.categoryId,
        name: product.categoryName ?? '',
      }
      : undefined,
    title: product.title,
    slug: product.slug,
    description: product.description,
    state: product.state,
    product_version: product.productVersion ?? 1,
    published_at: product.publishedAt,
    removed_at: product.removedAt,
    who_made: product.whoMade,
    is_digital: product.isDigital,
    non_taxable: product.nonTaxable,
    tags: product.tags ?? [],
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url ?? '',
      rank: image.rank,
      variant_status: image.variantStatus,
      variant_error: image.variantError,
      variants_generated_at: image.variantsGeneratedAt,
      variants: image.variants?.map((variant) => ({
        id: variant.id,
        variant: variant.variant,
        url: variant.url ?? '',
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
      image_url: variant.imageStorageKey
        ? imageUrlsByStorageKey.get(variant.imageStorageKey)
        : undefined,
      rank: variant.rank,
      lifecycle_state: variant.lifecycleState,
      removed_at: variant.removedAt,
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
      lifecycle_state: inventory.lifecycleState,
      removed_at: inventory.removedAt,
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
        id: product.shipping.id,
        origin_country: product.shipping.originCountry,
        origin_zip: product.shipping.originZip,
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
