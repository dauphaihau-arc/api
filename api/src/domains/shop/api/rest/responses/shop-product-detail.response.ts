import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { ProductShippingSummary } from '~/domains/product/app/product.types';

type ShipProductShipping = NonNullable<ProductShippingSummary>;

export class ShopProductCategoryResponseDto {
  @ApiProperty({ description: 'Category public id.' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class ShopProductImageVariantResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  variant!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty({ required: false })
  width?: number;

  @ApiProperty({ required: false })
  height?: number;

  @ApiProperty({ required: false })
  format?: string;
}

export class ShopProductImageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  rank!: number;

  @ApiProperty()
  variant_status!: string;

  @ApiProperty({ required: false })
  variant_error?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  variants_generated_at?: Date;

  @ApiProperty({ type: [ShopProductImageVariantResponseDto], required: false })
  @Type(() => ShopProductImageVariantResponseDto)
  variants?: ShopProductImageVariantResponseDto[];
}

export class ShopProductAttributeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  category_attribute_id!: string;

  @ApiProperty()
  category_attribute_name!: string;

  @ApiProperty()
  input_type!: string;

  @ApiProperty({ required: false })
  selected_option_id?: string;

  @ApiProperty({ required: false })
  selected_option_value?: string;

  @ApiProperty({ required: false })
  selected_text?: string;
}

export class ShopProductOptionValueResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  value!: string;

  @ApiProperty()
  position!: number;
}

export class ShopProductOptionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  position!: number;

  @ApiProperty({ type: [ShopProductOptionValueResponseDto] })
  @Type(() => ShopProductOptionValueResponseDto)
  values!: ShopProductOptionValueResponseDto[];
}

export class ShopProductVariantSelectionResponseDto {
  @ApiProperty()
  option_id!: string;

  @ApiProperty()
  value_id!: string;
}

export class ShopProductDetailVariantResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: [ShopProductVariantSelectionResponseDto] })
  @Type(() => ShopProductVariantSelectionResponseDto)
  selections!: ShopProductVariantSelectionResponseDto[];

  @ApiProperty({ required: false })
  image_url?: string;

  @ApiProperty()
  rank!: number;

  @ApiProperty({ required: false })
  lifecycle_state?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  removed_at?: Date;
}

export class ShopProductInventoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ required: false })
  product_variant_id?: string;

  @ApiProperty({ required: false })
  sku?: string;

  @ApiProperty()
  stock!: number;

  @ApiProperty()
  on_hand_quantity!: number;

  @ApiProperty()
  reserved_quantity!: number;

  @ApiProperty()
  available_quantity!: number;

  @ApiProperty()
  on_hand_version!: number;

  @ApiProperty()
  shortage!: number;

  @ApiProperty({ required: false })
  lifecycle_state?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  removed_at?: Date;

  @ApiProperty({ required: false })
  amount_minor?: number;

  @ApiProperty({ required: false })
  original_amount_minor?: number;

  @ApiProperty({ required: false })
  currency?: string;
}

export class ShopProductShippingRateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  position!: number;

  @ApiProperty({ enum: ['country', 'everywhere_else'] })
  destination_scope!: string;

  @ApiProperty({ required: false })
  destination_country?: string;

  @ApiProperty()
  one_item_fee_minor!: number;

  @ApiProperty()
  additional_item_fee_minor!: number;

  @ApiProperty({ required: false })
  delivery_time_min_days?: number;

  @ApiProperty({ required: false })
  delivery_time_max_days?: number;
}

export class ShopProductShippingResponseDto {
  @ApiProperty()
  profile_id!: string;

  @ApiProperty()
  profile_name!: string;

  @ApiProperty({ enum: ['draft', 'active', 'archived'] })
  profile_status!: string;

  @ApiProperty()
  profile_version!: number;

  @ApiProperty({ description: 'Shop currency the minor-unit rate amounts are denominated in.' })
  currency!: string;

  @ApiProperty({ required: false })
  ship_from_country?: string;

  @ApiProperty({ required: false })
  ship_from_postal?: string;

  @ApiProperty({ required: false })
  processing_time_min_days?: number;

  @ApiProperty({ required: false })
  processing_time_max_days?: number;

  @ApiProperty()
  checkout_ready!: boolean;

  @ApiProperty({ type: [String], description: 'Shipping profile readiness issues.' })
  readiness_issues!: ShipProductShipping['readinessIssues'];

  @ApiProperty({ type: [ShopProductShippingRateResponseDto] })
  @Type(() => ShopProductShippingRateResponseDto)
  rates!: ShopProductShippingRateResponseDto[];
}

export class ShopProductDetailResponseDto {
  @ApiProperty({ description: 'Product public id (prod_…).' })
  id!: string;

  @ApiProperty({ description: 'Shop public id (shop_…).' })
  shop_id!: string;

  @ApiProperty({ required: false })
  category_id?: string;

  @ApiProperty({ type: ShopProductCategoryResponseDto, required: false })
  @Type(() => ShopProductCategoryResponseDto)
  category?: ShopProductCategoryResponseDto;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty()
  product_version!: number;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  published_at?: Date;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  removed_at?: Date;

  @ApiProperty()
  who_made!: string;

  @ApiProperty()
  is_digital!: boolean;

  @ApiProperty()
  non_taxable!: boolean;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty({ type: [ShopProductImageResponseDto] })
  @Type(() => ShopProductImageResponseDto)
  images!: ShopProductImageResponseDto[];

  @ApiProperty({ type: [ShopProductAttributeResponseDto] })
  @Type(() => ShopProductAttributeResponseDto)
  attributes!: ShopProductAttributeResponseDto[];

  @ApiProperty({ type: [ShopProductOptionResponseDto] })
  @Type(() => ShopProductOptionResponseDto)
  options!: ShopProductOptionResponseDto[];

  @ApiProperty({ type: [ShopProductDetailVariantResponseDto] })
  @Type(() => ShopProductDetailVariantResponseDto)
  variants!: ShopProductDetailVariantResponseDto[];

  @ApiProperty({ type: [ShopProductInventoryResponseDto] })
  @Type(() => ShopProductInventoryResponseDto)
  inventory!: ShopProductInventoryResponseDto[];

  @ApiProperty({ type: ShopProductShippingResponseDto, required: false })
  @Type(() => ShopProductShippingResponseDto)
  shipping?: ShopProductShippingResponseDto;
}

export type ShopProductDetailResponse = {
  id: string;
  shop_id: string;
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
