import type { MarketplaceCurrency } from '~/platform/config/marketplace.config';
import type { PromotionBenefitType } from '../../promotion/domain/enums/promotion-benefit-type.enum';
import type { PromotionMinOrderType } from '../../promotion/domain/enums/promotion-min-order-type.enum';
import type { PromotionProductScope } from '../../promotion/domain/enums/promotion-product-scope.enum';
import type { PromotionStatus } from '../../promotion/domain/enums/promotion-status.enum';
import type { PromotionVisibility } from '../../promotion/domain/enums/promotion-visibility.enum';

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

export interface ShopSaleSummary {
  id: string;
  publicId: string;
  shopId: string;
  shopPublicId: string;
  name: string;
  percentOff: number;
  productScope: PromotionProductScope;
  productIds: string[];
  productPublicIds: string[];
  currency: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status: PromotionStatus;
  cancelledAt: Date | null;
  endedAt: Date | null;
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
  publicId: string;
  shopId: string;
  shopPublicId: string;
  name: string;
  code: string;
  benefitType: PromotionBenefitType;
  percentOff: number;
  amountOff: number | null;
  currency: string;
  visibility: PromotionVisibility;
  productScope: PromotionProductScope;
  productIds: string[];
  productPublicIds: string[];
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
  status: PromotionStatus;
  cancelledAt: Date | null;
  endedAt: Date | null;
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

/**
 * Operator-facing directory query. Kept apart from `ShopSummary` so seller
 * reads never grow the owner's email.
 */
export interface ListAdminShopsQuery {
  page: number;
  limit: number;
  search?: string;
}

export interface AdminShopListRow {
  /** Shop public id (shop_…). */
  id: string;
  shopName: string;
  slug: string;
  status: string;
  currency: MarketplaceCurrency;
  /** Products in the shop, all statuses included. */
  productCount: number;
  ownerEmail: string;
  /** Owner's display name; null when the account has none. */
  ownerName: string | null;
  /** Shop creation instant. */
  createdAt: Date;
}

export interface AdminShopListResult {
  results: AdminShopListRow[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}
