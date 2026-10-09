import type { CheckoutQuoteResult, ShopOrderSummary } from '../../../app/order.types';
import { toCheckoutQuoteResponse } from '../../../../checkout/api/rest/responses/checkout.response';
import { toShopOrderSummaryResponse } from './order.response';
import { toCheckoutOrderListResponse } from '../../../../checkout/api/rest/responses/checkout.response';

const SHIPPING_SNAPSHOT = {
  shopId: 'shop-1',
  currency: 'USD',
  charge: {
    currency: 'USD',
    quantity: 2,
    baseUnit: {
      productId: 'product-1',
      inventoryId: 'inventory-1',
      oneItemFeeMinor: 900,
    },
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
    anchorAt: new Date('2026-09-22T10:00:00.000Z'),
    earliestDeliveryDate: new Date('2026-09-26T00:00:00.000Z'),
    latestDeliveryDate: new Date('2026-09-30T00:00:00.000Z'),
  },
  units: [
    {
      productId: 'product-1',
      inventoryId: 'inventory-1',
      quantity: 2,
      profileId: 'profile-1',
      profileVersion: 3,
      profileShopId: 'shop-1',
      rateId: 'rate-1',
      rateDestinationScope: 'country' as never,
      rateDestinationCountry: 'US',
      rateDestinationRegion: undefined,
      currency: 'USD',
      oneItemFeeMinor: 900,
      additionalItemFeeMinor: 250,
      processingTimeMinDays: 1,
      processingTimeMaxDays: 3,
      deliveryTimeMinDays: 3,
      deliveryTimeMaxDays: 5,
    },
  ],
};

function buildOrderSummary(): ShopOrderSummary {
  return {
    id: 'order-1',
    publicId: 'ord_1',
    orderNumber: 'ORD-1',
    shopId: 'shop-1',
    shopPublicId: 'shop_1',
    shopName: 'Shop 1',
    shopSlug: 'shop-1',
    customerEmail: 'buyer@example.com',
    customerFullName: 'Buyer',
    currency: 'USD',
    paymentType: 'cash',
    status: 'pending',
    products: [{ productId: 'product-1', productPublicId: 'prod_public1' } as never],
    promoCodes: ['FREESHIP'],
    fulfillment: {
      status: 'unfulfilled' as never,
      requiresReconciliation: false,
      progress: {
        ordered: 0,
        prepared: 0,
        dispatched: 0,
        delivered: 0,
        canceled: 0,
        outstanding: 0,
      },
      groups: [],
      legacyShipping: {
        status: 'pre_transit',
        updatedAt: new Date('2026-09-22T10:00:00.000Z'),
        toCountry: 'US',
        fromCountries: ['US'],
        estimatedDelivery: new Date('2026-09-30T00:00:00.000Z'),
      },
    },
    subtotal: 18,
    subtotalMinor: 1800,
    totalShippingFee: 11.5,
    shippingMinor: 1150,
    totalDiscount: 0,
    discountMinor: 0,
    saleDiscountMinor: 0,
    total: 29.5,
    totalMinor: 2950,
    shippingQuote: {
      shipping: SHIPPING_SNAPSHOT as never,
      shippingDiscountMinor: 0,
      shippingDiscounts: [],
    },
    createdAt: new Date('2026-09-22T10:00:00.000Z'),
  };
}

describe('order shipping response', () => {
  it('exposes the accepted shipping snapshot beside shipping_minor in the quote shop shape', () => {
    const quoteResponse = toCheckoutQuoteResponse({
      quoteId: 'quote-1',
      checkoutCurrency: 'USD',
      subtotalMinor: 1800,
      shippingMinor: 1150,
      discountMinor: 0,
      saleDiscountMinor: 0,
      totalMinor: 2950,
      expiresAt: new Date('2026-09-22T10:30:00.000Z'),
      items: [],
      shops: [
        {
          shopId: 'shop-1',
          shopPublicId: 'shop_1',
          shopName: 'Shop 1',
          shopSlug: 'shop-1',
          subtotalMinor: 1800,
          discountMinor: 0,
          saleDiscountMinor: 0,
          shippingMinor: 1150,
          shippingDiscountMinor: 0,
          totalMinor: 2950,
          promoCodes: ['FREESHIP'],
          originCountries: ['US'],
          shippingDiscounts: [],
          shipping: SHIPPING_SNAPSHOT as never,
          items: [{ productId: 'product-1', productPublicId: 'prod_public1' } as never],
        },
      ],
    } as CheckoutQuoteResult);

    const orderResponse = toShopOrderSummaryResponse(buildOrderSummary());

    expect(orderResponse.shipping_minor).toBe(1150);
    expect(orderResponse.shipping).toEqual(quoteResponse.shops[0]?.shipping);
    expect(orderResponse.shipping_discount_minor).toBe(0);
    expect(orderResponse.shipping_discounts).toEqual([]);
    expect(orderResponse.shipping?.estimate).toEqual({
      processing_time_min_days: 1,
      processing_time_max_days: 3,
      delivery_time_min_days: 3,
      delivery_time_max_days: 5,
      combined_min_days: 4,
      combined_max_days: 8,
      anchor_at: '2026-09-22T10:00:00.000Z',
      earliest_delivery_date: '2026-09-26T00:00:00.000Z',
      latest_delivery_date: '2026-09-30T00:00:00.000Z',
    });
    expect(orderResponse.shipping?.charge.base_unit).toEqual({
      product_id: 'prod_public1',
      inventory_id: 'inventory-1',
      one_item_fee_minor: 900,
    });
    expect(orderResponse.shipping?.units[0]).toEqual(expect.objectContaining({
      profile_id: 'profile-1',
      profile_version: 3,
      rate_id: 'rate-1',
    }));
  });

  it('exposes the accepted shipping snapshot on the guest order list shape', () => {
    const response = toCheckoutOrderListResponse({
      orderShops: [buildOrderSummary()],
    });

    expect(response.order_shops[0]?.shipping_minor).toBe(1150);
    expect(response.order_shops[0]?.shipping).toEqual(
      toShopOrderSummaryResponse(buildOrderSummary()).shipping,
    );
    expect(response.order_shops[0]?.shipping_discounts).toEqual([]);
  });

  it('omits the shipping snapshot for an Order with no accepted shipping facts', () => {
    const response = toShopOrderSummaryResponse({
      ...buildOrderSummary(),
      shippingQuote: undefined,
    });

    expect(response.shipping).toBeUndefined();
    expect(response.shipping_minor).toBe(1150);
  });
});
