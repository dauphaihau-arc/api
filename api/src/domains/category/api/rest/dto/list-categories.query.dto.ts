import { Expose, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { CATEGORY_PUBLIC_ID_PATTERN } from '~/domains/category/app/category-public-id';

export class ListCategoriesQueryDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'parent_id' })
  @Expose({ name: 'parent_id' })
  @Transform(({ value, obj: source }) => value ?? source.parent_id)
  @Matches(CATEGORY_PUBLIC_ID_PATTERN)
  parentId?: string;
}
