import { Type } from 'class-transformer';
import { IsOptional, IsString, Max, Min } from 'class-validator';
import { CATEGORY_SEARCH_DEFAULT_LIMIT } from '../../../app/use-cases/search-categories/search-categories.use-case';

export class SearchCategoriesQueryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(20)
  limit: number = CATEGORY_SEARCH_DEFAULT_LIMIT;
}
