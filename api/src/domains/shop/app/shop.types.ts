import type { MarketplaceCurrency } from '~/platform/config/marketplace.config';
import type { PromotionBenefitType } from '../../promotion/domain/enums/promotion-benefit-type.enum';
import type { PromotionMinOrderType } from '../../promotion/domain/enums/promotion-min-order-type.enum';

export interface ShopSummary {
  id: string;
  publicId?: string;
  ownerUserId: string;
  shopName: string;
  slug: string;
  status: string;
  currency: MarketplaceCurrency;
  /** IANA timezone new Sale schedules default to. */
  timezone: string;
}

export interface ShopCouponSummary {
  id: string;
  shopId: string;
  code: string;
  type: string;
  /**
   * Currency the `amountOff` and `minOrderValue` amounts are denominated in.
   * It is the owning Shop's currency snapshotted at Coupon creation.
   */
  currency: string;
  appliesTo: string;
  appliesProductIds: string[];
  amountOff: number;
  percentOff: number;
  startDate: Date;
  endDate: Date;
  maxUses: number;
  maxUsesPerUser: number;
  usesCount: number;
  minOrderType: string;
  minOrderValue: number;
  minProducts: number;
  isActive: boolean;
  isAutoSale: boolean;
  visibility: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShopCouponListResult {
  results: ShopCouponSummary[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
  typeCounts: {
    all: number;
    promo_code: number;
    sale: number;
  };
}

export interface ShopSaleSummary {
  id: string;
  shopId: string;
  name: string;
  percentOff: number;
  productScope: string;
  productIds: string[];
  currency: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status: string;
  cancelledAt?: Date | null;
  endedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShopSaleListResult {
  results: ShopSaleSummary[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export interface ShopPromoCodeSummary {
  id: string;
  shopId: string;
  name: string;
  code: string;
  benefitType: PromotionBenefitType;
  percentOff: number;
  amountOff: number | null;
  currency: string;
  visibility: string;
  productScope: string;
  productIds: string[];
  minOrderType: PromotionMinOrderType;
  minOrderValue: number;
  minPurchaseQuantity: number;
  maxRedemptions: number | null;
  maxRedemptionsPerBuyer: number | null;
  redemptionCount: number;
  /**
   * Whether the code's allowance is spent. Kept separate from `status`:
   * exhaustion is an allowance indicator, never a lifecycle state.
   */
  exhausted: boolean;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status: string;
  cancelledAt?: Date | null;
  endedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShopPromoCodeListResult {
  results: ShopPromoCodeSummary[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export interface CreateShopInput {
  ownerUserId: string;
  shopName: string;
  slug: string;
  currency: MarketplaceCurrency;
}
