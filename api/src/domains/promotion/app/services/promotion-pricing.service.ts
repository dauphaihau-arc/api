import { Injectable } from '@nestjs/common';
import type { FxRateCache } from '~/integrations/currency/fx-rate.service';
import { allocateMinorUnits, fromMinorUnits, toMinorUnits } from '../../../../platform/money/money';
import type {
  PricedCartItem,
  PromotionPresentmentAmounts,
  ShippingDiscountProvenance,
} from '../../../order/app/order.types';
import type { CheckoutShippingShopQuote } from '../../../shipping/app/shipping.types';
import { PromotionVisibility } from '../../domain/enums/promotion-visibility.enum';
import { PromotionBenefitType } from '../../domain/enums/promotion-benefit-type.enum';
import type { PromotionCodeOffer } from '../ports/promotion-code.reader';
import { PromotionCodeReader } from '../ports/promotion-code.reader';
import { SaleProjectionReader } from '../ports/sale-projection.reader';
import {
  PromotionCodeNotFoundError,
  PromotionCodeNotApplicableError,
  PromotionCurrencyConversionUnavailableError,
} from '../errors/promotion-app.error';
import type {
  AddPromoCodeInput,
  AppliedPromoCode,
  ApplyPromoCodeToCartInput,
  PricedPromoShop,
  DiscoverablePromoCode,
  ListDiscoverablePromoCodesInput,
} from '../types/promotion.types';
import {
  promotionCodeOfferToPromoOffer,
  type PromoOffer,
} from '../types/promotion.types';
import { priceItems } from './sale-item-pricing';
import {
  assertPromoCodeSlots,
  computePromoOfferDiscount,
  evaluatePromoOffer,
  nextPromoCodeSelection,
  promoOfferAppliesToProduct,
  sortDiscoverablePromoCodes,
} from './promotion-eligibility';
import { PromotionPresentmentService } from './promotion-presentment.service';

@Injectable()
export class PromotionPricingService {
  constructor(
    private readonly promotionPresentmentService: PromotionPresentmentService,
    private readonly saleProjectionReader: SaleProjectionReader,
    private readonly promotionCodeReader: PromotionCodeReader,
  ) {}

  async applyToCart(input: ApplyPromoCodeToCartInput): Promise<PricedPromoShop[]> {
    const shopAdjustments = new Map(
      (input.shopAdjustments ?? []).map((entry) => [entry.shopId, entry]),
    );

    const selectedItems = input.cart.items.filter((item) => item.isSelectOrder);
    const shopIds = [...new Set(selectedItems.map((item) => item.inventory.shopId))];

    const promotionOffers = await this.promotionCodeReader.findActiveCheckoutDiscounts({ shopIds });

    const promotionUsageCounts = await this.loadPromotionUsageCounts(
      promotionOffers,
      input.userId,
    );

    const salesByProductId = await this.saleProjectionReader.findBestSalesForProducts({
      targets: selectedItems.map((item) => ({
        shopId: item.inventory.shopId,
        productId: item.inventory.productId,
      })),
    });

    const pricedItemsByShop = priceItems(selectedItems, salesByProductId);

    // One rate cache per pricing call, so repeated lookups for the same pair
    // are resolved once and the whole cart prices from one FX snapshot.
    const rateCache: FxRateCache = new Map();
    const now = new Date();

    const result: PricedPromoShop[] = [];
    for (const [shopId, items] of pricedItemsByShop.entries()) {
      result.push(await this.priceShop({
        shopId,
        items,
        promotionOffers,
        promoCodes: shopAdjustments.get(shopId)?.promoCodes ?? [],
        promotionUsageCounts,
        checkoutCurrency: input.checkoutCurrency,
        shippingShop: input.shippingShops?.find((entry) => entry.shopId === shopId),
        validatePromoCodes: input.validatePromoCodes === true,
        authenticatedUserId: input.userId,
        rateCache,
        now,
      }));
    }

    return result;
  }

  /**
   * The discoverable promo codes for the selected items of one shop: the public
   * offers the buyer can see in the checkout picker. The pricing path uses the
   * same evaluator, so an offer flagged ineligible in the listing is exactly
   * the one a redemption rejects and vice versa.
   *
   * A public offer the current cart or buyer cannot redeem is still returned,
   * flagged with the first failing `PromoCodeIneligibleReason`, so the buyer
   * sees why it is unavailable instead of the listing silently hiding it.
   * Offers that are not discoverable at all are excluded outright: non-public
   * visibility, a Promotion that has not started, ended, been cancelled, or
   * reached its global redemption limit, and any offer whose money cannot be
   * expressed in the checkout currency.
   *
   * Amounts are converted into `checkoutCurrency`. Eligible offers come first,
   * then ineligible ones, each group ordered by `code`.
   */
  async listDiscoverablePromoCodes(
    input: ListDiscoverablePromoCodesInput,
  ): Promise<DiscoverablePromoCode[]> {
    const selectedItems = input.cart.items.filter((item) =>
      item.isSelectOrder && item.inventory.shopId === input.shopId);

    if (selectedItems.length === 0) {
      return [];
    }

    const promotionOffers = await this.promotionCodeReader.findActiveCheckoutDiscounts({
      shopIds: [input.shopId],
    });
    const promotionUsageCounts = await this.loadPromotionUsageCounts(
      promotionOffers,
      input.userId,
    );
    const salesByProductId = await this.saleProjectionReader.findBestSalesForProducts({
      targets: selectedItems.map((item) => ({
        shopId: item.inventory.shopId,
        productId: item.inventory.productId,
      })),
    });
    const items = priceItems(selectedItems, salesByProductId).get(input.shopId) ?? [];
    const rateCache: FxRateCache = new Map();
    const now = new Date();

    const discoverable: DiscoverablePromoCode[] = [];

    for (const offer of promotionOffers) {
      if (offer.visibility !== PromotionVisibility.PUBLIC) {
        continue;
      }

      const promoOffer = promotionCodeOfferToPromoOffer(offer);
      const amounts = await this.promotionPresentmentService.resolveForPromoOffer(
        promoOffer,
        input.checkoutCurrency,
        rateCache,
      );
      if (!amounts) {
        continue;
      }

      const eligibility = evaluatePromoOffer({
        offer: promoOffer,
        items,
        userUsageCount: promotionUsageCounts.get(offer.promotionId) ?? 0,
        amounts,
        checkoutCurrency: input.checkoutCurrency,
        now,
        authenticatedUserId: input.userId,
      });

      // A Promotion that is not active or is globally exhausted is never
      // advertised: it is not a usable offer at all. A per-buyer limit is a
      // buyer-specific condition, so it stays visible as a disabled reason.
      if (
        eligibility.outcome === 'ineligible'
        && (
          eligibility.reason === 'not_started'
          || eligibility.reason === 'expired'
          || eligibility.reason === 'usage_limit_reached'
        )
      ) {
        continue;
      }

      discoverable.push({
        code: offer.code,
        benefitType: promoOffer.benefitType,
        productScope: promoOffer.productScope,
        amountOff: amounts.amountOff,
        percentOff: offer.percentOff,
        minOrderType: promoOffer.minOrderType,
        minOrderValue: amounts.minOrderValue,
        minPurchaseQuantity: offer.minPurchaseQuantity,
        endDate: offer.endAt,
        currency: input.checkoutCurrency,
        isEligible: eligibility.outcome === 'eligible',
        ineligibleReason: eligibility.outcome === 'ineligible'
          ? eligibility.reason
          : null,
      });
    }

    return sortDiscoverablePromoCodes(discoverable);
  }

  /**
   * The promo codes a shop cart holds after adding `code` alongside the codes
   * already retained in the other slot. Adding a code atomically replaces any
   * retained code in the same slot, and the resulting selection is validated as
   * a whole, so an invalid combination throws instead of returning a partial or
   * stacked state.
   */
  async addPromoCode(input: AddPromoCodeInput): Promise<AppliedPromoCode[]> {
    const requestedCode = input.code.trim().toUpperCase();
    const promotionOffers = await this.promotionCodeReader.findActiveCheckoutDiscounts({
      shopIds: [input.shopId],
    });
    const offersByCode = this.buildOffersByCode(promotionOffers);
    const requested = offersByCode.get(requestedCode);

    if (!requested) {
      throw new PromotionCodeNotFoundError(requestedCode);
    }

    const nextCodes = nextPromoCodeSelection({
      requested,
      retainedCodes: input.retainedPromoCodes,
      offersByCode,
    });

    const checkoutCurrency = input.cart.items.find((item) =>
      item.isSelectOrder && item.inventory.shopId === input.shopId)?.inventory.currency ?? 'USD';

    await this.applyToCart({
      userId: input.userId,
      cart: input.cart,
      shopAdjustments: [{ shopId: input.shopId, promoCodes: nextCodes }],
      validatePromoCodes: true,
      checkoutCurrency,
    });

    // Validation above rejects any code it cannot resolve, so every remaining
    // code has an offer and its type can be read without a second query.
    return nextCodes.map((code) => {
      const offer = offersByCode.get(code);
      if (!offer) {
        throw new PromotionCodeNotFoundError(code);
      }

      return { code: offer.code, benefitType: offer.benefitType };
    });
  }

  // ---------- Private helpers ----------

  /**
   * Prices one shop's items against the requested codes: resolves each offer's
   * money, rejects the whole selection when a rate is missing or promo
   * validation is on, and folds the accepted codes into discount and shipping
   * provenance.
   */
  private async priceShop(input: {
    shopId: string;
    items: PricedCartItem[];
    promotionOffers: PromotionCodeOffer[];
    promoCodes: string[];
    promotionUsageCounts: Map<string, number>;
    checkoutCurrency: string;
    shippingShop: CheckoutShippingShopQuote | undefined;
    validatePromoCodes: boolean;
    authenticatedUserId?: string;
    rateCache: FxRateCache;
    now: Date;
  }): Promise<PricedPromoShop> {
    const {
      shopId, items, promoCodes, checkoutCurrency, validatePromoCodes, rateCache, now,
    } = input;

    const subtotal = items.reduce(
      (sum, item) => sum + (item.effectiveUnitPrice * item.quantity),
      0,
    );
    const saleDiscount = items.reduce(
      (sum, item) => sum + ((item.price - item.effectiveUnitPrice) * item.quantity),
      0,
    );
    const offersByCode = this.buildOffersByCode(
      input.promotionOffers.filter((offer) => offer.shopId === shopId),
    );
    const requestedOffers: PromoOffer[] = [];

    for (const code of promoCodes) {
      const offer = offersByCode.get(code);
      if (!offer) {
        if (validatePromoCodes) throw new PromotionCodeNotFoundError(code);
        continue;
      }
      requestedOffers.push(offer);
    }

    assertPromoCodeSlots(requestedOffers);

    const promoOffers: PromoOffer[] = [];
    let totalDiscount = 0;
    let freeShipOffer: PromoOffer | undefined;
    let freeShipAmounts: PromotionPresentmentAmounts | undefined;
    let productDiscountOffer: PromoOffer | undefined;
    let productDiscountMinor = 0;

    for (const offer of requestedOffers) {
      // The offer's own currency is never assumed to be the checkout
      // currency: without a rate the selection fails rather than charge a
      // wrong total or silently drop the discount the buyer chose.
      const amounts = await this.promotionPresentmentService.resolveForPromoOffer(
        offer,
        checkoutCurrency,
        rateCache,
      );
      const eligibility = evaluatePromoOffer({
        offer,
        items,
        userUsageCount: input.promotionUsageCounts.get(offer.id) ?? 0,
        amounts,
        checkoutCurrency,
        now,
        shippingChargeMinor: input.shippingShop?.charge.totalMinor,
        authenticatedUserId: input.authenticatedUserId,
      });

      if (eligibility.outcome === 'conversion_unavailable') {
        throw new PromotionCurrencyConversionUnavailableError(
          offer.code,
          offer.currency,
          checkoutCurrency,
        );
      }
      if (eligibility.outcome === 'ineligible') {
        if (validatePromoCodes) throw new PromotionCodeNotApplicableError(offer.code, eligibility.reason);
        continue;
      }

      promoOffers.push(offer);
      if (offer.benefitType === PromotionBenefitType.FREE_SHIPPING) {
        freeShipOffer = offer;
        freeShipAmounts = eligibility.amounts;
      }
      else {
        const grantedMinor = toMinorUnits(
          Math.min(
            eligibility.eligibleSubtotal,
            computePromoOfferDiscount(
              offer,
              eligibility.amounts,
              eligibility.eligibleSubtotal,
            ),
          ),
          checkoutCurrency,
        );
        totalDiscount += fromMinorUnits(grantedMinor, checkoutCurrency);
        productDiscountOffer = offer;
        productDiscountMinor = grantedMinor;
      }
    }

    // The granted product discount is allocated across the eligible items in
    // whole minor units and reconciles exactly to the shop's merchandise
    // discount; untargeted items are never allocated any part of it.
    if (productDiscountOffer && productDiscountMinor > 0) {
      const appliedOffer = productDiscountOffer;

      const eligibleItems = items.filter((item) =>
        promoOfferAppliesToProduct(appliedOffer, item.productId));

      const allocations = allocateMinorUnits(
        productDiscountMinor,
        eligibleItems.map((item) =>
          toMinorUnits(item.effectiveUnitPrice * item.quantity, checkoutCurrency)),
      );

      eligibleItems.forEach((item, index) => {
        item.promoDiscountMinor = allocations[index];
      });
    }

    const shippingDiscountMinor = input.shippingShop && freeShipOffer
      ? input.shippingShop.charge.totalMinor
      : 0;
    const shippingDiscounts = shippingDiscountMinor > 0 && freeShipOffer && freeShipAmounts
      ? [this.buildShippingDiscountProvenance(freeShipOffer, freeShipAmounts, shippingDiscountMinor, checkoutCurrency)]
      : [];

    return {
      shopId,
      items,
      subtotal,
      totalDiscount,
      saleDiscount,
      promoOffers,
      shippingDiscountMinor,
      shippingDiscounts,
    };
  }

  private buildOffersByCode(
    promotionOffers: PromotionCodeOffer[],
  ): Map<string, PromoOffer> {
    const offersByCode = new Map<string, PromoOffer>();

    for (const offer of promotionOffers) {
      offersByCode.set(offer.code, promotionCodeOfferToPromoOffer(offer));
    }

    return offersByCode;
  }

  private buildShippingDiscountProvenance(
    offer: PromoOffer,
    amounts: PromotionPresentmentAmounts,
    waivedMinor: number,
    currency: string,
  ): ShippingDiscountProvenance {
    return {
      promotionId: offer.id,
      code: offer.code,
      benefitType: 'free_shipping',
      productScope: offer.productScope,
      productIds: [...offer.productIds],
      minOrderType: offer.minOrderType,
      minOrderValue: amounts.minOrderValue,
      minPurchaseQuantity: offer.minPurchaseQuantity,
      maxRedemptions: offer.maxRedemptions ?? 0,
      maxRedemptionsPerBuyer: offer.maxRedemptionsPerBuyer ?? 0,
      redemptionCount: offer.redemptionCount,
      waivedMinor,
      currency,
    };
  }

  private async loadPromotionUsageCounts(
    offers: PromotionCodeOffer[],
    userId?: string,
  ): Promise<Map<string, number>> {
    if (offers.length === 0 || !userId) {
      return new Map();
    }

    return this.promotionCodeReader.countUsagesByUser(
      offers.map((offer) => offer.promotionId),
      userId,
    );
  }
}
