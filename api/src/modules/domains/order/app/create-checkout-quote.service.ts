import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable } from '@nestjs/common';
import { toMinorUnits } from '~/common/utils/money';
import { MARKETPLACE_CURRENCIES } from '~/config/marketplace.config';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import type { CartSnapshot } from '~/modules/domains/cart/app/cart.types';
import { CouponPricingService } from '~/modules/domains/coupon/app/coupon-pricing.service';
import { StorefrontMarketContextService } from '~/modules/domains/product/app/services/storefront-market-context.service';
import { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/entities/product-inventory.entity';
import {
  CheckoutQuoteActorType,
  CheckoutQuoteEntity
} from '../infra/persistence/entities/checkout-quote.entity';
import { CheckoutQuoteItemEntity } from '../infra/persistence/entities/checkout-quote-item.entity';
import { CheckoutQuoteNoItemsError } from './errors/order-app.error';
import type {
  CheckoutQuoteResult,
  CheckoutQuoteShopSummary,
  PricedCartItem,
  ShippingAddressInput,
  ShopAdjustmentInput
} from './order.types';

const QUOTE_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class CreateCheckoutQuoteService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly couponPricingService: CouponPricingService,
    private readonly storefrontMarketContextService: StorefrontMarketContextService
  ) {}

  async createFromCart(input: {
    actor:
      | { type: 'user'; userId: string }
      | { type: 'guest'; guestSessionId: string };
    cart: CartSnapshot;
    shippingAddress: ShippingAddressInput;
    presentmentCurrency?: string;
    shopAdjustments?: ShopAdjustmentInput[];
  }): Promise<CheckoutQuoteResult> {
    const storefrontMarketContext =
      await this.storefrontMarketContextService.resolveCurrentRequest();
    const presentmentCurrency = normalizePresentmentCurrency(
      input.presentmentCurrency ?? storefrontMarketContext?.currency
    );
    const pricedCart = await this.couponPricingService.priceCart({
      userId: input.actor.type === 'user' ? input.actor.userId : undefined,
      cart: input.cart,
      shippingAddress: input.shippingAddress,
      shopAdjustments: input.shopAdjustments,
    });

    const allItems = pricedCart.shops.flatMap((shop) => shop.items);

    if (allItems.length === 0) {
      throw new CheckoutQuoteNoItemsError();
    }

    const checkoutCurrency = resolveCheckoutCurrency(allItems);

    const entityManager = this.entityManager.fork();
    const quoteRepository = entityManager.getRepository(CheckoutQuoteEntity);
    const quoteItemRepository = entityManager.getRepository(CheckoutQuoteItemEntity);
    const expiresAt = new Date(Date.now() + QUOTE_TTL_MS);

    const quote = quoteRepository.create({
      actorType: input.actor.type === 'user'
        ? CheckoutQuoteActorType.USER
        : CheckoutQuoteActorType.GUEST,
      ...(input.actor.type === 'user'
        ? { user: entityManager.getReference(CurrentUserEntity, input.actor.userId) }
        : { guestSessionId: input.actor.guestSessionId }),
      cartId: input.cart.id,
      ...(presentmentCurrency ? { presentmentCurrency } : {}),
      ...(storefrontMarketContext?.marketCode
        ? { marketCode: storefrontMarketContext.marketCode }
        : {}),
      checkoutCurrency,
      subtotalMinor: toMinorUnits(pricedCart.subtotalPrice, checkoutCurrency),
      shippingMinor: toMinorUnits(pricedCart.totalShippingFee, checkoutCurrency),
      discountMinor: toMinorUnits(pricedCart.totalDiscount, checkoutCurrency),
      totalMinor: toMinorUnits(pricedCart.totalPrice, checkoutCurrency),
      shippingAddress: {
        full_name: input.shippingAddress.fullName,
        address1: input.shippingAddress.address1,
        address2: input.shippingAddress.address2,
        city: input.shippingAddress.city,
        country: input.shippingAddress.country,
        state: input.shippingAddress.state,
        zip: input.shippingAddress.zip,
        phone: input.shippingAddress.phone,
      },
      ...(input.shopAdjustments
        ? {
          shopAdjustments: input.shopAdjustments.map((adjustment) => ({
            shop_id: adjustment.shopId,
            promo_codes: adjustment.promoCodes ?? [],
            note: adjustment.note,
          })),
        }
        : {}),
      pricedShops: [],
      expiresAt,
    });
    entityManager.persist(quote);

    const items = allItems.map((item) => {
      const unitPriceCheckoutMinor = item.unitPriceMinor ??
        toMinorUnits(item.effectiveUnitPrice, checkoutCurrency);
      const sourceCurrency = item.sourceCurrency ?? checkoutCurrency;
      const unitPriceSourceMinor = item.sourceUnitPriceMinor ??
        unitPriceCheckoutMinor;
      const originalAmountMinor = item.originalAmountMinor != null
        ? item.originalAmountMinor
        : item.effectiveUnitPrice < item.price
          ? toMinorUnits(item.price, checkoutCurrency)
          : undefined;
      const quoteItem = quoteItemRepository.create({
        quote,
        inventory: entityManager.getReference(ProductInventoryEntity, item.inventoryId),
        title: item.title,
        imageUrl: item.imageUrl,
        variantGroupName: item.variantGroupName,
        variantSubGroupName: item.variantSubGroupName,
        variantName: item.variantName,
        quantity: item.quantity,
        sourceCurrency,
        unitPriceSourceMinor,
        lineTotalSourceMinor: unitPriceSourceMinor * item.quantity,
        checkoutCurrency,
        unitPriceCheckoutMinor,
        lineTotalCheckoutMinor: unitPriceCheckoutMinor * item.quantity,
        unitPriceMinor: unitPriceCheckoutMinor,
        ...(originalAmountMinor !== undefined ? { originalAmountMinor } : {}),
        lineTotalMinor: unitPriceCheckoutMinor * item.quantity,
        currency: checkoutCurrency,
        sourcePriceId: item.sourcePriceId,
        sourceType: item.sourceType,
        marketCode: item.marketCode,
        fxRate: item.fxRate,
        fxSource: item.fxSource,
        fxEffectiveAt: item.fxEffectiveAt,
        fxSourceTimestamp: item.fxSourceTimestamp,
      });
      entityManager.persist(quoteItem);

      return {
        inventoryId: item.inventoryId,
        productId: item.productId,
        shopId: item.shopId,
        shopName: item.shopName,
        shopSlug: item.shopSlug,
        title: item.title,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        sourceCurrency: quoteItem.sourceCurrency,
        unitPriceSourceMinor: quoteItem.unitPriceSourceMinor,
        lineTotalSourceMinor: quoteItem.lineTotalSourceMinor,
        checkoutCurrency: quoteItem.checkoutCurrency,
        unitPriceCheckoutMinor: quoteItem.unitPriceCheckoutMinor,
        lineTotalCheckoutMinor: quoteItem.lineTotalCheckoutMinor,
        unitPriceMinor: quoteItem.unitPriceMinor,
        originalAmountMinor: quoteItem.originalAmountMinor,
        lineTotalMinor: quoteItem.lineTotalMinor,
        currency: quoteItem.currency,
        sourcePriceId: quoteItem.sourcePriceId,
        sourceType: quoteItem.sourceType,
        marketCode: quoteItem.marketCode,
        fxRate: quoteItem.fxRate,
        fxSource: quoteItem.fxSource,
        fxEffectiveAt: quoteItem.fxEffectiveAt,
        fxSourceTimestamp: quoteItem.fxSourceTimestamp,
        variantName: item.variantName,
        variantGroupName: item.variantGroupName,
        variantSubGroupName: item.variantSubGroupName,
      };
    });

    const shops: CheckoutQuoteShopSummary[] = pricedCart.shops.map((shop) => ({
      shopId: shop.shopId,
      shopName: shop.shopName,
      shopSlug: shop.items[0]?.shopSlug ?? '',
      subtotalMinor: toMinorUnits(shop.subtotal, checkoutCurrency),
      discountMinor: toMinorUnits(shop.totalDiscount, checkoutCurrency),
      shippingMinor: toMinorUnits(shop.totalShippingFee, checkoutCurrency),
      totalMinor: toMinorUnits(shop.total, checkoutCurrency),
      note: shop.note,
      promoCodes: shop.promoCoupons.map((coupon) => coupon.code),
      originCountries: shop.originCountries,
      items: items.filter((item) => item.shopId === shop.shopId),
    }));

    quote.pricedShops = shops.map((shop) => ({
      shop_id: shop.shopId,
      shop_name: shop.shopName,
      shop_slug: shop.shopSlug,
      subtotal_minor: shop.subtotalMinor,
      discount_minor: shop.discountMinor,
      shipping_minor: shop.shippingMinor,
      total_minor: shop.totalMinor,
      note: shop.note,
      promo_codes: shop.promoCodes,
      origin_countries: shop.originCountries,
      items: shop.items.map((item) => ({
        inventory_id: item.inventoryId,
        product_id: item.productId,
        shop_id: item.shopId,
        shop_name: item.shopName,
        shop_slug: item.shopSlug,
        title: item.title,
        image_url: item.imageUrl,
        quantity: item.quantity,
        source_currency: item.sourceCurrency,
        unit_price_source_minor: item.unitPriceSourceMinor,
        line_total_source_minor: item.lineTotalSourceMinor,
        checkout_currency: item.checkoutCurrency,
        unit_price_checkout_minor: item.unitPriceCheckoutMinor,
        line_total_checkout_minor: item.lineTotalCheckoutMinor,
        unit_price_minor: item.unitPriceMinor,
        original_amount_minor: item.originalAmountMinor,
        line_total_minor: item.lineTotalMinor,
        currency: item.currency,
        source_price_id: item.sourcePriceId,
        source_type: item.sourceType,
        market_code: item.marketCode,
        fx_rate: item.fxRate,
        fx_source: item.fxSource,
        fx_effective_at: item.fxEffectiveAt,
        fx_source_timestamp: item.fxSourceTimestamp,
        variant_name: item.variantName,
        variant_group_name: item.variantGroupName,
        variant_sub_group_name: item.variantSubGroupName,
      })),
    }));

    await entityManager.flush();

    return {
      quoteId: quote.id,
      presentmentCurrency,
      checkoutCurrency: quote.checkoutCurrency,
      subtotalMinor: quote.subtotalMinor,
      shippingMinor: quote.shippingMinor,
      discountMinor: quote.discountMinor,
      totalMinor: quote.totalMinor,
      expiresAt,
      shops,
      items,
    };
  }
}

function normalizePresentmentCurrency(currency?: string): string | undefined {
  if (!currency) {
    return undefined;
  }

  return MARKETPLACE_CURRENCIES.includes(currency as (typeof MARKETPLACE_CURRENCIES)[number])
    ? currency
    : undefined;
}

function resolveCheckoutCurrency(
  items: PricedCartItem[]
): string {
  const currencies = [...new Set(items.map(item => item.currency).filter(Boolean))];

  if (currencies.length !== 1) {
    throw new BadRequestException('Selected items must use a single checkout currency');
  }

  const [currency] = currencies;

  if (!currency || !MARKETPLACE_CURRENCIES.includes(currency as (typeof MARKETPLACE_CURRENCIES)[number])) {
    throw new BadRequestException('Unsupported checkout currency');
  }

  return currency;
}
