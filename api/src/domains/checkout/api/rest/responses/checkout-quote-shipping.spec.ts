import { ConflictException } from '@nestjs/common';
import type { CheckoutQuoteResult } from '../../../../order/app/order.types';
import { CheckoutShippingUnavailableError } from '../../../../order/app/errors/order-app.error';
import { mapCheckoutAppErrorToHttpException } from '../errors/checkout-http-error-mapper';
import { toCheckoutQuoteResponse } from './checkout.response';

const ANCHOR_AT = new Date('2026-09-22T10:15:00.000Z');

function buildQuoteResult(): CheckoutQuoteResult {
  return {
    quoteId: 'quote-1',
    checkoutCurrency: 'USD',
    subtotalMinor: 3000,
    shippingMinor: 1150,
    discountMinor: 0,
    saleDiscountMinor: 0,
    totalMinor: 4150,
    shippingAnchorAt: ANCHOR_AT,
    expiresAt: new Date('2026-09-22T10:45:00.000Z'),
    items: [],
    shops: [
      {
        shopId: 'shop-1',
        shopPublicId: 'shop_public1',
        shopName: 'Shop 1',
        shopSlug: 'shop-1',
        subtotalMinor: 3000,
        discountMinor: 0,
        saleDiscountMinor: 0,
        shippingMinor: 1150,
        shippingDiscountMinor: 0,
        totalMinor: 4150,
        promoCodes: [],
        originCountries: ['US'],
        shippingDiscounts: [],
        shipping: {
          shopId: 'shop-1',
          currency: 'USD',
          charge: {
            currency: 'USD',
            quantity: 2,
            baseUnit: { productId: 'product-1', inventoryId: 'inventory-1', oneItemFeeMinor: 900 },
            baseItemFeeMinor: 900,
            baseItemTotalMinor: 900,
            additionalItemsQuantity: 1,
            additionalComponents: [
              {
                productId: 'product-1',
                inventoryId: 'inventory-1',
                quantity: 1,
                additionalItemFeeMinor: 250,
              },
            ],
            additionalItemFeeMinorTotal: 250,
            totalMinor: 1150,
          },
          estimate: {
            processingTimeMinDays: 1,
            processingTimeMaxDays: 3,
            deliveryTimeMinDays: 3,
            deliveryTimeMaxDays: 5,
            combinedMinDays: 4,
            combinedMaxDays: 8,
            anchorAt: ANCHOR_AT,
            earliestDeliveryDate: new Date('2026-09-26T00:00:00.000Z'),
            latestDeliveryDate: new Date('2026-09-30T00:00:00.000Z'),
          },
          units: [],
        },
        items: [{ productId: 'product-1', productPublicId: 'prod_public1' } as never],
      },
    ],
  };
}

describe('checkout quote shipping transport', () => {
  it('exposes public promotion and product discount references without parallel fields', () => {
    const result = buildQuoteResult();
    result.shops[0]!.shippingDiscounts = [{
      promotionId: 'promotion-internal',
      promotionPublicId: 'prm_public1',
      code: 'FREE',
      benefitType: 'free_shipping',
      productScope: 'specific' as never,
      productIds: ['product-1'],
      productPublicIds: ['prod_public1'],
      minOrderType: 'none' as never,
      minOrderValue: 0,
      minPurchaseQuantity: 0,
      maxRedemptions: 0,
      maxRedemptionsPerBuyer: 0,
      redemptionCount: 0,
      waivedMinor: 1150,
      currency: 'USD',
    }];
    const discount = toCheckoutQuoteResponse(result).shops[0]!.shipping_discounts[0]!;
    expect(discount.promotion_id).toBe('prm_public1');
    expect(discount.product_ids).toEqual(['prod_public1']);
    expect(discount).not.toHaveProperty('promotion_public_id');
    expect(discount).not.toHaveProperty('product_public_ids');
  });

  it('exposes each shop shipping charge and seller estimate with the quote anchor', () => {
    const response = toCheckoutQuoteResponse(buildQuoteResult());

    expect(response.shipping_anchor_at).toEqual(ANCHOR_AT);
    expect(response.shops).toEqual([
      expect.objectContaining({
        shop_id: 'shop_public1',
        shipping_minor: 1150,
        shipping_discount_minor: 0,
        shipping: {
          shop_id: 'shop_public1',
          currency: 'USD',
          charge: {
            currency: 'USD',
            quantity: 2,
            base_unit: {
              product_id: 'prod_public1',
              inventory_id: 'inventory-1',
              one_item_fee_minor: 900,
            },
            base_item_fee_minor: 900,
            base_item_total_minor: 900,
            additional_items_quantity: 1,
            additional_components: [
              {
                product_id: 'prod_public1',
                inventory_id: 'inventory-1',
                quantity: 1,
                additional_item_fee_minor: 250,
              },
            ],
            additional_item_fee_minor_total: 250,
            total_minor: 1150,
          },
          estimate: {
            processing_time_min_days: 1,
            processing_time_max_days: 3,
            delivery_time_min_days: 3,
            delivery_time_max_days: 5,
            combined_min_days: 4,
            combined_max_days: 8,
            anchor_at: ANCHOR_AT.toISOString(),
            earliest_delivery_date: '2026-09-26T00:00:00.000Z',
            latest_delivery_date: '2026-09-30T00:00:00.000Z',
          },
          units: [],
        },
      }),
    ]);
  });

  it('maps an undeliverable Product to an actionable 409 listing the reasons', () => {
    const exception = mapCheckoutAppErrorToHttpException(
      new CheckoutShippingUnavailableError([
        {
          productId: 'product-1',
          productPublicId: 'prod_public1',
          inventoryId: 'inventory-1',
          quantity: 2,
          reason: 'unsupported_destination',
          readinessIssues: [],
        },
      ]),
    );

    expect(exception).toBeInstanceOf(ConflictException);
    expect(exception.getResponse()).toMatchObject({
      code: 'CHECKOUT_SHIPPING_UNAVAILABLE',
      details: {
        products: [
          {
            product_id: 'prod_public1',
            inventory_id: 'inventory-1',
            quantity: 2,
            reason: 'unsupported_destination',
            readiness_issues: [],
          },
        ],
      },
    });
  });
});
