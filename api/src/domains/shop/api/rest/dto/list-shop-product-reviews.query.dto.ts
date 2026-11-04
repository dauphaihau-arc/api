import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum, IsIn, IsOptional, Matches, Max, Min,
} from 'class-validator';
import {
  SHOP_PRODUCT_REVIEW_LIST_DEFAULT_LIMIT,
  SHOP_PRODUCT_REVIEW_LIST_DEFAULT_PAGE,
  SHOP_PRODUCT_REVIEW_LIST_MAX_LIMIT,
} from '~/domains/product/app/product.constants';
import { ProductReviewStatus } from '~/domains/product/domain/enums/product-review-status.enum';

export class ListShopProductReviewsQueryDto {
  @ApiPropertyOptional({
    description: 'One-based page number.',
    type: Number,
    minimum: 1,
    default: SHOP_PRODUCT_REVIEW_LIST_DEFAULT_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page: number = SHOP_PRODUCT_REVIEW_LIST_DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: 'Maximum number of product reviews to return.',
    type: Number,
    minimum: 1,
    maximum: SHOP_PRODUCT_REVIEW_LIST_MAX_LIMIT,
    default: SHOP_PRODUCT_REVIEW_LIST_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(SHOP_PRODUCT_REVIEW_LIST_MAX_LIMIT)
  limit: number = SHOP_PRODUCT_REVIEW_LIST_DEFAULT_LIMIT;

  @ApiPropertyOptional({ type: String, enum: ProductReviewStatus })
  @IsOptional()
  @IsEnum(ProductReviewStatus)
  status?: ProductReviewStatus;

  @ApiPropertyOptional({ type: String, pattern: '^prod_[0-9a-f]{12}$' })
  @IsOptional()
  @Expose({ name: 'product_id' })
  @Transform(({ value, obj: source }) => value ?? source.product_id)
  @Matches(/^prod_[0-9a-f]{12}$/)
  productId?: string;

  @ApiPropertyOptional({
    type: String,
    default: 'newest',
    enum: ['newest', 'oldest', 'highest_rating', 'lowest_rating'],
  })
  @IsOptional()
  @Expose({ name: 'sort' })
  @Transform(({ value }) => value ?? 'newest')
  @IsIn(['newest', 'oldest', 'highest_rating', 'lowest_rating'])
  sort: 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating' = 'newest';
}
