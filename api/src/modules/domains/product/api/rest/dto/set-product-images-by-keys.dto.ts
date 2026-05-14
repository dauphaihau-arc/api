import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductImageByKeyDto {
  @IsString()
  @MinLength(1)
  storageKey!: string;

  @IsNumber()
  @Min(1)
  rank!: number;
}

export class SetProductImagesByKeysDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ProductImageByKeyDto)
  images!: ProductImageByKeyDto[];
}
