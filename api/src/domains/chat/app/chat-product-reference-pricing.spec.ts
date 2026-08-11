import { applyProductReferenceDisplayPrices } from './chat-product-reference-pricing';
import type { ChatMessageSummary } from './chat.types';

describe('applyProductReferenceDisplayPrices', () => {
  it('overlays product reference snapshot money with resolved display pricing', () => {
    const createdAt = new Date('2026-08-11T00:00:00.000Z');
    const messages: ChatMessageSummary[] = [
      {
        id: 'message-1',
        conversationId: 'conversation-1',
        senderUserId: 'buyer-1',
        body: 'Salomon XT-6',
        messageType: 'product_reference',
        metadata: {
          product_reference: {
            product_id: 'product-1',
            snapshot: {
              title: 'Salomon XT-6',
              shop_slug: 'terrain-index',
              product_slug: 'salomon-xt-6',
              amount_minor: 20000,
              original_amount_minor: 24000,
              currency: 'USD',
            },
            current: {
              status: 'active',
              in_stock: true,
            },
          },
        },
        createdAt,
        updatedAt: createdAt,
      },
    ];

    const [message] = applyProductReferenceDisplayPrices(
      messages,
      new Map([
        [
          'product-1',
          {
            productId: 'product-1',
            amountMinor: 1164000,
            currency: 'PHP',
          },
        ],
      ]),
    );

    expect(message.metadata).toEqual({
      product_reference: {
        product_id: 'product-1',
        snapshot: {
          title: 'Salomon XT-6',
          shop_slug: 'terrain-index',
          product_slug: 'salomon-xt-6',
          amount_minor: 1164000,
          currency: 'PHP',
        },
        current: {
          status: 'active',
          in_stock: true,
        },
      },
    });
    expect(messages[0]?.metadata).toEqual({
      product_reference: {
        product_id: 'product-1',
        snapshot: {
          title: 'Salomon XT-6',
          shop_slug: 'terrain-index',
          product_slug: 'salomon-xt-6',
          amount_minor: 20000,
          original_amount_minor: 24000,
          currency: 'USD',
        },
        current: {
          status: 'active',
          in_stock: true,
        },
      },
    });
  });
});
