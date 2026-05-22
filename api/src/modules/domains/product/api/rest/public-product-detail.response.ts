import type { PublicProductDetail } from '../../app/product.types';

export type PublicProductDetailResponse = {
  id: string;
  shop: {
    id: string;
    public_id?: string;
    shop_name: string;
    slug: string;
  };
  category_id?: string;
  title: string;
  slug: string;
  description: string;
  who_made: PublicProductDetail['whoMade'];
  is_digital: boolean;
  variant_type?: PublicProductDetail['variantType'];
  variant_group_name?: string;
  variant_sub_group_name?: string;
  images: Array<{
    id: string;
    storage_key: string;
    url?: string;
    rank: number;
    variant_status: string;
    variant_error?: string;
    variants_generated_at?: Date;
    variants?: Record<string, {
      storage_key: string;
      url?: string;
      width?: number;
      height?: number;
      format?: string;
    }>;
  }>;
  variants: Array<{
    id: string;
    name: string;
    option_value_1?: string;
    option_value_2?: string;
    image_storage_key?: string;
    rank: number;
  }>;
  inventory: Array<{
    id: string;
    product_variant_id?: string;
    sku?: string;
    stock: number;
    price: number;
    sale_price?: number;
  }>;
  shipping?: {
    origin_country: string;
    process_time_label: string;
    destinations: Array<{
      id: string;
      country_code: string;
      delivery_time_label: string;
      service: string;
      charge_type: PublicProductDetail['shipping'] extends undefined
        ? never
        : NonNullable<PublicProductDetail['shipping']>['destinations'][number]['chargeType'];
      rank: number;
    }>;
  };
};
