import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductInventoryRowDto {
  @IsOptional()
  @IsUUID()
  productVariantId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  sku?: string;

  @IsNumber()
  @Min(0)
  @Max(999)
  stock!: number;

  @IsNumber()
  @Min(0.5)
  @Max(50000)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50000)
  salePrice?: number;
}

export class SetProductInventoryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductInventoryRowDto)
  inventory!: ProductInventoryRowDto[];
}
