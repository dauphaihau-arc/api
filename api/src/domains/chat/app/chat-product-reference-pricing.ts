import type { ChatMessageSummary } from './chat.types';

export interface ChatProductReferenceDisplayPrice {
  productId: string;
  amountMinor: number;
  originalAmountMinor?: number;
  currency: string;
}

export function applyProductReferenceDisplayPrices(
  messages: ChatMessageSummary[],
  prices: Map<string, ChatProductReferenceDisplayPrice>,
): ChatMessageSummary[] {
  if (prices.size === 0) {
    return messages;
  }

  return messages.map((message) => ({
    ...message,
    metadata: applyProductReferenceDisplayPrice(message.metadata, prices),
  }));
}

function applyProductReferenceDisplayPrice(
  metadata: ChatMessageSummary['metadata'],
  prices: Map<string, ChatProductReferenceDisplayPrice>,
): ChatMessageSummary['metadata'] {
  if (!metadata) {
    return metadata;
  }

  const productReference = metadata.product_reference;

  if (!isRecord(productReference) || !isRecord(productReference.snapshot)) {
    return metadata;
  }

  const productId = productReference.product_id;

  if (typeof productId !== 'string') {
    return metadata;
  }

  const price = prices.get(productId);

  if (!price) {
    return metadata;
  }

  const {
    original_amount_minor: _storedOriginalAmountMinor,
    ...snapshotWithoutStoredOriginalAmountMinor
  } = productReference.snapshot;

  return {
    ...metadata,
    product_reference: {
      ...productReference,
      snapshot: {
        ...snapshotWithoutStoredOriginalAmountMinor,
        amount_minor: price.amountMinor,
        ...(price.originalAmountMinor !== undefined
          ? { original_amount_minor: price.originalAmountMinor }
          : {}),
        currency: price.currency,
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
