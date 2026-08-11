import type { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ProductImageVariant } from '~/domains/product/domain/enums/product-image-variant.enum';

export const CHAT_MESSAGE_TYPES = {
  TEXT: 'text',
  PRODUCT_REFERENCE: 'product_reference',
} as const;

export type ChatMessageType = typeof CHAT_MESSAGE_TYPES[keyof typeof CHAT_MESSAGE_TYPES];

export type ChatProductReferenceMetadata = {
  product_reference: {
    product_id: string;
    snapshot: {
      title: string;
      shop_slug: string;
      product_slug: string;
      image_storage_key?: string;
      amount_minor?: number;
      original_amount_minor?: number;
      currency?: string;
    };
    current: {
      status: string;
      in_stock: boolean;
      stock?: number;
    };
  };
};

export function buildChatProductReferenceMetadata(product: ProductEntity): ChatProductReferenceMetadata {
  const primaryImage = product.images
    .getItems()
    .slice()
    .sort((left, right) => left.rank - right.rank)[0];
  const cardImage = primaryImage?.variants
    .getItems()
    .find(variant => variant.variant === ProductImageVariant.CARD_1X1);
  const activePrices = product.inventoryRecords
    .getItems()
    .flatMap(inventory => inventory.prices.getItems().filter(price => !price.activeTo));
  const sortedPrices = activePrices.slice().sort((left, right) => left.amountMinor - right.amountMinor);
  const lowestPrice = sortedPrices[0];
  const stock = product.inventoryRecords
    .getItems()
    .reduce((total, inventory) => total + inventory.stock, 0);

  return {
    product_reference: {
      product_id: product.id,
      snapshot: {
        title: product.title,
        shop_slug: product.shop.slug,
        product_slug: product.slug,
        ...(cardImage?.storageKey || primaryImage?.storageKey
          ? { image_storage_key: cardImage?.storageKey ?? primaryImage?.storageKey }
          : {}),
        ...(lowestPrice
          ? {
            amount_minor: lowestPrice.amountMinor,
            ...(lowestPrice.originalAmountMinor != null
              ? { original_amount_minor: lowestPrice.originalAmountMinor }
              : {}),
            currency: lowestPrice.currency,
          }
          : {}),
      },
      current: {
        status: product.state,
        in_stock: stock > 0,
        stock,
      },
    },
  };
}

export function getProductReferenceProductId(metadata?: Record<string, unknown>): string | undefined {
  const productReference = metadata?.product_reference;

  if (!productReference || typeof productReference !== 'object' || Array.isArray(productReference)) {
    return undefined;
  }
  
  const productId = (productReference as Record<string, unknown>).product_id;
  return typeof productId === 'string' ? productId : undefined;
}
