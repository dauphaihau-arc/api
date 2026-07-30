import { Type } from 'class-transformer';
import {
  IsOptional, Max, Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PUBLIC_PRODUCT_RECOMMENDATIONS_DEFAULT_LIMIT } from '../../../../app/use-cases/recommend-public-products/recommend-public-products.use-case';

export class RecommendPublicProductsQueryDto {
  @IsOptional()
  @ApiPropertyOptional()
  @Type(() => Number)
  @Min(1)
  @Max(12)
  limit: number = PUBLIC_PRODUCT_RECOMMENDATIONS_DEFAULT_LIMIT;
}
