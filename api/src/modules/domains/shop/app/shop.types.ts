export interface ShopSummary {
  id: string;
  publicId?: string;
  ownerUserId: string;
  shopName: string;
  status: string;
}

export interface CreateShopInput {
  ownerUserId: string;
  shopName: string;
}
