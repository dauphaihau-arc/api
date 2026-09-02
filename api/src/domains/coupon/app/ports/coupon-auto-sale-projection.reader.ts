export interface FindBestAutoSaleForProductInput {
  shopId: string;
  productId: string;
  at?: Date;
}

export interface ProductAutoSaleProjection {
  couponId: string;
  percentOff: number;
}

export abstract class CouponAutoSaleProjectionReader {
  abstract findBestAutoSaleForProduct(
    input: FindBestAutoSaleForProductInput
  ): Promise<ProductAutoSaleProjection | undefined>;
}
