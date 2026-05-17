import { Expose, Transform } from 'class-transformer';
import {
  IsInt, IsOptional, IsString, IsUUID, Min, MinLength 
} from 'class-validator';

export class CreateCategoryDto {
  @IsOptional()
  @Expose({ name: 'parent_id' })
  @Transform(({ value, obj: source }) => value ?? source.parent_id)
  @IsUUID()
  parentId?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(1)
  rank!: number;

  @IsOptional()
  @Expose({ name: 'image_storage_key' })
  @Transform(({ value, obj: source }) => value ?? source.image_storage_key)
  @IsString()
  @MinLength(1)
  imageStorageKey?: string;
}
