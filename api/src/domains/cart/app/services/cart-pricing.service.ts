import { Injectable } from '@nestjs/common';
import { fromMinorUnits } from '../../../../platform/money/money';
import type { CartSnapshot } from '../cart.types';
import type {
  PricedCartSummary,
  ShippingAddressInput,
  ShopAdjustmentInput,
} from '../../../order/app/order.types';
import { ShippingQuoteService } from '../../../shipping/app/services/shipping-quote.service';
import { CheckoutShippingUnavailableError } from '../../../order/app/errors/order-app.error';
import { CouponPricingService } from '../../../coupon/app/services/coupon-pricing.service';

@Injectable()
export class CartPricingService {
  constructor(
    private readonly couponPricingService: CouponPricingService,
    private readonly shippingQuoteService: ShippingQuoteService,
  ) {}

  async buildPricedCartSummary(input: {
    userId?: string;
    cart: CartSnapshot;
    shopAdjustments?: ShopAdjustmentInput[];
    shippingAddress?: ShippingAddressInput;
    validatePromoCodes?: boolean;
    anchorAt?: Date;
  }): Promise<PricedCartSummary> {
    const selectedItems = input.cart.items.filter((item) => item.isSelectOrder);
    const checkoutCurrency = selectedItems[0]?.inventory.currency ?? 'USD';

    const shippingQuote = input.shippingAddress
      ? await this.shippingQuoteService.quoteForCheckout({
        units: selectedItems.map((item) => ({
          shopId: item.inventory.shopId,
          productId: item.inventory.productId,
          inventoryId: item.inventory.inventoryId,
          quantity: item.quantity,
        })),
        destination: { countryCode: input.shippingAddress.country },
        anchorAt: input.anchorAt ?? new Date(),
        checkoutCurrency,
      })
      : undefined;

    if (shippingQuote && shippingQuote.unavailable.length > 0) {
      throw new CheckoutShippingUnavailableError(shippingQuote.unavailable);
    }

    const couponShops = await this.couponPricingService.applyToCart({
      userId: input.userId,
      cart: input.cart,
      shopAdjustments: input.shopAdjustments,
      validatePromoCodes: input.validatePromoCodes,
      checkoutCurrency,
      shippingShops: shippingQuote?.shops,
    });

    const shops: PricedCartSummary['shops'] = [];
    let subtotalPrice = 0;
    let totalDiscount = 0;
    let totalSaleDiscount = 0;
    let totalShippingFee = 0;

    for (const couponShop of couponShops) {
      const uniqueOriginCountries = await this.shippingQuoteService.listOriginCountries(
        couponShop.items.map((item) => item.productId),
      );
      const shopShipping = shippingQuote?.shops.find((entry) => entry.shopId === couponShop.shopId);
      const shippingCharge = fromMinorUnits(
        shopShipping?.charge.totalMinor ?? 0,
        checkoutCurrency,
      );
      const shippingDiscount = fromMinorUnits(couponShop.shippingDiscountMinor, checkoutCurrency);
      const shopShippingFee = Math.max(0, shippingCharge - shippingDiscount);
      const total = Math.max(0, couponShop.subtotal - couponShop.totalDiscount + shopShippingFee);

      subtotalPrice += couponShop.subtotal;
      totalDiscount += couponShop.totalDiscount;
      totalSaleDiscount += couponShop.saleDiscount;
      totalShippingFee += shopShippingFee;

      shops.push({
        shopId: couponShop.shopId,
        shopName: couponShop.items[0]?.shopName ?? '',
        items: couponShop.items,
        subtotal: couponShop.subtotal,
        totalDiscount: couponShop.totalDiscount,
        saleDiscount: couponShop.saleDiscount,
        totalShippingFee: shopShippingFee,
        total,
        note: input.shopAdjustments?.find((entry) => entry.shopId === couponShop.shopId)?.note,
        promoOffers: couponShop.promoOffers,
        originCountries: uniqueOriginCountries,
        ...(shopShipping ? { shipping: shopShipping } : {}),
        shippingDiscountMinor: couponShop.shippingDiscountMinor,
        shippingDiscounts: couponShop.shippingDiscounts,
      });
    }

    return {
      cart: input.cart,
      shops,
      currency: checkoutCurrency,
      subtotalPrice,
      totalDiscount,
      saleDiscount: totalSaleDiscount,
      subtotalAfterDiscount: Math.max(0, subtotalPrice - totalDiscount),
      totalShippingFee,
      totalPrice: Math.max(0, subtotalPrice - totalDiscount + totalShippingFee),
      totalSelectedQuantity: selectedItems.reduce((sum, item) => sum + item.quantity, 0),
      totalQuantity: input.cart.items.reduce((sum, item) => sum + item.quantity, 0),
      ...(shippingQuote ? { shippingAnchorAt: shippingQuote.anchorAt } : {}),
    };
  }
}
