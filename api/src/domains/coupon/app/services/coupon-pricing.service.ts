import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { fromMinorUnits, toMinorUnits } from '../../../../platform/utils/money';
import type { CartSnapshot } from '../../../cart/app/cart.types';
import type {
  PricedCartItem,
  PricedCartSummary,
  ShippingAddressInput,
  ShopAdjustmentInput,
} from '../../../order/app/order.types';
import {
  computeCouponDiscount,
  couponAppliesToProduct,
  couponMeetsMinimum,
  isCouponActive,
} from '../../../order/app/order.types';
import { CouponType } from '../../domain/enums/coupon-type.enum';
import { CouponUsageEntity } from '../../infra/persistence/entities/coupon-usage.entity';
import { CouponEntity } from '../../infra/persistence/entities/coupon.entity';
import { ProductShippingProfileEntity } from '../../../product/infra/persistence/mikro-orm/entities/product-shipping-profile.entity';

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

@Injectable()
export class CouponPricingService {
  constructor(private readonly entityManager: EntityManager) {}

  async buildPricedCartSummary(input: {
    userId?: string;
    cart: CartSnapshot;
    shopAdjustments?: ShopAdjustmentInput[];
    shippingAddress?: ShippingAddressInput;
    validatePromoCodes?: boolean;
  }): Promise<PricedCartSummary> {
    const shopAdjustments = new Map(
      (input.shopAdjustments ?? []).map((entry) => [entry.shopId, entry]),
    );
    const selectedItems = input.cart.items.filter((item) => item.isSelectOrder);
    const shopIds = [...new Set(selectedItems.map((item) => item.inventory.shopId))];
    const productIds = [...new Set(selectedItems.map((item) => item.inventory.productId))];

    const couponRepository = this.entityManager.fork().getRepository(CouponEntity);
    const usageRepository = this.entityManager.fork().getRepository(CouponUsageEntity);
    const shippingRepository = this.entityManager.fork().getRepository(ProductShippingProfileEntity);

    const coupons = shopIds.length > 0
      ? await couponRepository.find({ shop: { $in: shopIds } })
      : [];
    const couponUsageCounts = new Map<string, number>();

    if (coupons.length > 0 && input.userId) {
      const usages = await usageRepository.find({ coupon: { $in: coupons.map((coupon) => coupon.id) }, user: input.userId });
      for (const usage of usages) {
        couponUsageCounts.set(
          usage.coupon.id,
          (couponUsageCounts.get(usage.coupon.id) ?? 0) + 1,
        );
      }
    }

    const shippingProfiles = productIds.length > 0
      ? await shippingRepository.find(
        { product: { $in: productIds } },
        { populate: ['destinations'] },
      )
      : [];
    const shippingByProductId = new Map(
      shippingProfiles.map((profile) => [profile.product.id, profile]),
    );

    const pricedItemsByShop = new Map<string, PricedCartItem[]>();
    const autoCouponsByShop = new Map<string, CouponEntity[]>();

    for (const coupon of coupons) {
      if (coupon.isAutoSale) {
        const existing = autoCouponsByShop.get(coupon.shop.id) ?? [];
        existing.push(coupon);
        autoCouponsByShop.set(coupon.shop.id, existing);
      }
    }

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
        if (coupon.type !== CouponType.PERCENTAGE) {
          continue;
        }

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
        sourcePriceId: snapshotPrice?.sourcePriceId,
        sourceType: snapshotPrice?.sourceType,
        marketCode: snapshotPrice?.marketCode,
        fxRate: snapshotPrice?.fxRate,
        fxSource: snapshotPrice?.fxSource,
        fxEffectiveAt: snapshotPrice?.fxEffectiveAt,
        fxSourceTimestamp: snapshotPrice?.fxSourceTimestamp,
        autoSaleCoupon,
      };

      const existing = pricedItemsByShop.get(pricedItem.shopId) ?? [];
      existing.push(pricedItem);
      pricedItemsByShop.set(pricedItem.shopId, existing);
    }

    const shops: PricedCartSummary['shops'] = [];
    let subtotalPrice = 0;
    let totalDiscount = 0;
    let totalShippingFee = 0;

    for (const [shopId, items] of pricedItemsByShop.entries()) {
      const subtotal = items.reduce(
        (sum, item) => sum + (item.effectiveUnitPrice * item.quantity),
        0,
      );
      const adjustment = shopAdjustments.get(shopId);
      const promoCodes = adjustment?.promoCodes ?? [];
      const promoCoupons: CouponEntity[] = [];
      let shopDiscount = 0;

      for (const code of promoCodes) {
        const coupon = coupons.find((entry) => entry.shop.id === shopId && entry.code === code);

        if (!coupon) {
          if (input.validatePromoCodes) {
            throw new CouponCodeNotFoundError(code);
          }
          continue;
        }

        if (!isCouponActive(coupon) || coupon.isAutoSale) {
          if (input.validatePromoCodes) {
            throw new CouponCodeNotApplicableError(code);
          }
          continue;
        }

        if ((couponUsageCounts.get(coupon.id) ?? 0) >= coupon.maxUsesPerUser) {
          if (input.validatePromoCodes) {
            throw new CouponCodeNotApplicableError(code);
          }
          continue;
        }

        const eligibleSubtotal = items
          .filter((item) => couponAppliesToProduct(coupon, item.productId))
          .reduce((sum, item) => sum + (item.effectiveUnitPrice * item.quantity), 0);
        const eligibleQuantity = items
          .filter((item) => couponAppliesToProduct(coupon, item.productId))
          .reduce((sum, item) => sum + item.quantity, 0);

        if (!couponMeetsMinimum(coupon, eligibleSubtotal, eligibleQuantity)) {
          if (input.validatePromoCodes) {
            throw new CouponCodeNotApplicableError(code);
          }
          continue;
        }

        if (coupon.usesCount >= coupon.maxUses) {
          if (input.validatePromoCodes) {
            throw new CouponCodeNotApplicableError(code);
          }
          continue;
        }

        promoCoupons.push(coupon);
        if (coupon.type === CouponType.FREE_SHIP) {
          continue;
        }

        shopDiscount += Math.min(
          eligibleSubtotal,
          computeCouponDiscount(coupon, eligibleSubtotal),
        );
      }

      const uniqueOriginCountries = [
        ...new Set(
          items
            .map((item) => shippingByProductId.get(item.productId)?.originCountry)
            .filter((value): value is string => Boolean(value)),
        ),
      ];

      const shopShippingFee = 0;
      const total = Math.max(0, subtotal - shopDiscount + shopShippingFee);

      subtotalPrice += subtotal;
      totalDiscount += shopDiscount;
      totalShippingFee += shopShippingFee;

      shops.push({
        shopId,
        shopName: items[0]?.shopName ?? '',
        items,
        subtotal,
        totalDiscount: shopDiscount,
        totalShippingFee: shopShippingFee,
        total,
        note: adjustment?.note,
        promoCoupons,
        originCountries: uniqueOriginCountries,
      });
    }

    return {
      cart: input.cart,
      shops,
      currency: selectedItems[0]?.inventory.currency ?? 'USD',
      subtotalPrice,
      totalDiscount,
      subtotalAfterDiscount: Math.max(0, subtotalPrice - totalDiscount),
      totalShippingFee,
      totalPrice: Math.max(0, subtotalPrice - totalDiscount + totalShippingFee),
      totalSelectedQuantity: selectedItems.reduce((sum, item) => sum + item.quantity, 0),
      totalQuantity: input.cart.items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }
}
