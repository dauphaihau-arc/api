import { Injectable } from '@nestjs/common';
import type { CheckoutQuoteEntity } from '../../infra/persistence/entities/checkout-quote.entity';
import {
  CheckoutQuoteExpiredError,
  CheckoutQuoteNotFoundError,
} from '../../../order/app/errors/order-app.error';
import { CheckoutQuoteRepository } from '../ports/checkout-quote.repository';
import { parsePricedShops } from './checkout-quote-priced-shops';
import type {
  CheckoutQuoteItemSummary,
  CheckoutQuoteShopSummary,
  ShippingAddressInput,
  ShopAdjustmentInput,
} from '../../../order/app/order.types';

export interface LoadedCheckoutQuote {
  id: string;
  cartId: string;
  marketCode?: string;
  presentmentCurrency?: string;
  checkoutCurrency: string;
  subtotalMinor: number;
  shippingMinor: number;
  discountMinor: number;
  saleDiscountMinor: number;
  totalMinor: number;
  shippingAddress: ShippingAddressInput;
  shopAdjustments?: ShopAdjustmentInput[];
  shops: CheckoutQuoteShopSummary[];
  items: CheckoutQuoteItemSummary[];
}

@Injectable()
export class LoadCheckoutQuoteService {
  constructor(
    private readonly checkoutQuoteRepository: CheckoutQuoteRepository,
  ) {}

  async loadForUser(userId: string, quoteId: string): Promise<LoadedCheckoutQuote> {
    const quote = await this.checkoutQuoteRepository.findForUser({
      userId,
      quoteId,
    });

    return this.toLoadedQuote(quote);
  }

  async loadForGuest(
    guestSessionId: string,
    quoteId: string,
  ): Promise<LoadedCheckoutQuote> {
    const quote = await this.checkoutQuoteRepository.findForGuest({
      guestSessionId,
      quoteId,
    });

    return this.toLoadedQuote(quote);
  }

  private async toLoadedQuote(quote: CheckoutQuoteEntity | null): Promise<LoadedCheckoutQuote> {
    if (!quote) {
      throw new CheckoutQuoteNotFoundError();
    }

    if (quote.expiresAt.getTime() < Date.now()) {
      throw new CheckoutQuoteExpiredError();
    }

    const shippingAddress = quote.shippingAddress as {
      full_name: string;
      address1: string;
      address2?: string;
      city: string;
      country: string;
      state: string;
      zip: string;
      phone: string;
    };
    const shopAdjustments = (quote.shopAdjustments as Array<{
      shop_id: string;
      promo_codes?: string[];
      note?: string;
    }> | undefined)?.map((adjustment) => ({
      shopId: adjustment.shop_id,
      promoCodes: adjustment.promo_codes,
      note: adjustment.note,
    }));
    const shops = parsePricedShops(quote.pricedShops);

    return {
      id: quote.id,
      cartId: quote.cartId,
      marketCode: quote.marketCode,
      presentmentCurrency: quote.presentmentCurrency,
      checkoutCurrency: quote.checkoutCurrency,
      subtotalMinor: quote.subtotalMinor,
      shippingMinor: quote.shippingMinor,
      discountMinor: quote.discountMinor,
      saleDiscountMinor: quote.saleDiscountMinor,
      totalMinor: quote.totalMinor,
      shippingAddress: {
        fullName: shippingAddress.full_name,
        address1: shippingAddress.address1,
        address2: shippingAddress.address2,
        city: shippingAddress.city,
        country: shippingAddress.country,
        state: shippingAddress.state,
        zip: shippingAddress.zip,
        phone: shippingAddress.phone,
      },
      shopAdjustments,
      shops,
      items: shops.flatMap((shop) => shop.items),
    };
  }
}
