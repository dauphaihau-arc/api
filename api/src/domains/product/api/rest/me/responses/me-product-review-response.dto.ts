import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ProductReviewStatus } from '~/domains/product/domain/enums/product-review-status.enum';
import { PublicProductImageVariantResponseDto } from '../../storefront/responses/public-product-response.dto';

export class MyProductReviewProductResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  shop_slug!: string;
}

export class MyProductReviewImageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty({ required: false })
  size_bytes?: number;

  @ApiProperty()
  rank!: number;

  @ApiProperty({ required: false })
  variant_status?: string;

  @ApiProperty({ required: false })
  variant_error?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  variants_generated_at?: Date;

  @ApiPropertyOptional({
    type: Object,
    description: 'Named image variants keyed by variant name.',
  })
  variants?: Record<string, PublicProductImageVariantResponseDto>;
}

export class MyProductReviewResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  order_id!: string;

  @ApiProperty()
  order_item_id!: string;

  @ApiProperty({ type: MyProductReviewProductResponseDto })
  @Type(() => MyProductReviewProductResponseDto)
  product!: MyProductReviewProductResponseDto;

  @ApiProperty()
  rating!: number;

  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty({ required: false })
  body?: string;

  @ApiProperty({ type: [MyProductReviewImageResponseDto] })
  @Type(() => MyProductReviewImageResponseDto)
  images!: MyProductReviewImageResponseDto[];

  @ApiProperty({ enum: ProductReviewStatus })
  status!: ProductReviewStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;
}
