import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductVariantRowDto {
  @IsString()
  @MinLength(1)
  optionValue1!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  optionValue2?: string;
}

export class SetProductVariantsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantRowDto)
  variants!: ProductVariantRowDto[];
}
