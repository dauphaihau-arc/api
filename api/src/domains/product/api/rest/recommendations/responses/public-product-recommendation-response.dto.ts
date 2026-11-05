import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  PUBLIC_PRODUCT_RECOMMENDATION_SECTION_TYPES,
  type PublicProductRecommendationSectionType,
} from '../../../../app/product.types';
import { PublicProductListItemResponseDto } from '../../storefront/responses/public-product-response.dto';

export class PublicProductRecommendationsResponseDto {
  @ApiProperty({ type: [PublicProductListItemResponseDto] })
  @Type(() => PublicProductListItemResponseDto)
  items!: PublicProductListItemResponseDto[];
}

export class PublicProductRecommendationSectionResponseDto {
  @ApiProperty({
    enum: PUBLIC_PRODUCT_RECOMMENDATION_SECTION_TYPES,
  })
  type!: PublicProductRecommendationSectionType;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: [PublicProductListItemResponseDto] })
  @Type(() => PublicProductListItemResponseDto)
  items!: PublicProductListItemResponseDto[];
}

export class PublicProductRecommendationSectionsResponseDto {
  @ApiProperty({ type: [PublicProductRecommendationSectionResponseDto] })
  @Type(() => PublicProductRecommendationSectionResponseDto)
  sections!: PublicProductRecommendationSectionResponseDto[];
}
