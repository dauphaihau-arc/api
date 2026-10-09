import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ShopProductReviewImageVariantResponseDto {
  @ApiProperty()
  url!: string;

  @ApiProperty({ required: false })
  width?: number;

  @ApiProperty({ required: false })
  height?: number;

  @ApiProperty({ required: false })
  format?: string;
}

export class ShopProductReviewImageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  rank!: number;

  @ApiProperty({ required: false })
  variant_status?: string;

  @ApiProperty({ required: false })
  variant_error?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  variants_generated_at?: Date;

  @ApiProperty({ type: Object, required: false, description: 'Generated variant urls keyed by variant name.' })
  variants?: Record<string, ShopProductReviewImageVariantResponseDto>;
}

export class ShopProductReviewAuthorResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  display_name!: string;

  @ApiProperty()
  email!: string;
}

export class ShopProductReviewProductResponseDto {
  @ApiProperty({ description: 'Product public id (prod_…).' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  slug!: string;
}

export class ShopProductReviewResponseDto {
  @ApiProperty({ description: 'Internal review id.' })
  id!: string;

  @ApiProperty({ description: 'Order public id (ord_…).' })
  order_id!: string;

  @ApiProperty({ description: 'Order item internal id.' })
  order_item_id!: string;

  @ApiProperty()
  rating!: number;

  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty({ required: false })
  body?: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: [ShopProductReviewImageResponseDto] })
  @Type(() => ShopProductReviewImageResponseDto)
  images!: ShopProductReviewImageResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;

  @ApiProperty({ type: ShopProductReviewAuthorResponseDto })
  @Type(() => ShopProductReviewAuthorResponseDto)
  author!: ShopProductReviewAuthorResponseDto;

  @ApiProperty({ type: ShopProductReviewProductResponseDto })
  @Type(() => ShopProductReviewProductResponseDto)
  product!: ShopProductReviewProductResponseDto;
}

export class ShopProductReviewCountsResponseDto {
  @ApiProperty()
  all!: number;

  @ApiProperty()
  published!: number;

  @ApiProperty()
  hidden!: number;
}

export class ShopProductReviewMetaResponseDto {
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

export class ShopProductReviewListResponseDto {
  @ApiProperty({ type: [ShopProductReviewResponseDto] })
  @Type(() => ShopProductReviewResponseDto)
  items!: ShopProductReviewResponseDto[];

  @ApiProperty({ type: ShopProductReviewCountsResponseDto })
  @Type(() => ShopProductReviewCountsResponseDto)
  counts!: ShopProductReviewCountsResponseDto;

  @ApiProperty({ type: ShopProductReviewMetaResponseDto })
  @Type(() => ShopProductReviewMetaResponseDto)
  meta!: ShopProductReviewMetaResponseDto;
}

export type ShopProductReviewResponse = {
  id: string;
  order_id: string;
  order_item_id: string;
  rating: number;
  title?: string;
  body?: string;
  status: string;
  images: Array<{
    id: string;
    url: string;
    rank: number;
    variant_status?: string;
    variant_error?: string;
    variants_generated_at?: Date;
    variants?: Record<string, {
      url: string;
      width?: number;
      height?: number;
      format?: string;
    }>;
  }>;
  created_at: Date;
  updated_at: Date;
  author: {
    id: string;
    display_name: string;
    email: string;
  };
  product: {
    id: string;
    title: string;
    slug: string;
  };
};

export type ShopProductReviewListResponse = {
  items: ShopProductReviewResponse[];
  counts: {
    all: number;
    published: number;
    hidden: number;
  };
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
};
