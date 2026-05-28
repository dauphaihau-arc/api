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
import { Expose, Transform, Type } from 'class-transformer';

export class ProductInventoryRowDto {
  @IsOptional()
  @Expose({ name: 'product_variant_id' })
  @Transform(({ value, obj: source }) => value ?? source.product_variant_id)
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
}

export class SetProductInventoryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductInventoryRowDto)
  inventory!: ProductInventoryRowDto[];
}
