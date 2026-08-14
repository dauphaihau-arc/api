import { createHash } from 'node:crypto';
import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable } from '@nestjs/common';
import ms from 'ms';
import { appJobDeduplicationKey } from '../../../../platform/jobs/app-job-deduplication';
import { appJobName } from '../../../../platform/jobs/app-job.names';
import { toMinorUnits } from '../../../../platform/utils/money';
import { MARKETPLACE_CURRENCIES } from '../../../../platform/config/marketplace.config';
import { CurrentUserEntity } from '../../../auth/infra/persistence/entities/current-user.entity';
import type { CartSnapshot } from '../../../cart/app/cart.types';
import { CouponPricingService } from '../../../coupon/app/services/coupon-pricing.service';
import { StorefrontMarketContextService } from '../../../product/app/services/storefront-market-context.service';
import { ProductInventoryEntity } from '../../../product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { JobDispatcher } from '../../../../integrations/queue/app/ports/job-dispatcher';
import {
  CheckoutQuoteActorType,
  CheckoutQuoteEntity,
} from '../../infra/persistence/entities/checkout-quote.entity';
import { CheckoutQuoteItemEntity } from '../../infra/persistence/entities/checkout-quote-item.entity';
import {
  CheckoutStockReservationEntity,
  CheckoutStockReservationStatus,
} from '../../infra/persistence/entities/checkout-stock-reservation.entity';
import { CheckoutStockReservationPort } from '../ports/checkout-stock-reservation.port';
import { CheckoutQuoteNoItemsError } from '../../../order/app/errors/order-app.error';
import type {
  CheckoutQuoteResult,
  CheckoutQuoteShopSummary,
  PricedCartItem,
  ShippingAddressInput,
  ShopAdjustmentInput,
} from '../../../order/app/order.types';
import { OrderTotalPolicyService } from '../../../order/app/services/order-total-policy.service';

const QUOTE_TTL_MS = ms('30m');

@Injectable()
export class CreateCheckoutQuoteService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly couponPricingService: CouponPricingService,
    private readonly storefrontMarketContextService: StorefrontMarketContextService,
    private readonly orderTotalPolicyService: OrderTotalPolicyService,
    private readonly checkoutStockReservationService: CheckoutStockReservationPort,
    private readonly jobDispatcher: JobDispatcher,
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
    const storefrontMarketContext = await this.storefrontMarketContextService.resolveCurrentRequest();

    const presentmentCurrency = normalizePresentmentCurrency(
      input.presentmentCurrency ?? storefrontMarketContext?.currency,
    );

    const pricedCartSummary = await this.couponPricingService.buildPricedCartSummary({
      userId: input.actor.type === 'user' ? input.actor.userId : undefined,
      cart: input.cart,
      shippingAddress: input.shippingAddress,
      shopAdjustments: input.shopAdjustments,
    });

    const allItems = pricedCartSummary.shops.flatMap((shop) => shop.items);

    if (allItems.length === 0) {
      throw new CheckoutQuoteNoItemsError();
    }

    const checkoutCurrency = resolveCheckoutCurrency(allItems);

    const expiresAt = new Date(Date.now() + QUOTE_TTL_MS);
    const subtotalMinor = toMinorUnits(pricedCartSummary.subtotalPrice, checkoutCurrency);
    const shippingMinor = toMinorUnits(pricedCartSummary.totalShippingFee, checkoutCurrency);
    const discountMinor = toMinorUnits(pricedCartSummary.totalDiscount, checkoutCurrency);
    const totalMinor = toMinorUnits(pricedCartSummary.totalPrice, checkoutCurrency);

    const quoteFingerprint = buildQuoteFingerprint({
      presentmentCurrency,
      marketCode: storefrontMarketContext?.marketCode,
      shippingAddress: input.shippingAddress,
      shopAdjustments: input.shopAdjustments,
      items: allItems,
      totals: {
        checkoutCurrency,
        subtotalMinor,
        shippingMinor,
        discountMinor,
        totalMinor,
      },
    });

    this.orderTotalPolicyService.assertWithinLimit({
      totalMinor,
      currency: checkoutCurrency,
    });

    const {
      createdNewQuote,
      quote: persistedQuote,
      items: persistedItems, 
    } = await this.entityManager.transactional(async (entityManager) => {

      const quoteRepository = entityManager.getRepository(CheckoutQuoteEntity);
      const quoteItemRepository = entityManager.getRepository(CheckoutQuoteItemEntity);
      const now = new Date();

      const existingQuote = await this.findReusableQuote(entityManager, {
        actor: input.actor,
        cartId: input.cart.id,
        quoteFingerprint,
        reservationCount: allItems.length,
        now,
      });

      if (existingQuote) {
        return {
          createdNewQuote: false,
          quote: existingQuote,
          items: flattenQuoteItems(existingQuote.pricedShops),
        };
      }

      const checkoutQuote = quoteRepository.create({
        actorType: input.actor.type === 'user'
          ? CheckoutQuoteActorType.USER
          : CheckoutQuoteActorType.GUEST,
        ...(input.actor.type === 'user'
          ? { user: entityManager.getReference(CurrentUserEntity, input.actor.userId) }
          : { guestSessionId: input.actor.guestSessionId }),
        cartId: input.cart.id,
        quoteFingerprint,
        ...(presentmentCurrency ? { presentmentCurrency } : {}),
        ...(storefrontMarketContext?.marketCode
          ? { marketCode: storefrontMarketContext.marketCode }
          : {}),
        checkoutCurrency,
        subtotalMinor,
        shippingMinor,
        discountMinor,
        totalMinor,
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
      entityManager.persist(checkoutQuote);

      const reservationResult = await this.checkoutStockReservationService.reserveForQuote(entityManager, {
        quoteId: checkoutQuote.id,
        cartId: input.cart.id,
        expiresAt,
        items: allItems.map((item) => ({
          inventoryId: item.inventoryId,
          quantity: item.quantity,
          title: item.title,
        })),
      });

      const reservationId = getReservationId(reservationResult);
      if (reservationId) {
        checkoutQuote.reservationId = reservationId;
      }

      const quoteItems = allItems.map((item) => {
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
          quote: checkoutQuote,
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

      const shops: CheckoutQuoteShopSummary[] = pricedCartSummary.shops.map((shop) => ({
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
        items: quoteItems.filter((entry) => entry.shopId === shop.shopId),
      }));

      checkoutQuote.pricedShops = shops.map((shop) => ({
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

      return { createdNewQuote: true, quote: checkoutQuote, items: quoteItems };
    });

    const shops = parsePricedShops(persistedQuote.pricedShops);

    if (createdNewQuote) {
      await this.jobDispatcher.dispatch(
        appJobName.cleanupExpiredCheckoutQuoteReservations,
        { quoteId: persistedQuote.id },
        {
          deduplicationKey: appJobDeduplicationKey.cleanupExpiredCheckoutQuoteReservations(
            persistedQuote.id,
          ),
          delayMs: Math.max(persistedQuote.expiresAt.getTime() - Date.now(), 0),
        },
      );
    }

    return {
      quoteId: persistedQuote.id,
      presentmentCurrency,
      checkoutCurrency: persistedQuote.checkoutCurrency,
      subtotalMinor: persistedQuote.subtotalMinor,
      shippingMinor: persistedQuote.shippingMinor,
      discountMinor: persistedQuote.discountMinor,
      totalMinor: persistedQuote.totalMinor,
      expiresAt: persistedQuote.expiresAt,
      shops,
      items: persistedItems,
    };
  }

  private async findReusableQuote(
    entityManager: EntityManager,
    input: {
      actor:
        | { type: 'user'; userId: string }
        | { type: 'guest'; guestSessionId: string };
      cartId: string;
      quoteFingerprint: string;
      reservationCount: number;
      now: Date;
    },
  ): Promise<CheckoutQuoteEntity | null> {
    const quote = await entityManager.getRepository(CheckoutQuoteEntity).findOne(
      {
        cartId: input.cartId,
        quoteFingerprint: input.quoteFingerprint,
        expiresAt: { $gt: input.now },
        ...(input.actor.type === 'user'
          ? {
            actorType: CheckoutQuoteActorType.USER,
            user: input.actor.userId,
          }
          : {
            actorType: CheckoutQuoteActorType.GUEST,
            guestSessionId: input.actor.guestSessionId,
          }),
      },
      { orderBy: { createdAt: 'desc' as const } },
    );

    if (!quote) {
      return null;
    }

    const activeReservations = await entityManager.getRepository(CheckoutStockReservationEntity).count({
      quote: quote.id,
      status: CheckoutStockReservationStatus.ACTIVE,
      expiresAt: { $gt: input.now },
    });

    return activeReservations === input.reservationCount ? quote : null;
  }
}

function parsePricedShops(
  pricedShops: Record<string, unknown>[],
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
      source_currency: string;
      unit_price_source_minor: number;
      line_total_source_minor: number;
      checkout_currency: string;
      unit_price_checkout_minor: number;
      line_total_checkout_minor: number;
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
      sourceCurrency: item.source_currency,
      unitPriceSourceMinor: item.unit_price_source_minor,
      lineTotalSourceMinor: item.line_total_source_minor,
      checkoutCurrency: item.checkout_currency,
      unitPriceCheckoutMinor: item.unit_price_checkout_minor,
      lineTotalCheckoutMinor: item.line_total_checkout_minor,
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

function flattenQuoteItems(pricedShops: Record<string, unknown>[]): CheckoutQuoteResult['items'] {
  return parsePricedShops(pricedShops).flatMap((shop) => shop.items);
}

function buildQuoteFingerprint(input: {
  presentmentCurrency?: string;
  marketCode?: string;
  shippingAddress: ShippingAddressInput;
  shopAdjustments?: ShopAdjustmentInput[];
  items: PricedCartItem[];
  totals: {
    checkoutCurrency: string;
    subtotalMinor: number;
    shippingMinor: number;
    discountMinor: number;
    totalMinor: number;
  };
}): string {
  const payload = {
    presentmentCurrency: input.presentmentCurrency ?? null,
    marketCode: input.marketCode ?? null,
    shippingAddress: {
      fullName: input.shippingAddress.fullName,
      address1: input.shippingAddress.address1,
      address2: input.shippingAddress.address2 ?? null,
      city: input.shippingAddress.city,
      country: input.shippingAddress.country,
      state: input.shippingAddress.state,
      zip: input.shippingAddress.zip,
      phone: input.shippingAddress.phone,
    },
    shopAdjustments: [...(input.shopAdjustments ?? [])]
      .map((adjustment) => ({
        shopId: adjustment.shopId,
        promoCodes: [...(adjustment.promoCodes ?? [])].sort(),
        note: adjustment.note ?? null,
      }))
      .sort((left, right) => left.shopId.localeCompare(right.shopId)),
    items: [...input.items]
      .map((item) => ({
        inventoryId: item.inventoryId,
        quantity: item.quantity,
        sourceCurrency: item.sourceCurrency ?? null,
        unitPriceMinor: item.unitPriceMinor ?? null,
        sourceUnitPriceMinor: item.sourceUnitPriceMinor ?? null,
        originalAmountMinor: item.originalAmountMinor ?? null,
        marketCode: item.marketCode ?? null,
        sourcePriceId: item.sourcePriceId ?? null,
        sourceType: item.sourceType ?? null,
        fxRate: item.fxRate ?? null,
        fxSource: item.fxSource ?? null,
        fxEffectiveAt: normalizeFingerprintDate(item.fxEffectiveAt),
        fxSourceTimestamp: normalizeFingerprintDate(item.fxSourceTimestamp),
      }))
      .sort((left, right) => left.inventoryId.localeCompare(right.inventoryId)),
    totals: input.totals,
  };

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function normalizeFingerprintDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
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
  items: PricedCartItem[],
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

function getReservationId(result: unknown): string | undefined {
  if (
    result
    && typeof result === 'object'
    && 'reservationId' in result
    && typeof result.reservationId === 'string'
  ) {
    return result.reservationId;
  }

  return undefined;
}
