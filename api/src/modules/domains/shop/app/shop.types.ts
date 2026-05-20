export interface ShopSummary {
  id: string;
  publicId?: string;
  ownerUserId: string;
  shopName: string;
  slug: string;
  status: string;
}

export interface ShopCouponSummary {
  id: string;
  shopId: string;
  code: string;
  type: string;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface ShopCouponListResult {
  results: ShopCouponSummary[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export interface CreateShopInput {
  ownerUserId: string;
  shopName: string;
  slug: string;
}
