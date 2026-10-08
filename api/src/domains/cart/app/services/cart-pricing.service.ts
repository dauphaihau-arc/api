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
import { PromotionPricingService } from '../../../promotion/app/services/promotion-pricing.service';

@Injectable()
export class CartPricingService {
  constructor(
    private readonly promotionPricingService: PromotionPricingService,
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
      const productPublicIds = new Map(
        selectedItems.map((item) => [
          item.inventory.productId,
          item.inventory.productPublicId,
        ]),
      );

      throw new CheckoutShippingUnavailableError(
        shippingQuote.unavailable.map((product) => ({
          ...product,
          productPublicId: requirePublicId(
            productPublicIds.get(product.productId),
            'Product',
          ),
        })),
      );
    }

    const promoShops = await this.promotionPricingService.applyToCart({
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

    for (const promoShop of promoShops) {
      const shopPublicId = selectedItems.find((item) => item.inventory.shopId === promoShop.shopId)?.inventory.shopPublicId;
      if (!shopPublicId) throw new Error('Priced shop public id is required');
      const uniqueOriginCountries = await this.shippingQuoteService.listOriginCountries(
        promoShop.items.map((item) => item.productId),
      );
      const shopShipping = shippingQuote?.shops.find((entry) => entry.shopId === promoShop.shopId);
      const shippingCharge = fromMinorUnits(
        shopShipping?.charge.totalMinor ?? 0,
        checkoutCurrency,
      );
      const shippingDiscount = fromMinorUnits(promoShop.shippingDiscountMinor, checkoutCurrency);
      const shopShippingFee = Math.max(0, shippingCharge - shippingDiscount);
      const total = Math.max(0, promoShop.subtotal - promoShop.totalDiscount + shopShippingFee);

      subtotalPrice += promoShop.subtotal;
      totalDiscount += promoShop.totalDiscount;
      totalSaleDiscount += promoShop.saleDiscount;
      totalShippingFee += shopShippingFee;

      shops.push({
        shopId: promoShop.shopId,
        shopPublicId,
        shopName: promoShop.items[0]?.shopName ?? '',
        items: promoShop.items,
        subtotal: promoShop.subtotal,
        totalDiscount: promoShop.totalDiscount,
        saleDiscount: promoShop.saleDiscount,
        totalShippingFee: shopShippingFee,
        total,
        note: input.shopAdjustments?.find((entry) => entry.shopId === promoShop.shopId)?.note,
        promoOffers: promoShop.promoOffers,
        originCountries: uniqueOriginCountries,
        ...(shopShipping ? { shipping: shopShipping } : {}),
        shippingDiscountMinor: promoShop.shippingDiscountMinor,
        shippingDiscounts: promoShop.shippingDiscounts,
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

function requirePublicId(publicId: string | undefined, entityName: string): string {
  if (!publicId) {
    throw new Error(`${entityName} public id is required at the checkout boundary`);
  }

  return publicId;
}
