import { createHash } from 'node:crypto';
import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable } from '@nestjs/common';
import ms from 'ms';
import { appJobDeduplicationKey } from '../../../../platform/jobs/app-job-deduplication';
import { appJobName } from '../../../../platform/jobs/app-job.names';
import { toMinorUnits } from '../../../../platform/money/money';
import { MARKETPLACE_CURRENCIES } from '../../../../platform/config/marketplace.config';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import type { CartSnapshot } from '../../../cart/app/cart.types';
import { CartPricingService } from '../../../cart/app/services/cart-pricing.service';
import { StorefrontMarketContextService } from '../../../product/app/services/storefront-market-context.service';
import { ProductInventoryEntity } from '../../../product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { dispatchCatalogProductProjections } from '../../../product/app/catalog-product-projection-dispatch';
import { PurchaseEligibilityService } from '../../../product/app/services/purchase-eligibility.service';
import { JobDispatcher } from '../../../../integrations/queue/app/ports/job-dispatcher';
import {
  CheckoutQuoteActorType,
  CheckoutQuoteEntity,
} from '../../infra/persistence/entities/checkout-quote.entity';
import { CheckoutQuoteItemEntity } from '../../infra/persistence/entities/checkout-quote-item.entity';
import { CheckoutStockReservationPort } from '../ports/checkout-stock-reservation.port';
import { CheckoutQuoteRepository } from '../ports/checkout-quote.repository';
import {
  CheckoutQuoteNoItemsError,
  CheckoutQuoteReservationOutOfStockError,
  CheckoutQuoteReservationUnavailableError,
} from '../../../order/app/errors/order-app.error';
import type {
  CheckoutQuoteResult,
  CheckoutQuoteShopSummary,
  PricedCartItem,
  PricedShopCart,
  ShippingAddressInput,
  ShopAdjustmentInput,
} from '../../../order/app/order.types';
import { OrderTotalPolicyService } from '../../../order/app/services/order-total-policy.service';
import {
  parsePricedShops,
  toPersistedPricedShops,
} from './checkout-quote-priced-shops';
import { createCheckoutQuoteItem } from './checkout-quote-item.mapping';

const QUOTE_TTL_MS = ms('30m');

@Injectable()
export class CreateCheckoutQuoteService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly checkoutQuoteRepository: CheckoutQuoteRepository,
    private readonly cartPricingService: CartPricingService,
    private readonly storefrontMarketContextService: StorefrontMarketContextService,
    private readonly orderTotalPolicyService: OrderTotalPolicyService,
    private readonly checkoutStockReservationService: CheckoutStockReservationPort,
    private readonly purchaseEligibilityService: PurchaseEligibilityService,
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

    // The quote timestamp anchors both the accepted delivery estimate and the
    // expiry so a single instant owns the whole quote.
    const anchorAt = new Date();

    const pricedCartSummary = await this.cartPricingService.buildPricedCartSummary({
      userId: input.actor.type === 'user' ? input.actor.userId : undefined,
      cart: input.cart,
      shippingAddress: input.shippingAddress,
      shopAdjustments: input.shopAdjustments,
      anchorAt,
    });

    const allItems = pricedCartSummary.shops.flatMap((shop) => shop.items);

    if (allItems.length === 0) {
      throw new CheckoutQuoteNoItemsError();
    }

    const checkoutCurrency = resolveCheckoutCurrency(allItems);

    const expiresAt = new Date(anchorAt.getTime() + QUOTE_TTL_MS);

    // Quote money is owned in minor units: each shop's total is exactly its
    // subtotal minus discount plus shipping, and the quote total is the sum of
    // the shop totals, so the payment charge and the confirmed Orders can agree
    // exactly without rounding drift.
    const shopMoney = pricedCartSummary.shops.map((shop) => {
      const shopSubtotalMinor = toMinorUnits(shop.subtotal, checkoutCurrency);
      const shopDiscountMinor = toMinorUnits(shop.totalDiscount, checkoutCurrency);
      const shopSaleDiscountMinor = toMinorUnits(shop.saleDiscount, checkoutCurrency);
      const shopShippingMinor = toMinorUnits(shop.totalShippingFee, checkoutCurrency);

      return {
        shop,
        subtotalMinor: shopSubtotalMinor,
        discountMinor: shopDiscountMinor,
        saleDiscountMinor: shopSaleDiscountMinor,
        shippingMinor: shopShippingMinor,
        totalMinor: shopSubtotalMinor - shopDiscountMinor + shopShippingMinor,
      };
    });

    const subtotalMinor = shopMoney.reduce((total, entry) => total + entry.subtotalMinor, 0);
    const shippingMinor = shopMoney.reduce((total, entry) => total + entry.shippingMinor, 0);
    const discountMinor = shopMoney.reduce((total, entry) => total + entry.discountMinor, 0);
    const saleDiscountMinor = shopMoney.reduce((total, entry) => total + entry.saleDiscountMinor, 0);
    const totalMinor = subtotalMinor - discountMinor + shippingMinor;

    const quoteFingerprint = buildQuoteFingerprint({
      presentmentCurrency,
      marketCode: storefrontMarketContext?.marketCode,
      shippingAddress: input.shippingAddress,
      shopAdjustments: input.shopAdjustments,
      items: allItems,
      shipping: buildShippingFingerprint(pricedCartSummary.shops),
      shippingAnchorAt: pricedCartSummary.shippingAnchorAt,
      totals: {
        checkoutCurrency,
        subtotalMinor,
        shippingMinor,
        discountMinor,
        saleDiscountMinor,
        totalMinor,
      },
    });

    this.orderTotalPolicyService.assertWithinLimit({
      totalMinor,
      currency: checkoutCurrency,
    });

    const eligibility = await this.purchaseEligibilityService.evaluate({
      items: allItems.map((item) => ({
        inventoryId: item.inventoryId,
        quantity: item.quantity,
        title: item.title,
      })),
    });

    if (!eligibility.eligible) {
      const failure = eligibility.failures[0];

      if (failure?.reason === 'insufficient_available_quantity') {
        throw new CheckoutQuoteReservationOutOfStockError(failure.title);
      }
      throw new CheckoutQuoteReservationUnavailableError();
    }

    const {
      createdNewQuote,
      quote: persistedQuote,
      items: persistedItems,
    } = await this.entityManager.transactional(async (entityManager) => {
      const quoteRepository = entityManager.getRepository(CheckoutQuoteEntity);
      const quoteItemRepository = entityManager.getRepository(CheckoutQuoteItemEntity);
      const now = new Date();

      const existingQuote = await this.checkoutQuoteRepository.findReusable({
        actor: input.actor,
        cartId: input.cart.id,
        quoteFingerprint,
        reservationCount: allItems.length,
        now,
      }, {
        entityManager,
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
          ? { user: entityManager.getReference(UserEntity, input.actor.userId) }
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
        saleDiscountMinor,
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
        const { entity, summary } = createCheckoutQuoteItem({
          repository: quoteItemRepository,
          quote: checkoutQuote,
          inventory: entityManager.getReference(ProductInventoryEntity, item.inventoryId),
          item,
          checkoutCurrency,
        });

        entityManager.persist(entity);

        return summary;
      });

      const shops: CheckoutQuoteShopSummary[] = shopMoney.map((entry) => ({
        shopId: entry.shop.shopId,
        shopName: entry.shop.shopName,
        shopSlug: entry.shop.items[0]?.shopSlug ?? '',
        subtotalMinor: entry.subtotalMinor,
        discountMinor: entry.discountMinor,
        saleDiscountMinor: entry.saleDiscountMinor,
        shippingMinor: entry.shippingMinor,
        shippingDiscountMinor: entry.shop.shippingDiscountMinor ?? 0,
        totalMinor: entry.totalMinor,
        note: entry.shop.note,
        promoCodes: entry.shop.promoOffers.map((offer) => offer.code),
        originCountries: entry.shop.originCountries,
        shipping: entry.shop.shipping,
        shippingDiscounts: entry.shop.shippingDiscounts ?? [],
        items: quoteItems.filter((item) => item.shopId === entry.shop.shopId),
      }));

      checkoutQuote.pricedShops = toPersistedPricedShops(shops);

      await entityManager.flush();

      return { createdNewQuote: true, quote: checkoutQuote, items: quoteItems };
    });

    const shops = parsePricedShops(persistedQuote.pricedShops);
    const shippingAnchorAt = shops.find((shop) => shop.shipping)?.shipping?.estimate.anchorAt;

    if (createdNewQuote) {
      await this.jobDispatcher.dispatch(
        appJobName.cleanupExpiredCheckoutQuoteReservations,
        {
          quoteId: persistedQuote.id,
          productIds: allItems.map((item) => item.productId),
        },
        {
          deduplicationKey: appJobDeduplicationKey.cleanupExpiredCheckoutQuoteReservations(
            persistedQuote.id,
          ),
          delayMs: Math.max(persistedQuote.expiresAt.getTime() - Date.now(), 0),
        },
      );

      await dispatchCatalogProductProjections(
        this.jobDispatcher,
        allItems.map((item) => item.productId),
      );
    }

    return {
      quoteId: persistedQuote.id,
      presentmentCurrency,
      checkoutCurrency: persistedQuote.checkoutCurrency,
      subtotalMinor: persistedQuote.subtotalMinor,
      shippingMinor: persistedQuote.shippingMinor,
      discountMinor: persistedQuote.discountMinor,
      saleDiscountMinor: persistedQuote.saleDiscountMinor,
      totalMinor: persistedQuote.totalMinor,
      ...(shippingAnchorAt ? { shippingAnchorAt } : {}),
      expiresAt: persistedQuote.expiresAt,
      shops,
      items: persistedItems,
    };
  }
}

function flattenQuoteItems(pricedShops: Record<string, unknown>[]): CheckoutQuoteResult['items'] {
  return parsePricedShops(pricedShops).flatMap((shop) => shop.items);
}

/**
 * The price- and estimate-affecting surface of every shop's shipping quote.
 * Any change to a profile/rate identity or version, the chosen base unit, a
 * component fee, a Processing/Delivery range, the combined estimate, or the
 * Promo Code waiver produces a new fingerprint and therefore a new quote.
 */
function buildShippingFingerprint(shops: PricedShopCart[]): unknown {
  return [...shops]
    .sort((left, right) => left.shopId.localeCompare(right.shopId))
    .map((shop) => ({
      shopId: shop.shopId,
      shipping: shop.shipping
        ? {
          currency: shop.shipping.currency,
          charge: shop.shipping.charge,
          estimate: {
            ...shop.shipping.estimate,
            anchorAt: shop.shipping.estimate.anchorAt.toISOString(),
            earliestDeliveryDate: shop.shipping.estimate.earliestDeliveryDate.toISOString(),
            latestDeliveryDate: shop.shipping.estimate.latestDeliveryDate.toISOString(),
          },
          units: shop.shipping.units,
        }
        : null,
      shippingDiscountMinor: shop.shippingDiscountMinor ?? 0,
      shippingDiscounts: shop.shippingDiscounts ?? [],
    }));
}

function buildQuoteFingerprint(input: {
  presentmentCurrency?: string;
  marketCode?: string;
  shippingAddress: ShippingAddressInput;
  shopAdjustments?: ShopAdjustmentInput[];
  items: PricedCartItem[];
  shipping: unknown;
  shippingAnchorAt?: Date;
  totals: {
    checkoutCurrency: string;
    subtotalMinor: number;
    shippingMinor: number;
    discountMinor: number;
    saleDiscountMinor: number;
    totalMinor: number;
  };
}): string {
  const payload = {
    presentmentCurrency: input.presentmentCurrency ?? null,
    marketCode: input.marketCode ?? null,
    // The anchor is bound at UTC-day precision: identical requests reuse the
    // quote within the same UTC day, while a new day prices a fresh estimate.
    shippingAnchorDay: input.shippingAnchorAt
      ? new Date(Date.UTC(
        input.shippingAnchorAt.getUTCFullYear(),
        input.shippingAnchorAt.getUTCMonth(),
        input.shippingAnchorAt.getUTCDate(),
      )).toISOString()
      : null,
    shipping: input.shipping,
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
