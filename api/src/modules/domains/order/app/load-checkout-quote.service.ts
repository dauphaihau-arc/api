import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  CheckoutQuoteActorType,
  CheckoutQuoteEntity,
} from '../infra/persistence/entities/checkout-quote.entity';
import {
  CheckoutQuoteExpiredError,
  CheckoutQuoteNotFoundError,
} from './errors/order-app.error';
import type {
  CheckoutQuoteItemSummary,
  CheckoutQuoteShopSummary,
  ShippingAddressInput,
  ShopAdjustmentInput,
} from './order.types';

export interface LoadedCheckoutQuote {
  id: string;
  cartId: string;
  marketCode?: string;
  presentmentCurrency?: string;
  checkoutCurrency: string;
  subtotalMinor: number;
  shippingMinor: number;
  discountMinor: number;
  totalMinor: number;
  shippingAddress: ShippingAddressInput;
  shopAdjustments?: ShopAdjustmentInput[];
  shops: CheckoutQuoteShopSummary[];
  items: CheckoutQuoteItemSummary[];
}

@Injectable()
export class LoadCheckoutQuoteService {
  constructor(private readonly entityManager: EntityManager) {}

  async loadForUser(userId: string, quoteId: string): Promise<LoadedCheckoutQuote> {
    const quote = await this.entityManager.fork().getRepository(CheckoutQuoteEntity).findOne({
      id: quoteId,
      actorType: CheckoutQuoteActorType.USER,
      user: userId,
    });

    return this.toLoadedQuote(quote);
  }

  async loadForGuest(
    guestSessionId: string,
    quoteId: string
  ): Promise<LoadedCheckoutQuote> {
    const quote = await this.entityManager.fork().getRepository(CheckoutQuoteEntity).findOne({
      id: quoteId,
      actorType: CheckoutQuoteActorType.GUEST,
      guestSessionId,
    });

    return this.toLoadedQuote(quote);
  }

  private toLoadedQuote(quote: CheckoutQuoteEntity | null): LoadedCheckoutQuote {
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

function parsePricedShops(
  pricedShops: Record<string, unknown>[]
): CheckoutQuoteShopSummary[] {
  return (pricedShops as Array<{
    shop_id: string;
    shop_name: string;
    shop_slug: string;
    subtotal_minor: number;
    discount_minor: number;
    shipping_minor: number;
    total_minor: number;
    note?: string;
    promo_codes?: string[];
    origin_countries?: string[];
    items?: Array<{
      inventory_id: string;
      product_id: string;
      shop_id: string;
      shop_name: string;
      shop_slug: string;
      title: string;
      image_url?: string;
      quantity: number;
      source_currency?: string;
      unit_price_source_minor?: number;
      line_total_source_minor?: number;
      checkout_currency?: string;
      unit_price_checkout_minor?: number;
      line_total_checkout_minor?: number;
      unit_price_minor: number;
      original_amount_minor?: number;
      line_total_minor: number;
      currency: string;
      source_price_id?: string;
      source_type?: 'market_override' | 'base_native' | 'base_fx';
      market_code?: string;
      fx_rate?: string;
      fx_source?: string;
      fx_effective_at?: Date;
      fx_source_timestamp?: Date;
      variant_name?: string;
      variant_group_name?: string;
      variant_sub_group_name?: string;
    }>;
  }>).map((shop) => ({
    shopId: shop.shop_id,
    shopName: shop.shop_name,
    shopSlug: shop.shop_slug,
    subtotalMinor: shop.subtotal_minor,
    discountMinor: shop.discount_minor,
    shippingMinor: shop.shipping_minor,
    totalMinor: shop.total_minor,
    note: shop.note,
    promoCodes: shop.promo_codes ?? [],
    originCountries: shop.origin_countries ?? [],
    items: (shop.items ?? []).map((item) => ({
      inventoryId: item.inventory_id,
      productId: item.product_id,
      shopId: item.shop_id,
      shopName: item.shop_name,
      shopSlug: item.shop_slug,
      title: item.title,
      imageUrl: item.image_url,
      quantity: item.quantity,
      sourceCurrency: item.source_currency ?? item.currency,
      unitPriceSourceMinor: item.unit_price_source_minor ?? item.original_amount_minor ?? item.unit_price_minor,
      lineTotalSourceMinor: item.line_total_source_minor
        ?? (item.unit_price_source_minor ?? item.original_amount_minor ?? item.unit_price_minor) * item.quantity,
      checkoutCurrency: item.checkout_currency ?? item.currency,
      unitPriceCheckoutMinor: item.unit_price_checkout_minor ?? item.unit_price_minor,
      lineTotalCheckoutMinor: item.line_total_checkout_minor ?? item.line_total_minor,
      unitPriceMinor: item.unit_price_minor,
      originalAmountMinor: item.original_amount_minor,
      lineTotalMinor: item.line_total_minor,
      currency: item.currency,
      sourcePriceId: item.source_price_id,
      sourceType: item.source_type,
      marketCode: item.market_code,
      fxRate: item.fx_rate,
      fxSource: item.fx_source,
      fxEffectiveAt: item.fx_effective_at,
      fxSourceTimestamp: item.fx_source_timestamp,
      variantName: item.variant_name,
      variantGroupName: item.variant_group_name,
      variantSubGroupName: item.variant_sub_group_name,
    })),
  }));
}
