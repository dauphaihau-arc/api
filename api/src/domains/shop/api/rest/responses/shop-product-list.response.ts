import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ShopProductAttributeResponseDto,
  ShopProductOptionResponseDto,
  ShopProductVariantSelectionResponseDto,
} from './shop-product-detail.response';

export class ShopProductListImageVariantResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  variant!: string;

  @ApiProperty({ required: false })
  image_url?: string;

  @ApiProperty({ required: false })
  width?: number;

  @ApiProperty({ required: false })
  height?: number;

  @ApiProperty({ required: false })
  format?: string;
}

export class ShopProductListImageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ required: false })
  image_url?: string;

  @ApiProperty()
  rank!: number;

  @ApiProperty()
  variant_status!: string;

  @ApiProperty({ required: false })
  variant_error?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  variants_generated_at?: Date;

  @ApiProperty({ type: [ShopProductListImageVariantResponseDto], required: false })
  @Type(() => ShopProductListImageVariantResponseDto)
  variants?: ShopProductListImageVariantResponseDto[];
}

export class ShopProductListVariantResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: [ShopProductVariantSelectionResponseDto] })
  @Type(() => ShopProductVariantSelectionResponseDto)
  selections!: ShopProductVariantSelectionResponseDto[];

  @ApiProperty()
  rank!: number;
}

export class ShopProductListInventoryResponseDto {
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
  amount_minor?: number;

  @ApiProperty({ required: false })
  original_amount_minor?: number;

  @ApiProperty({ required: false })
  currency?: string;
}

export class ShopProductListItemResponseDto {
  @ApiProperty({ description: 'Product public id (prod_…).' })
  id!: string;

  @ApiProperty({ description: 'Shop public id (shop_…).' })
  shop_id!: string;

  @ApiProperty({ required: false })
  category_id?: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty({ required: false })
  image_url?: string;

  @ApiProperty()
  who_made!: string;

  @ApiProperty()
  is_digital!: boolean;

  @ApiProperty()
  non_taxable!: boolean;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty({ type: [ShopProductListImageResponseDto] })
  @Type(() => ShopProductListImageResponseDto)
  images!: ShopProductListImageResponseDto[];

  @ApiProperty({ type: [ShopProductAttributeResponseDto] })
  @Type(() => ShopProductAttributeResponseDto)
  attributes!: ShopProductAttributeResponseDto[];

  @ApiProperty({ type: [ShopProductOptionResponseDto] })
  @Type(() => ShopProductOptionResponseDto)
  options!: ShopProductOptionResponseDto[];

  @ApiProperty({ type: [ShopProductListVariantResponseDto] })
  @Type(() => ShopProductListVariantResponseDto)
  variants!: ShopProductListVariantResponseDto[];

  @ApiProperty({ type: [ShopProductListInventoryResponseDto] })
  @Type(() => ShopProductListInventoryResponseDto)
  inventory!: ShopProductListInventoryResponseDto[];
}

export class ShopProductListMetaResponseDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  total_pages!: number;

  @ApiProperty()
  has_next_page!: boolean;

  @ApiProperty()
  has_previous_page!: boolean;
}

export class ShopProductStateCountsResponseDto {
  @ApiProperty()
  all!: number;

  @ApiProperty()
  active!: number;

  @ApiProperty()
  inactive!: number;

  @ApiProperty()
  draft!: number;
}

export class ShopProductListResponseDto {
  @ApiProperty({ type: [ShopProductListItemResponseDto] })
  @Type(() => ShopProductListItemResponseDto)
  items!: ShopProductListItemResponseDto[];

  @ApiProperty({ type: ShopProductListMetaResponseDto })
  @Type(() => ShopProductListMetaResponseDto)
  meta!: ShopProductListMetaResponseDto;

  @ApiProperty({ type: ShopProductStateCountsResponseDto })
  @Type(() => ShopProductStateCountsResponseDto)
  state_counts!: ShopProductStateCountsResponseDto;
}

export type ShopProductListResponse = {
  items: Array<{
    id: string;
    shop_id: string;
    category_id?: string;
    title: string;
    slug: string;
    description: string;
    state: string;
    image_url?: string;
    who_made: string;
    is_digital: boolean;
    non_taxable: boolean;
    tags: string[];
    images: Array<{
      id: string;
      image_url?: string;
      rank: number;
      variant_status: string;
      variant_error?: string;
      variants_generated_at?: Date;
      variants?: Array<{
        id: string;
        variant: string;
        image_url?: string;
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
    }>;
  }>;
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
  state_counts: {
    all: number;
    active: number;
    inactive: number;
    draft: number;
  };
};
