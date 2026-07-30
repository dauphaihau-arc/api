import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

const PUBLIC_PRODUCT_REVIEW_SORT_VALUES = [
  'all',
  'most_recent',
  'newest',
  'highest_rating',
  'lowest_rating',
] as const;

export class ListPublicProductReviewsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Expose({ name: 'page' })
  @Transform(({ value }) => value == null ? undefined : Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 12 })
  @Expose({ name: 'limit' })
  @Transform(({ value }) => value == null ? undefined : Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    enum: PUBLIC_PRODUCT_REVIEW_SORT_VALUES,
    default: 'all',
  })
  @Expose({ name: 'sort' })
  @Transform(({ value }) => {
    if (value === 'all' || value === 'most_recent') {
      return 'newest';
    }

    return value;
  })
  @IsOptional()
  @IsIn(['newest', 'highest_rating', 'lowest_rating'])
  sort?: 'newest' | 'highest_rating' | 'lowest_rating';

  @ApiPropertyOptional({
    enum: [1, 2, 3, 4, 5],
  })
  @Expose({ name: 'rating' })
  @Transform(({ value }) => value == null || value === '' ? undefined : Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: 1 | 2 | 3 | 4 | 5;

  @ApiPropertyOptional()
  @Expose({ name: 'has_images' })
  @Transform(({ value }) => {
    if (value == null || value === '') {
      return undefined;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    return value === 'true' || value === '1';
  })
  @IsOptional()
  @IsBoolean()
  hasImages?: boolean;

  @ApiPropertyOptional()
  @Expose({ name: 'has_comment' })
  @Transform(({ value }) => {
    if (value == null || value === '') {
      return undefined;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    return value === 'true' || value === '1';
  })
  @IsOptional()
  @IsBoolean()
  hasComment?: boolean;
}
