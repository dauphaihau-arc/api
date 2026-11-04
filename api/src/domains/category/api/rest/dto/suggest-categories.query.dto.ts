import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional, IsString, Max, Min, 
} from 'class-validator';
import { CATEGORY_SUGGESTIONS_DEFAULT_LIMIT } from '../../../app/use-cases/suggest-categories/suggest-categories.use-case';

export class SuggestCategoriesQueryDto {
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    description: 'Maximum number of category suggestions to return.',
    type: Number,
    minimum: 1,
    maximum: 20,
    default: CATEGORY_SUGGESTIONS_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(20)
  limit: number = CATEGORY_SUGGESTIONS_DEFAULT_LIMIT;
}
