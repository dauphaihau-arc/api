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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductInventoryRowDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'product_variant_id' })
  @Expose({ name: 'product_variant_id' })
  @Transform(({ value, obj: source }) => value ?? source.product_variant_id)
  @IsUUID()
  productVariantId?: string;

  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  sku?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(999)
  stock!: number;
}

export class SetProductInventoryDto {
  @ApiProperty({ type: [ProductInventoryRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductInventoryRowDto)
  inventory!: ProductInventoryRowDto[];
}
