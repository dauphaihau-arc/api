import { Injectable } from '@nestjs/common';
import type { FxRateCache } from '~/integrations/currency/fx-rate.service';
import type { CouponPresentmentAmounts, PricedCartItem } from '../../../order/app/order.types';
import { computeCouponDiscount } from '../../../order/app/order.types';
import type { CheckoutShippingShopQuote } from '../../../shipping/app/shipping.types';
import { CouponIneligibleReason } from '../../domain/enums/coupon-ineligible-reason.enum';
import { CouponType } from '../../domain/enums/coupon-type.enum';
import { CouponVisibility } from '../../domain/enums/coupon-visibility.enum';
import type { CouponEntity } from '../../infra/persistence/entities/coupon.entity';
import {
  CouponCodeNotFoundError,
  CouponCodeNotApplicableError,
  CouponCurrencyConversionUnavailableError,
} from '../errors/coupon-app.error';
import { CouponRepository } from '../ports/coupon.repository';
import { SaleProjectionReader } from '../../../promotion/app/ports/sale-projection.reader';
import type {
  AddPromoCouponInput,
  AppliedCoupon,
  ApplyCouponToCartInput,
  CouponPricedShop,
  DiscoverableCoupon,
  ListDiscoverableCouponsInput,
} from '../types/coupon.types';
import { priceItems } from './auto-sale-item-pricing';
import {
  assertManualCouponSlots,
  evaluateCoupon,
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
  ) {}

  async applyToCart(input: ApplyCouponToCartInput): Promise<CouponPricedShop[]> {
    const shopAdjustments = new Map(
      (input.shopAdjustments ?? []).map((entry) => [entry.shopId, entry]),
    );

    const selectedItems = input.cart.items.filter((item) => item.isSelectOrder);
    const shopIds = [...new Set(selectedItems.map((item) => item.inventory.shopId))];
    const coupons = await this.couponRepository.findByShopIds(shopIds);
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
    const coupons = await this.couponRepository.findByShopIds([input.shopId]);
    const couponsByCode = new Map(coupons.map((coupon) => [coupon.code, coupon]));
    const requested = couponsByCode.get(requestedCode);

    if (!requested) {
      throw new CouponCodeNotFoundError(requestedCode);
    }
    if (requested.isAutoSale) {
      throw new CouponCodeNotApplicableError(requestedCode);
    }

    const nextCodes = nextPromoCodeSelection({
      requested,
      retainedCodes: input.retainedPromoCodes,
      couponsByCode,
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
    // code has a Coupon and its type can be read without a second query.
    return nextCodes.map((code) => {
      const coupon = couponsByCode.get(code);
      if (!coupon) {
        throw new CouponCodeNotFoundError(code);
      }

      return { code: coupon.code, type: coupon.type };
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
    const couponsByCode = new Map(
      input.coupons
        .filter((coupon) => coupon.shop.id === shopId)
        .map((coupon) => [coupon.code, coupon]),
    );
    const requestedCoupons: CouponEntity[] = [];

    for (const code of promoCodes) {
      const coupon = couponsByCode.get(code);
      if (!coupon) {
        if (validatePromoCodes) throw new CouponCodeNotFoundError(code);
        continue;
      }
      if (coupon.isAutoSale) {
        if (validatePromoCodes) throw new CouponCodeNotApplicableError(code);
        continue;
      }
      requestedCoupons.push(coupon);
    }

    assertManualCouponSlots(requestedCoupons);

    const promoCoupons: CouponEntity[] = [];
    let totalDiscount = 0;
    let freeShipCoupon: CouponEntity | undefined;
    let freeShipAmounts: CouponPresentmentAmounts | undefined;

    for (const coupon of requestedCoupons) {
      // The coupon's own currency is never assumed to be the checkout
      // currency: without a rate the selection fails rather than charge a
      // wrong total or silently drop the discount the buyer chose.
      const amounts = await this.couponPresentmentService.resolveForCoupon(
        coupon,
        checkoutCurrency,
        rateCache,
      );
      const eligibility = evaluateCoupon({
        coupon,
        items,
        userUsageCount: input.couponUsageCounts.get(coupon.id) ?? 0,
        amounts,
        now,
      });

      if (eligibility.outcome === 'conversion_unavailable') {
        throw new CouponCurrencyConversionUnavailableError(
          coupon.code,
          coupon.currency,
          checkoutCurrency,
        );
      }
      if (eligibility.outcome === 'ineligible') {
        if (validatePromoCodes) throw new CouponCodeNotApplicableError(coupon.code);
        continue;
      }

      promoCoupons.push(coupon);
      if (coupon.type === CouponType.FREE_SHIP) {
        freeShipCoupon = coupon;
        freeShipAmounts = eligibility.amounts;
      }
      else {
        totalDiscount += Math.min(
          eligibility.eligibleSubtotal,
          computeCouponDiscount(coupon, eligibility.amounts, eligibility.eligibleSubtotal),
        );
      }
    }

    const shippingDiscountMinor = input.shippingShop && freeShipCoupon
      ? input.shippingShop.charge.totalMinor
      : 0;
    const shippingDiscounts = shippingDiscountMinor > 0 && freeShipCoupon && freeShipAmounts
      ? [{
        couponId: freeShipCoupon.id,
        code: freeShipCoupon.code,
        type: 'free_ship' as const,
        appliesTo: freeShipCoupon.appliesTo,
        appliesProductIds: [...freeShipCoupon.appliesProductIds],
        minOrderType: freeShipCoupon.minOrderType,
        minOrderValue: freeShipAmounts.minOrderValue,
        minProducts: freeShipCoupon.minProducts,
        maxUses: freeShipCoupon.maxUses,
        maxUsesPerUser: freeShipCoupon.maxUsesPerUser,
        usesCount: freeShipCoupon.usesCount,
        waivedMinor: shippingDiscountMinor,
        currency: checkoutCurrency,
      }]
      : [];

    return {
      shopId,
      items,
      subtotal,
      totalDiscount,
      promoCoupons,
      shippingDiscountMinor,
      shippingDiscounts,
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
