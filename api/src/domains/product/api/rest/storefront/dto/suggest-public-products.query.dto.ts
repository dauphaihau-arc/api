import { Type } from 'class-transformer';
import {
  IsOptional, IsString, Max, Min, 
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PUBLIC_PRODUCT_SUGGESTIONS_DEFAULT_LIMIT } from '../../../../app/use-cases/suggest-public-products/suggest-public-products.use-case';

export class SuggestPublicProductsQueryDto {
  @IsString()
  search!: string;

  @IsOptional()
  @ApiPropertyOptional()
  @Type(() => Number)
  @Min(1)
  @Max(10)
  limit: number = PUBLIC_PRODUCT_SUGGESTIONS_DEFAULT_LIMIT;
}
