import type { ProductShippingSummary } from '~/domains/product/app/product.types';

type ShipProductShipping = NonNullable<ProductShippingSummary>;

export type ShopProductDetailResponse = {
  id: string;
  public_id?: string;
  shop_id: string;
  shop_public_id?: string;
  category_id?: string;
  category?: {
    id: string;
    name: string;
  };
  title: string;
  slug: string;
  description: string;
  state: string;
  product_version: number;
  published_at?: Date;
  removed_at?: Date;
  who_made: string;
  is_digital: boolean;
  non_taxable: boolean;
  tags: string[];
  images: Array<{
    id: string;
    url: string;
    rank: number;
    variant_status: string;
    variant_error?: string;
    variants_generated_at?: Date;
    variants?: Array<{
      id: string;
      variant: string;
      url: string;
      width?: number;
      height?: number;
      format?: string;
    }>;
  }>;
  attributes: Array<{
    id: string;
    category_attribute_id: string;
    category_attribute_name: string;
    input_type: string;
    selected_option_id?: string;
    selected_option_value?: string;
    selected_text?: string;
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
    lifecycle_state?: string;
    removed_at?: Date;
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
    lifecycle_state?: string;
    removed_at?: Date;
    amount_minor?: number;
    original_amount_minor?: number;
    currency?: string;
  }>;
  shipping?: {
    profile_id: string;
    profile_name: string;
    profile_status: ShipProductShipping['status'];
    profile_version: number;
    /** Shop currency the minor-unit rate amounts are denominated in. */
    currency: string;
    ship_from_country?: string;
    ship_from_postal?: string;
    processing_time_min_days?: number;
    processing_time_max_days?: number;
    checkout_ready: boolean;
    readiness_issues: ShipProductShipping['readinessIssues'];
    rates: Array<{
      id: string;
      position: number;
      destination_scope: ShipProductShipping['rates'][number]['destinationScope'];
      destination_country?: string;
      one_item_fee_minor: number;
      additional_item_fee_minor: number;
      delivery_time_min_days?: number;
      delivery_time_max_days?: number;
    }>;
  };
};
