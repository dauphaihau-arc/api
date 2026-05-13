import {
  IsInt, IsOptional, IsString, IsUUID, Min, MinLength 
} from 'class-validator';

export class CreateCategoryDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(1)
  rank!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  imageStorageKey?: string;
}
