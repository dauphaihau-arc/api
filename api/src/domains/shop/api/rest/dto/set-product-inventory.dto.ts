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
  ValidateNested,
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function optionalBlankStringToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim().length === 0) {
    return undefined;
  }

  return value;
}

export class ProductInventoryRowDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'product_variant_id' })
  @Expose({ name: 'product_variant_id' })
  @Transform(({ value, obj: source }) => value ?? source.product_variant_id)
  @IsUUID()
  productVariantId?: string;

  @IsOptional()
  @ApiPropertyOptional()
  @Transform(({ value }) => optionalBlankStringToUndefined(value))
  @IsString()
  @MinLength(1)
  sku?: string;

  @IsOptional()
  @ApiPropertyOptional({ description: 'Legacy read compatibility only; new writes should use on_hand_quantity.' })
  @IsNumber()
  @Min(0)
  @Max(999)
  stock?: number;

  @ApiProperty({ name: 'on_hand_quantity' })
  @Expose({ name: 'on_hand_quantity' })
  @Transform(({ value, obj: source }) => value ?? source.on_hand_quantity)
  @IsNumber()
  @Min(0)
  @Max(999)
  onHandQuantity!: number;

  @IsOptional()
  @ApiPropertyOptional({ name: 'expected_on_hand_version' })
  @Expose({ name: 'expected_on_hand_version' })
  @Transform(({ value, obj: source }) => value ?? source.expected_on_hand_version)
  @IsNumber()
  @Min(1)
  expectedOnHandVersion?: number;
}

export class SetProductInventoryDto {
  @ApiProperty({ type: [ProductInventoryRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductInventoryRowDto)
  inventory!: ProductInventoryRowDto[];

  @ApiProperty({ name: 'product_version' })
  @Expose({ name: 'product_version' })
  @Transform(({ value, obj: source }) => value ?? source.product_version)
  @IsNumber()
  @Min(1)
  productVersion!: number;
}
