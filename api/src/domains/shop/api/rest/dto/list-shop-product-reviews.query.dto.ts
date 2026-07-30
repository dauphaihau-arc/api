import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum, IsIn, IsOptional, IsUUID, Max, Min, 
} from 'class-validator';
import {
  SHOP_PRODUCT_REVIEW_LIST_DEFAULT_LIMIT,
  SHOP_PRODUCT_REVIEW_LIST_DEFAULT_PAGE,
  SHOP_PRODUCT_REVIEW_LIST_MAX_LIMIT,
} from '~/domains/product/app/product.types';
import { ProductReviewStatus } from '~/domains/product/domain/enums/product-review-status.enum';

export class ListShopProductReviewsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page: number = SHOP_PRODUCT_REVIEW_LIST_DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(SHOP_PRODUCT_REVIEW_LIST_MAX_LIMIT)
  limit: number = SHOP_PRODUCT_REVIEW_LIST_DEFAULT_LIMIT;

  @IsOptional()
  @IsEnum(ProductReviewStatus)
  status?: ProductReviewStatus;

  @IsOptional()
  @Expose({ name: 'product_id' })
  @Transform(({ value, obj: source }) => value ?? source.product_id)
  @IsUUID()
  productId?: string;

  @IsOptional()
  @Expose({ name: 'sort' })
  @Transform(({ value }) => value ?? 'newest')
  @IsIn(['newest', 'oldest', 'highest_rating', 'lowest_rating'])
  sort: 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating' = 'newest';
}
