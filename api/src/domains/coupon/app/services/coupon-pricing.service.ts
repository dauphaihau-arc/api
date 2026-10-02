import { Injectable } from '@nestjs/common';
import type { FxRateCache } from '~/integrations/currency/fx-rate.service';
import type {
  CouponPresentmentAmounts,
  PricedCartItem,
  ShippingDiscountProvenance,
} from '../../../order/app/order.types';
import type { CheckoutShippingShopQuote } from '../../../shipping/app/shipping.types';
import { CouponAppliesTo } from '../../domain/enums/coupon-applies-to.enum';
import { CouponIneligibleReason } from '../../domain/enums/coupon-ineligible-reason.enum';
import { CouponMinOrderType } from '../../domain/enums/coupon-min-order-type.enum';
import { CouponVisibility } from '../../domain/enums/coupon-visibility.enum';
import type { CouponEntity } from '../../infra/persistence/entities/coupon.entity';
import type { PromotionCodeOffer } from '../../../promotion/app/ports/promotion-code.reader';
import {
  CouponCodeNotFoundError,
  CouponCodeNotApplicableError,
  CouponCurrencyConversionUnavailableError,
} from '../errors/coupon-app.error';
import { CouponRepository } from '../ports/coupon.repository';
import { PromotionCodeReader } from '../../../promotion/app/ports/promotion-code.reader';
import { SaleProjectionReader } from '../../../promotion/app/ports/sale-projection.reader';
import type {
  AddPromoCouponInput,
  AppliedCoupon,
  ApplyCouponToCartInput,
  CouponPricedShop,
  DiscoverableCoupon,
  ListDiscoverableCouponsInput,
  ManualPromoOffer,
} from '../types/coupon.types';
import {
  couponToManualOffer,
  manualTypeToCouponType,
  promotionCodeOfferToManualOffer,
} from '../types/coupon.types';
import { priceItems } from './auto-sale-item-pricing';
import {
  assertManualCouponSlots,
  computeManualPromoOfferDiscount,
  evaluateCoupon,
  evaluateManualPromoOffer,
  nextPromoCodeSelection,
  sortDiscoverableCoupons,
} from './coupon-eligibility';
import { CouponPresentmentService } from './coupon-presentment.service';

@Injectable()
export class CouponPricingService {
  constructor(
    private readonly couponRepository: CouponRepository,
    private readonly couponPresentmentService: CouponPresentmentService,
    private readonly saleProjectionReader: SaleProjectionReader,
    private readonly promotionCodeReader: PromotionCodeReader,
  ) {}

  async applyToCart(input: ApplyCouponToCartInput): Promise<CouponPricedShop[]> {
    const shopAdjustments = new Map(
      (input.shopAdjustments ?? []).map((entry) => [entry.shopId, entry]),
    );

    const selectedItems = input.cart.items.filter((item) => item.isSelectOrder);
    const shopIds = [...new Set(selectedItems.map((item) => item.inventory.shopId))];
    const [coupons, promotionOffers] = await Promise.all([
      this.couponRepository.findByShopIds(shopIds),
      this.promotionCodeReader.findActiveCheckoutDiscounts({ shopIds }),
    ]);
    const couponUsageCounts = await this.loadUserUsageCounts(coupons, input.userId);
    const salesByProductId = await this.saleProjectionReader.findBestSalesForProducts({
      targets: selectedItems.map((item) => ({
        shopId: item.inventory.shopId,
        productId: item.inventory.productId,
      })),
    });
    const pricedItemsByShop = priceItems(selectedItems, coupons, salesByProductId);
    // One rate cache per pricing call, so repeated lookups for the same pair
    // are resolved once and the whole cart prices from one FX snapshot.
    const rateCache: FxRateCache = new Map();
    const now = new Date();

    const result: CouponPricedShop[] = [];
    for (const [shopId, items] of pricedItemsByShop.entries()) {
      result.push(await this.priceShop({
        shopId,
        items,
        coupons,
        promotionOffers,
        promoCodes: shopAdjustments.get(shopId)?.promoCodes ?? [],
        couponUsageCounts,
        checkoutCurrency: input.checkoutCurrency,
        shippingShop: input.shippingShops?.find((entry) => entry.shopId === shopId),
        validatePromoCodes: input.validatePromoCodes === true,
        rateCache,
        now,
      }));
    }

    return result;
  }

  /**
   * The discoverable Coupons for the selected items of one shop: the public,
   * manually redeemed Coupons the buyer can see in the coupon listing. The only
   * visibility exclusion is `code_only`; automatic sale Coupons are also absent
   * because they are not manual codes and the apply path rejects them, and
   * expired Coupons are absent because a dead code is not a usable offer.
   *
   * A public Coupon the current cart cannot redeem is still returned, flagged
   * with the first failing `CouponIneligibleReason`, so the buyer sees why it is
   * unavailable instead of the listing silently hiding it. `expired` never
   * appears as a flag because those Coupons are excluded outright; the apply
   * path still rejects them. Eligibility comes from the same evaluator the
   * pricing path uses, so the two can never disagree.
   *
   * Amounts are converted into `checkoutCurrency`. A Coupon whose monetary
   * fields cannot be expressed in that currency is not listed at all, because
   * showing its native amount as if it were the checkout currency would offer
   * a discount that checkout then rejects. Eligible Coupons come first, then
   * ineligible ones, each group ordered by `code`.
   */
  async listDiscoverableCoupons(
    input: ListDiscoverableCouponsInput,
  ): Promise<DiscoverableCoupon[]> {
    const selectedItems = input.cart.items.filter((item) =>
      item.isSelectOrder && item.inventory.shopId === input.shopId);

    if (selectedItems.length === 0) {
      return [];
    }

    const coupons = await this.couponRepository.findByShopIds([input.shopId]);
    const couponUsageCounts = await this.loadUserUsageCounts(coupons, input.userId);
    const salesByProductId = await this.saleProjectionReader.findBestSalesForProducts({
      targets: selectedItems.map((item) => ({
        shopId: item.inventory.shopId,
        productId: item.inventory.productId,
      })),
    });
    const items = priceItems(selectedItems, coupons, salesByProductId).get(input.shopId) ?? [];
    const rateCache: FxRateCache = new Map();
    const now = new Date();

    const discoverable: DiscoverableCoupon[] = [];
    for (const coupon of coupons) {
      if (coupon.isAutoSale || coupon.visibility !== CouponVisibility.PUBLIC) {
        continue;
      }

      const amounts = await this.couponPresentmentService.resolveForCoupon(
        coupon,
        input.checkoutCurrency,
        rateCache,
      );
      if (!amounts) {
        continue;
      }

      const eligibility = evaluateCoupon({
        coupon,
        items,
        userUsageCount: couponUsageCounts.get(coupon.id) ?? 0,
        amounts,
        now,
      });

      // An expired Coupon is never listed: a dead code is not a usable offer,
      // unlike the other ineligible states which are shown flagged. The apply
      // path still rejects it, so the shared evaluator stays the single rule.
      if (eligibility.outcome === 'ineligible'
        && eligibility.reason === CouponIneligibleReason.EXPIRED) {
        continue;
      }

      discoverable.push({
        code: coupon.code,
        type: coupon.type,
        appliesTo: coupon.appliesTo,
        amountOff: amounts.amountOff,
        percentOff: coupon.percentOff,
        minOrderType: coupon.minOrderType,
        minOrderValue: amounts.minOrderValue,
        minProducts: coupon.minProducts,
        endDate: coupon.endDate,
        currency: input.checkoutCurrency,
        isEligible: eligibility.outcome === 'eligible',
        ineligibleReason: eligibility.outcome === 'ineligible'
          ? eligibility.reason
          : null,
      });
    }

    return sortDiscoverableCoupons(discoverable);
  }

  /**
   * The promo codes a shop cart holds after adding `code` alongside the codes
   * already retained in the other slot. Adding a code atomically replaces any
   * retained code in the same slot, and the resulting selection is validated as
   * a whole, so an invalid combination throws instead of returning a partial or
   * stacked state.
   */
  async addPromoCode(input: AddPromoCouponInput): Promise<AppliedCoupon[]> {
    const requestedCode = input.code.trim().toUpperCase();
    const [coupons, promotionOffers] = await Promise.all([
      this.couponRepository.findByShopIds([input.shopId]),
      this.promotionCodeReader.findActiveCheckoutDiscounts({ shopIds: [input.shopId] }),
    ]);
    const offersByCode = this.buildOffersByCode(coupons, promotionOffers);
    const requested = offersByCode.get(requestedCode);

    if (!requested) {
      throw new CouponCodeNotFoundError(requestedCode);
    }
    if (requested.source === 'coupon') {
      // Auto-sale Coupons are a pricing mechanism, not manual codes.
      const requestedCoupon = coupons.find((coupon) => coupon.id === requested.id);
      if (requestedCoupon?.isAutoSale) {
        throw new CouponCodeNotApplicableError(requestedCode);
      }
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
        throw new CouponCodeNotFoundError(code);
      }

      return { code: offer.code, type: manualTypeToCouponType(offer.type) };
    });
  }

  // ---------- Private helpers ----------

  /**
   * Prices one shop's items against the requested codes: resolves each Coupon's
   * money, rejects the whole selection when a rate is missing or promo
   * validation is on, and folds the accepted codes into discount and shipping
   * provenance.
   */
  private async priceShop(input: {
    shopId: string;
    items: PricedCartItem[];
    coupons: CouponEntity[];
    promotionOffers: PromotionCodeOffer[];
    promoCodes: string[];
    couponUsageCounts: Map<string, number>;
    checkoutCurrency: string;
    shippingShop: CheckoutShippingShopQuote | undefined;
    validatePromoCodes: boolean;
    rateCache: FxRateCache;
    now: Date;
  }): Promise<CouponPricedShop> {
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
      input.coupons.filter((coupon) => coupon.shop.id === shopId),
      input.promotionOffers.filter((offer) => offer.shopId === shopId),
    );
    const requestedOffers: ManualPromoOffer[] = [];

    for (const code of promoCodes) {
      const offer = offersByCode.get(code);
      if (!offer) {
        if (validatePromoCodes) throw new CouponCodeNotFoundError(code);
        continue;
      }
      if (offer.source === 'coupon') {
        const coupon = input.coupons.find((entry) => entry.id === offer.id);
        if (coupon?.isAutoSale) {
          if (validatePromoCodes) throw new CouponCodeNotApplicableError(code);
          continue;
        }
      }
      requestedOffers.push(offer);
    }

    assertManualCouponSlots(requestedOffers);

    const promoOffers: ManualPromoOffer[] = [];
    let totalDiscount = 0;
    let freeShipOffer: ManualPromoOffer | undefined;
    let freeShipAmounts: CouponPresentmentAmounts | undefined;

    for (const offer of requestedOffers) {
      // The offer's own currency is never assumed to be the checkout
      // currency: without a rate the selection fails rather than charge a
      // wrong total or silently drop the discount the buyer chose.
      const amounts = await this.couponPresentmentService.resolveForManualPromoOffer(
        offer,
        checkoutCurrency,
        rateCache,
      );
      const eligibility = evaluateManualPromoOffer({
        offer,
        items,
        userUsageCount: offer.source === 'coupon'
          ? (input.couponUsageCounts.get(offer.id) ?? 0)
          : 0,
        amounts,
        now,
      });

      if (eligibility.outcome === 'conversion_unavailable') {
        throw new CouponCurrencyConversionUnavailableError(
          offer.code,
          offer.currency,
          checkoutCurrency,
        );
      }
      if (eligibility.outcome === 'ineligible') {
        if (validatePromoCodes) throw new CouponCodeNotApplicableError(offer.code);
        continue;
      }

      promoOffers.push(offer);
      if (offer.type === 'free_shipping') {
        freeShipOffer = offer;
        freeShipAmounts = eligibility.amounts;
      }
      else {
        totalDiscount += Math.min(
          eligibility.eligibleSubtotal,
          computeManualPromoOfferDiscount(offer, eligibility.amounts, eligibility.eligibleSubtotal),
        );
      }
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
    coupons: CouponEntity[],
    promotionOffers: PromotionCodeOffer[],
  ): Map<string, ManualPromoOffer> {
    const offersByCode = new Map<string, ManualPromoOffer>();

    for (const coupon of coupons) {
      offersByCode.set(coupon.code, couponToManualOffer(coupon));
    }

    for (const offer of promotionOffers) {
      offersByCode.set(offer.code, promotionCodeOfferToManualOffer(offer));
    }

    return offersByCode;
  }

  private buildShippingDiscountProvenance(
    offer: ManualPromoOffer,
    amounts: CouponPresentmentAmounts,
    waivedMinor: number,
    currency: string,
  ): ShippingDiscountProvenance {
    return {
      couponId: offer.id,
      code: offer.code,
      type: 'free_ship',
      appliesTo: offer.scope === 'all' ? CouponAppliesTo.ALL : CouponAppliesTo.SPECIFIC,
      appliesProductIds: [...offer.productIds],
      minOrderType: offer.minOrderType === 'order_total'
        ? CouponMinOrderType.ORDER_TOTAL
        : (offer.minOrderType === 'purchase_quantity'
          ? CouponMinOrderType.NUMBER_OF_PRODUCTS
          : CouponMinOrderType.NONE),
      minOrderValue: amounts.minOrderValue,
      minProducts: offer.minPurchaseQuantity,
      maxUses: offer.maxUses ?? 0,
      maxUsesPerUser: offer.maxUsesPerUser ?? 0,
      usesCount: offer.usesCount,
      waivedMinor,
      currency,
    };
  }

  private async loadUserUsageCounts(
    coupons: CouponEntity[],
    userId?: string,
  ): Promise<Map<string, number>> {
    if (coupons.length === 0 || !userId) {
      return new Map();
    }

    return this.couponRepository.countUsagesByUser(
      coupons.map((coupon) => coupon.id),
      userId,
    );
  }
}
