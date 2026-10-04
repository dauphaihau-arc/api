import { Injectable } from '@nestjs/common';
import type { FxRateCache } from '~/integrations/currency/fx-rate.service';
import { allocateMinorUnits, fromMinorUnits, toMinorUnits } from '../../../../platform/money/money';
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
import { PromotionVisibility } from '../../../promotion/domain/enums/promotion-visibility.enum';
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
  manualMinOrderTypeToCoupon,
  manualTypeToCouponType,
  promotionCodeOfferToManualOffer,
} from '../types/coupon.types';
import { priceItems } from './auto-sale-item-pricing';
import {
  assertManualCouponSlots,
  computeManualPromoOfferDiscount,
  evaluateCoupon,
  evaluateManualPromoOffer,
  manualPromoOfferAppliesToProduct,
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
   * offers the buyer can see in the checkout picker. Legacy Coupons and
   * Promotion-backed Checkout Discounts are merged behind the one evaluator the
   * pricing path uses, so an offer flagged ineligible in the listing is exactly
   * the one a redemption rejects and vice versa.
   *
   * A public offer the current cart or buyer cannot redeem is still returned,
   * flagged with the first failing `CouponIneligibleReason`, so the buyer sees
   * why it is unavailable instead of the listing silently hiding it. Offers that
   * are not discoverable at all are excluded outright: `code_only` visibility,
   * automatic sale Coupons, a Promotion that has not started, ended, been
   * cancelled, or reached its global redemption limit, and any offer whose
   * money cannot be expressed in the checkout currency. A Promotion-backed code
   * wins over a legacy Coupon carrying the same normalized code, matching the
   * apply path.
   *
   * Amounts are converted into `checkoutCurrency`. Eligible offers come first,
   * then ineligible ones, each group ordered by `code`.
   */
  async listDiscoverableCoupons(
    input: ListDiscoverableCouponsInput,
  ): Promise<DiscoverableCoupon[]> {
    const selectedItems = input.cart.items.filter((item) =>
      item.isSelectOrder && item.inventory.shopId === input.shopId);

    if (selectedItems.length === 0) {
      return [];
    }

    const [coupons, promotionOffers] = await Promise.all([
      this.couponRepository.findByShopIds([input.shopId]),
      this.promotionCodeReader.findActiveCheckoutDiscounts({ shopIds: [input.shopId] }),
    ]);
    const couponUsageCounts = await this.loadUserUsageCounts(coupons, input.userId);
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
    const items = priceItems(selectedItems, coupons, salesByProductId).get(input.shopId) ?? [];
    const rateCache: FxRateCache = new Map();
    const now = new Date();

    const discoverable: DiscoverableCoupon[] = [];
    const promotionCodes = new Set(promotionOffers.map((offer) => offer.code));

    for (const offer of promotionOffers) {
      if (offer.visibility !== PromotionVisibility.PUBLIC) {
        continue;
      }

      const manualOffer = promotionCodeOfferToManualOffer(offer);
      const amounts = await this.couponPresentmentService.resolveForManualPromoOffer(
        manualOffer,
        input.checkoutCurrency,
        rateCache,
      );
      if (!amounts) {
        continue;
      }

      const eligibility = evaluateManualPromoOffer({
        offer: manualOffer,
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
          eligibility.reason === CouponIneligibleReason.NOT_STARTED
          || eligibility.reason === CouponIneligibleReason.EXPIRED
          || eligibility.reason === CouponIneligibleReason.USAGE_LIMIT_REACHED
        )
      ) {
        continue;
      }

      discoverable.push({
        code: offer.code,
        type: manualTypeToCouponType(manualOffer.type),
        appliesTo: offer.productScope === 'all'
          ? CouponAppliesTo.ALL
          : CouponAppliesTo.SPECIFIC,
        amountOff: amounts.amountOff,
        percentOff: offer.percentOff,
        minOrderType: manualMinOrderTypeToCoupon(manualOffer.minOrderType),
        minOrderValue: amounts.minOrderValue,
        minProducts: offer.minPurchaseQuantity,
        endDate: offer.endAt,
        currency: input.checkoutCurrency,
        isEligible: eligibility.outcome === 'eligible',
        ineligibleReason: eligibility.outcome === 'ineligible'
          ? eligibility.reason
          : null,
      });
    }

    for (const coupon of coupons) {
      if (
        coupon.isAutoSale
        || coupon.visibility !== CouponVisibility.PUBLIC
        || promotionCodes.has(coupon.code)
      ) {
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
        checkoutCurrency: input.checkoutCurrency,
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
    promotionUsageCounts: Map<string, number>;
    checkoutCurrency: string;
    shippingShop: CheckoutShippingShopQuote | undefined;
    validatePromoCodes: boolean;
    authenticatedUserId?: string;
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
    let productDiscountOffer: ManualPromoOffer | undefined;
    let productDiscountMinor = 0;

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
          : (input.promotionUsageCounts.get(offer.id) ?? 0),
        amounts,
        checkoutCurrency,
        now,
        shippingChargeMinor: input.shippingShop?.charge.totalMinor,
        authenticatedUserId: input.authenticatedUserId,
      });

      if (eligibility.outcome === 'conversion_unavailable') {
        throw new CouponCurrencyConversionUnavailableError(
          offer.code,
          offer.currency,
          checkoutCurrency,
        );
      }
      if (eligibility.outcome === 'ineligible') {
        if (validatePromoCodes) throw new CouponCodeNotApplicableError(offer.code, eligibility.reason);
        continue;
      }

      promoOffers.push(offer);
      if (offer.type === 'free_shipping') {
        freeShipOffer = offer;
        freeShipAmounts = eligibility.amounts;
      }
      else {
        const grantedMinor = toMinorUnits(
          Math.min(
            eligibility.eligibleSubtotal,
            computeManualPromoOfferDiscount(
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
        manualPromoOfferAppliesToProduct(appliedOffer, item.productId));

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
