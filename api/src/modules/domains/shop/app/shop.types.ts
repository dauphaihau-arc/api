export interface ShopSummary {
  id: string;
  ownerUserId: string;
  shopName: string;
  status: string;
}

export interface CreateShopInput {
  ownerUserId: string;
  shopName: string;
}
