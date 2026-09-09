import type { PublicProductDetail } from '../../../../app/product.types';

export type PublicProductDetailResponse = {
  id: string;
  shop: {
    id: string;
    public_id?: string;
    shop_name: string;
    slug: string;
  };
  category_id?: string;
  category_path?: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  title: string;
  slug: string;
  description: string;
  who_made: PublicProductDetail['whoMade'];
  is_digital: boolean;
  stock_notice_threshold: number;
  review_summary: {
    average: number;
    count: number;
  };
  images: Array<{
    id: string;
    url: string;
    rank: number;
    variant_status: string;
    variant_error?: string;
    variants_generated_at?: Date;
    variants?: Record<string, {
      url: string;
      width?: number;
      height?: number;
      format?: string;
    }>;
  }>;
  options: Array<{
    id: string;
    name: string;
    position: number;
    values: Array<{
      id: string;
      value: string;
      position: number;
    }>;
  }>;
  variants: Array<{
    id: string;
    selections: Array<{
      option_id: string;
      value_id: string;
    }>;
    image_url?: string;
    rank: number;
  }>;
  inventory: Array<{
    id: string;
    product_variant_id?: string;
    sku?: string;
    stock: number;
    on_hand_quantity: number;
    reserved_quantity: number;
    available_quantity: number;
    on_hand_version: number;
    shortage: number;
    amount_minor?: number;
    original_amount_minor?: number;
    currency?: string;
    auto_sale?: {
      coupon_id: string;
      percent_off: number;
    };
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
