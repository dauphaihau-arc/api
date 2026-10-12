import { Expose, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt, IsOptional, IsString, Matches, Min, MinLength, 
} from 'class-validator';
import { CATEGORY_PUBLIC_ID_PATTERN } from '~/domains/category/app/category-public-id';

export class CreateCategoryDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'parent_id' })
  @Expose({ name: 'parent_id' })
  @Transform(({ value, obj: source }) => value ?? source.parent_id)
  @Matches(CATEGORY_PUBLIC_ID_PATTERN)
  parentId?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(1)
  rank!: number;

  @IsOptional()
  @ApiPropertyOptional({ name: 'image_storage_key' })
  @Expose({ name: 'image_storage_key' })
  @Transform(({ value, obj: source }) => value ?? source.image_storage_key)
  @IsString()
  @MinLength(1)
  imageStorageKey?: string;
}
