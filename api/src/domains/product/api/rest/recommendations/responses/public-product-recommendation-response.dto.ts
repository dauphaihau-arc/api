import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PublicProductListItemResponseDto } from '../../storefront/responses/public-product-response.dto';

export class PublicProductRecommendationsResponseDto {
  @ApiProperty({ type: [PublicProductListItemResponseDto] })
  @Type(() => PublicProductListItemResponseDto)
  items!: PublicProductListItemResponseDto[];
}

export class PublicProductRecommendationSectionResponseDto {
  @ApiProperty({
    enum: [
      'similar_products',
      'from_same_seller',
      'customers_also_viewed',
      'frequently_bought_together',
    ],
  })
  type!:
    | 'similar_products'
    | 'from_same_seller'
    | 'customers_also_viewed'
    | 'frequently_bought_together';

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
