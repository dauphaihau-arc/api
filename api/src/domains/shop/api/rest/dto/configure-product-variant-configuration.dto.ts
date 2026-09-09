import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, MinLength, ValidateNested, 
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductVariantLifecycleState } from '~/domains/product/domain/enums/product-variant-lifecycle-state.enum';

function blankStringToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim().length === 0) return undefined;
  return value;
}

export class ProductOptionValueConfigurationDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @Expose({ name: 'client_ref' })
  @Transform(({ value, obj }) => blankStringToUndefined(value ?? obj.client_ref))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  clientRef?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  value!: string;

  @IsNumber()
  @Min(1)
  position!: number;
}

export class ProductOptionConfigurationDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @Expose({ name: 'client_ref' })
  @Transform(({ value, obj }) => blankStringToUndefined(value ?? obj.client_ref))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  clientRef?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsNumber()
  @Min(1)
  position!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductOptionValueConfigurationDto)
  values!: ProductOptionValueConfigurationDto[];
}

export class ProductVariantSelectionConfigurationDto {
  @IsOptional()
  @Expose({ name: 'option_id' })
  @Transform(({ value, obj }) => value ?? obj.option_id)
  @IsUUID()
  optionId?: string;

  @IsOptional()
  @Expose({ name: 'option_ref' })
  @Transform(({ value, obj }) => blankStringToUndefined(value ?? obj.option_ref))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  optionRef?: string;

  @IsOptional()
  @Expose({ name: 'value_id' })
  @Transform(({ value, obj }) => value ?? obj.value_id)
  @IsUUID()
  valueId?: string;

  @IsOptional()
  @Expose({ name: 'value_ref' })
  @Transform(({ value, obj }) => blankStringToUndefined(value ?? obj.value_ref))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  valueRef?: string;
}

export class ProductVariantInventoryConfigurationDto {
  @IsOptional()
  @Expose({ name: 'on_hand_quantity' })
  @Transform(({ value, obj }) => value ?? obj.on_hand_quantity)
  @IsNumber()
  @Min(0)
  @Max(999)
  onHandQuantity?: number;

  @IsOptional()
  @Expose({ name: 'expected_on_hand_version' })
  @Transform(({ value, obj }) => value ?? obj.expected_on_hand_version)
  @IsNumber()
  @Min(1)
  expectedOnHandVersion?: number;

  @IsOptional()
  @Transform(({ value }) => blankStringToUndefined(value))
  @IsString()
  @MaxLength(255)
  sku?: string | null;

  @IsOptional()
  @Expose({ name: 'amount_minor' })
  @Transform(({ value, obj }) => value ?? obj.amount_minor)
  @IsNumber()
  @Min(50)
  @Max(5_000_000)
  amountMinor?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}

export class ProductVariantConfigurationDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @Expose({ name: 'client_ref' })
  @Transform(({ value, obj }) => blankStringToUndefined(value ?? obj.client_ref))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  clientRef?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantSelectionConfigurationDto)
  selections!: ProductVariantSelectionConfigurationDto[];

  @Expose({ name: 'lifecycle_state' })
  @Transform(({ value, obj }) => value ?? obj.lifecycle_state)
  @IsEnum(ProductVariantLifecycleState)
  lifecycleState!: ProductVariantLifecycleState;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductVariantInventoryConfigurationDto)
  inventory?: ProductVariantInventoryConfigurationDto;
}

export class ConfigureProductVariantConfigurationDto {
  @ApiProperty({ name: 'product_version' })
  @Expose({ name: 'product_version' })
  @Transform(({ value, obj }) => value ?? obj.product_version)
  @IsNumber()
  @Min(1)
  productVersion!: number;

  @ApiProperty({ type: [ProductOptionConfigurationDto] })
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => ProductOptionConfigurationDto)
  options!: ProductOptionConfigurationDto[];

  @ApiProperty({ type: [ProductVariantConfigurationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantConfigurationDto)
  variants!: ProductVariantConfigurationDto[];

  @ApiPropertyOptional({ name: 'removed_variant_ids' })
  @Expose({ name: 'removed_variant_ids' })
  @Transform(({ value, obj }) => value ?? obj.removed_variant_ids ?? [])
  @IsArray()
  @IsUUID(undefined, { each: true })
  removedVariantIds: string[] = [];

  @ApiPropertyOptional({ name: 'restore_variant_ids' })
  @Expose({ name: 'restore_variant_ids' })
  @Transform(({ value, obj }) => value ?? obj.restore_variant_ids ?? [])
  @IsArray()
  @IsUUID(undefined, { each: true })
  restoreVariantIds: string[] = [];
}
