export type ShopProductDetailResponse = {
  id: string;
  public_id?: string;
  shop_id: string;
  shop_public_id?: string;
  category_id?: string;
  title: string;
  slug: string;
  description: string;
  state: string;
  who_made: string;
  is_digital: boolean;
  non_taxable: boolean;
  variant_type?: string;
  variant_group_name?: string;
  variant_sub_group_name?: string;
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
  variants: Array<{
    id: string;
    name: string;
    option_value_1?: string;
    option_value_2?: string;
    image_url?: string;
    rank: number;
  }>;
  inventory: Array<{
    id: string;
    product_variant_id?: string;
    sku?: string;
    stock: number;
    amount_minor?: number;
    original_amount_minor?: number;
    currency?: string;
  }>;
  shipping?: {
    id: string;
    origin_country: string;
    origin_zip: string;
    process_time_label: string;
    destinations: Array<{
      id: string;
      country_code: string;
      delivery_time_label: string;
      service: string;
      charge_type: string;
      rank: number;
    }>;
  };
};
