import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { fromMinorUnits, toMinorUnits } from '../../../../platform/money/money';
import type { CartSnapshot } from '../../../cart/app/cart.types';
import type {
  PricedCartItem,
  ShippingDiscountProvenance,
  ShopAdjustmentInput,
} from '../../../order/app/order.types';
import {
  computeCouponDiscount,
  couponAppliesToProduct,
  couponMeetsMinimum,
  isCouponActive,
} from '../../../order/app/order.types';
import { CheckoutShippingShopQuote } from '../../../shipping/app/shipping.types';
import { CouponType } from '../../domain/enums/coupon-type.enum';
import { CouponUsageEntity } from '../../infra/persistence/entities/coupon-usage.entity';
import { CouponEntity } from '../../infra/persistence/entities/coupon.entity';

export class CouponCodeNotFoundError extends Error {
  constructor(code: string) {
    super(`Coupon code ${code} not found`);
  }
}

export class CouponCodeNotApplicableError extends Error {
  constructor(code: string) {
    super(`Coupon code ${code} cannot be applied to this cart`);
  }
}

export interface CouponPricedShop {
  shopId: string;
  items: PricedCartItem[];
  subtotal: number;
  totalDiscount: number;
  promoCoupons: CouponEntity[];
  shippingDiscountMinor: number;
  shippingDiscounts: ShippingDiscountProvenance[];
}

@Injectable()
export class CouponPricingService {
  constructor(private readonly entityManager: EntityManager) {}

  async applyToCart(input: {
    userId?: string;
    cart: CartSnapshot;
    shopAdjustments?: ShopAdjustmentInput[];
    validatePromoCodes?: boolean;
    checkoutCurrency: string;
    shippingShops?: CheckoutShippingShopQuote[];
  }): Promise<CouponPricedShop[]> {
    const shopAdjustments = new Map(
      (input.shopAdjustments ?? []).map((entry) => [entry.shopId, entry]),
    );

    const selectedItems = input.cart.items.filter((item) => item.isSelectOrder);
    const shopIds = [...new Set(selectedItems.map((item) => item.inventory.shopId))];
    const couponRepository = this.entityManager.fork().getRepository(CouponEntity);
    const usageRepository = this.entityManager.fork().getRepository(CouponUsageEntity);

    const coupons = shopIds.length > 0
      ? await couponRepository.find({ shop: { $in: shopIds } })
      : [];

    const couponUsageCounts = new Map<string, number>();

    if (coupons.length > 0 && input.userId) {
      const usages = await usageRepository.find({
        coupon: { $in: coupons.map((coupon) => coupon.id) },
        user: input.userId,
      });
      for (const usage of usages) {
        couponUsageCounts.set(
          usage.coupon.id,
          (couponUsageCounts.get(usage.coupon.id) ?? 0) + 1,
        );
      }
    }

    const autoCouponsByShop = new Map<string, CouponEntity[]>();
    for (const coupon of coupons) {
      if (coupon.isAutoSale) {
        const existing = autoCouponsByShop.get(coupon.shop.id) ?? [];
        existing.push(coupon);
        autoCouponsByShop.set(coupon.shop.id, existing);
      }
    }

    const pricedItemsByShop = new Map<string, PricedCartItem[]>();
    for (const item of selectedItems) {
      const snapshotPrice = item.inventory.pricing;
      const pricingCurrency = snapshotPrice.currency;
      const baseUnitPriceMinor = snapshotPrice.originalAmountMinor ?? snapshotPrice.amountMinor;
      const baseUnitPrice = fromMinorUnits(baseUnitPriceMinor, pricingCurrency);

      const saleUnitPrice = snapshotPrice.originalAmountMinor != null
        ? fromMinorUnits(snapshotPrice.amountMinor, pricingCurrency)
        : undefined;

      const activeAutoCoupons = (autoCouponsByShop.get(item.inventory.shopId) ?? [])
        .filter((coupon) =>
          isCouponActive(coupon)
          && couponAppliesToProduct(coupon, item.inventory.productId),
        );

      let autoSaleCoupon: CouponEntity | undefined;
      let bestPrice = saleUnitPrice ?? baseUnitPrice;
      let effectiveUnitPriceMinor = snapshotPrice.amountMinor;

      for (const coupon of activeAutoCoupons) {
        if (coupon.type !== CouponType.PERCENTAGE) continue;
        const discounted = baseUnitPrice * (1 - (coupon.percentOff / 100));

        if (discounted < bestPrice) {
          bestPrice = discounted;
          autoSaleCoupon = coupon;
          effectiveUnitPriceMinor = toMinorUnits(discounted, pricingCurrency);
        }
      }

      const pricedItem: PricedCartItem = {
        cartItemId: item.id,
        inventoryId: item.inventory.inventoryId,
        productId: item.inventory.productId,
        shopId: item.inventory.shopId,
        shopName: item.inventory.shopName,
        shopSlug: item.inventory.shopSlug,
        title: item.inventory.title,
        imageUrl: item.inventory.imageUrl,
        imageReference: item.inventory.imageReference,
        quantity: item.quantity,
        sku: item.inventory.sku,
        currency: pricingCurrency,
        sourceCurrency: snapshotPrice.sourceCurrency,
        sourceUnitPriceMinor: snapshotPrice.sourceUnitAmountMinor,
        unitPriceMinor: effectiveUnitPriceMinor,
        originalAmountMinor: baseUnitPriceMinor,
        price: baseUnitPrice,
        salePrice: bestPrice < baseUnitPrice ? bestPrice : saleUnitPrice,
        baseUnitPrice,
        effectiveUnitPrice: bestPrice,
        sourcePriceId: snapshotPrice.sourcePriceId,
        sourceType: snapshotPrice.sourceType,
        marketCode: snapshotPrice.marketCode,
        fxRate: snapshotPrice.fxRate,
        fxSource: snapshotPrice.fxSource,
        fxEffectiveAt: snapshotPrice.fxEffectiveAt,
        fxSourceTimestamp: snapshotPrice.fxSourceTimestamp,
        autoSaleCoupon,
      };
      const shopItems = pricedItemsByShop.get(pricedItem.shopId) ?? [];
      shopItems.push(pricedItem);
      pricedItemsByShop.set(pricedItem.shopId, shopItems);
    }

    const result: CouponPricedShop[] = [];
    for (const [shopId, items] of pricedItemsByShop.entries()) {
      const subtotal = items.reduce(
        (sum, item) => sum + (item.effectiveUnitPrice * item.quantity),
        0,
      );
      const promoCodes = shopAdjustments.get(shopId)?.promoCodes ?? [];
      const promoCoupons: CouponEntity[] = [];
      let totalDiscount = 0;

      for (const code of promoCodes) {
        const coupon = coupons.find((entry) => entry.shop.id === shopId && entry.code === code);
        if (!coupon) {
          if (input.validatePromoCodes) throw new CouponCodeNotFoundError(code);
          continue;
        }
        if (!isCouponActive(coupon) || coupon.isAutoSale) {
          if (input.validatePromoCodes) throw new CouponCodeNotApplicableError(code);
          continue;
        }
        if ((couponUsageCounts.get(coupon.id) ?? 0) >= coupon.maxUsesPerUser) {
          if (input.validatePromoCodes) throw new CouponCodeNotApplicableError(code);
          continue;
        }

        const eligibleItems = items.filter((item) => couponAppliesToProduct(coupon, item.productId));
        const eligibleSubtotal = eligibleItems.reduce(
          (sum, item) => sum + (item.effectiveUnitPrice * item.quantity),
          0,
        );
        const eligibleQuantity = eligibleItems.reduce((sum, item) => sum + item.quantity, 0);
        if (!couponMeetsMinimum(coupon, eligibleSubtotal, eligibleQuantity)) {
          if (input.validatePromoCodes) throw new CouponCodeNotApplicableError(code);
          continue;
        }
        if (coupon.usesCount >= coupon.maxUses) {
          if (input.validatePromoCodes) throw new CouponCodeNotApplicableError(code);
          continue;
        }

        promoCoupons.push(coupon);
        if (coupon.type !== CouponType.FREE_SHIP) {
          totalDiscount += Math.min(eligibleSubtotal, computeCouponDiscount(coupon, eligibleSubtotal));
        }
      }

      const shipping = input.shippingShops?.find((entry) => entry.shopId === shopId);
      const freeShipCoupon = promoCoupons.find((coupon) => coupon.type === CouponType.FREE_SHIP);
      const shippingDiscountMinor = shipping && freeShipCoupon
        ? shipping.charge.totalMinor
        : 0;
      const shippingDiscounts: ShippingDiscountProvenance[] = shippingDiscountMinor > 0 && freeShipCoupon
        ? [{
          couponId: freeShipCoupon.id,
          code: freeShipCoupon.code,
          type: 'free_ship',
          appliesTo: freeShipCoupon.appliesTo,
          appliesProductIds: [...freeShipCoupon.appliesProductIds],
          minOrderType: freeShipCoupon.minOrderType,
          minOrderValue: freeShipCoupon.minOrderValue,
          minProducts: freeShipCoupon.minProducts,
          maxUses: freeShipCoupon.maxUses,
          maxUsesPerUser: freeShipCoupon.maxUsesPerUser,
          usesCount: freeShipCoupon.usesCount,
          waivedMinor: shippingDiscountMinor,
          currency: input.checkoutCurrency,
        }]
        : [];

      result.push({
        shopId,
        items,
        subtotal,
        totalDiscount,
        promoCoupons,
        shippingDiscountMinor,
        shippingDiscounts,
      });
    }
    return result;
  }
}
