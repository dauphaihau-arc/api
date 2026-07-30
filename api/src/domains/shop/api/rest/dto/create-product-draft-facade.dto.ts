import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MARKETPLACE_CURRENCIES } from '~/platform/config/marketplace.config';
import { ProductShippingCharge } from '~/domains/product/domain/enums/product-shipping-charge.enum';
import { ProductVariantType } from '~/domains/product/domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';

export class CreateProductDraftFacadeImageDto {
  @ApiProperty({ name: 'storage_key' })
  @Expose({ name: 'storage_key' })
  @Transform(({ value, obj: source }) => value ?? source.storage_key)
  @IsString()
  @MinLength(1)
  storageKey!: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  rank!: number;
}

export class CreateProductDraftFacadeAttributeDto {
  @ApiProperty({ name: 'category_attribute_id' })
  @Expose({ name: 'category_attribute_id' })
  @Transform(({ value, obj: source }) => value ?? source.category_attribute_id)
  @IsUUID()
  categoryAttributeId!: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'selected_option_id' })
  @Expose({ name: 'selected_option_id' })
  @Transform(({ value, obj: source }) => value ?? source.selected_option_id)
  @IsUUID()
  selectedOptionId?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'selected_text' })
  @Expose({ name: 'selected_text' })
  @Transform(({ value, obj: source }) => value ?? source.selected_text)
  @IsString()
  @MaxLength(255)
  selectedText?: string;
}

export class CreateProductDraftFacadeVariantDto {
  @ApiProperty({ name: 'client_key' })
  @Expose({ name: 'client_key' })
  @Transform(({ value, obj: source }) => value ?? source.client_key)
  @IsString()
  @MinLength(1)
  clientKey!: string;

  @ApiProperty({ name: 'option_value_1' })
  @Expose({ name: 'option_value_1' })
  @Transform(({ value, obj: source }) => value ?? source.option_value_1)
  @IsString()
  @MinLength(1)
  optionValue1!: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'option_value_2' })
  @Expose({ name: 'option_value_2' })
  @Transform(({ value, obj: source }) => value ?? source.option_value_2)
  @IsString()
  @MinLength(1)
  optionValue2?: string;
}

export class CreateProductDraftFacadeInventoryDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'variant_client_key' })
  @Expose({ name: 'variant_client_key' })
  @Transform(({ value, obj: source }) => value ?? source.variant_client_key)
  @IsString()
  @MinLength(1)
  variantClientKey?: string;

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

export class CreateProductDraftFacadePricingDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'variant_client_key' })
  @Expose({ name: 'variant_client_key' })
  @Transform(({ value, obj: source }) => value ?? source.variant_client_key)
  @IsString()
  @MinLength(1)
  variantClientKey?: string;

  @ApiProperty({ name: 'amount_minor' })
  @Expose({ name: 'amount_minor' })
  @Transform(({ value, obj: source }) => value ?? source.amount_minor)
  @IsNumber()
  @Min(50)
  @Max(5_000_000)
  amountMinor!: number;

  @IsOptional()
  @ApiPropertyOptional({ name: 'original_amount_minor' })
  @Expose({ name: 'original_amount_minor' })
  @Transform(({ value, obj: source }) => value ?? source.original_amount_minor)
  @IsNumber()
  @Min(0)
  @Max(5_000_000)
  originalAmountMinor?: number;

  @IsOptional()
  @ApiPropertyOptional({ enum: MARKETPLACE_CURRENCIES })
  @IsString()
  @Length(3, 3)
  @IsIn(MARKETPLACE_CURRENCIES)
  currency?: string;
}

export class CreateProductDraftFacadeShippingDestinationDto {
  @ApiProperty({ name: 'country_code' })
  @Expose({ name: 'country_code' })
  @Transform(({ value, obj: source }) => value ?? source.country_code)
  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @ApiProperty({ name: 'delivery_time_label' })
  @Expose({ name: 'delivery_time_label' })
  @Transform(({ value, obj: source }) => value ?? source.delivery_time_label)
  @IsString()
  @MinLength(1)
  deliveryTimeLabel!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  service!: string;

  @ApiProperty({ name: 'charge_type' })
  @Expose({ name: 'charge_type' })
  @Transform(({ value, obj: source }) => value ?? source.charge_type)
  @IsEnum(ProductShippingCharge)
  chargeType!: ProductShippingCharge;
}

export class CreateProductDraftFacadeShippingDto {
  @ApiProperty({ name: 'origin_country' })
  @Expose({ name: 'origin_country' })
  @Transform(({ value, obj: source }) => value ?? source.origin_country)
  @IsString()
  @Length(2, 2)
  originCountry!: string;

  @ApiProperty({ name: 'origin_zip' })
  @Expose({ name: 'origin_zip' })
  @Transform(({ value, obj: source }) => value ?? source.origin_zip)
  @IsString()
  @MinLength(1)
  originZip!: string;

  @ApiProperty({ name: 'process_time_label' })
  @Expose({ name: 'process_time_label' })
  @Transform(({ value, obj: source }) => value ?? source.process_time_label)
  @IsString()
  @MinLength(1)
  processTimeLabel!: string;

  @ApiProperty({ type: [CreateProductDraftFacadeShippingDestinationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateProductDraftFacadeShippingDestinationDto)
  destinations!: CreateProductDraftFacadeShippingDestinationDto[];
}

export class CreateProductDraftFacadeDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'category_id' })
  @Expose({ name: 'category_id' })
  @Transform(({ value, obj: source }) => value ?? source.category_id)
  @IsUUID()
  categoryId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  description!: string;

  @ApiProperty({ name: 'who_made' })
  @Expose({ name: 'who_made' })
  @Transform(({ value, obj: source }) => value ?? source.who_made)
  @IsEnum(ProductWhoMade)
  whoMade!: ProductWhoMade;

  @IsOptional()
  @ApiPropertyOptional({ name: 'is_digital' })
  @Expose({ name: 'is_digital' })
  @Transform(({ value, obj: source }) => value ?? source.is_digital)
  @IsBoolean()
  isDigital?: boolean;

  @IsOptional()
  @ApiPropertyOptional({ name: 'non_taxable' })
  @Expose({ name: 'non_taxable' })
  @Transform(({ value, obj: source }) => value ?? source.non_taxable)
  @IsBoolean()
  nonTaxable?: boolean;

  @IsOptional()
  @ApiPropertyOptional({ name: 'variant_type' })
  @Expose({ name: 'variant_type' })
  @Transform(({ value, obj: source }) => value ?? source.variant_type)
  @IsEnum(ProductVariantType)
  variantType?: ProductVariantType;

  @IsOptional()
  @ApiPropertyOptional({ name: 'variant_group_name' })
  @Expose({ name: 'variant_group_name' })
  @Transform(({ value, obj: source }) => value ?? source.variant_group_name)
  @IsString()
  @MinLength(1)
  variantGroupName?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'variant_sub_group_name' })
  @Expose({ name: 'variant_sub_group_name' })
  @Transform(({ value, obj: source }) => value ?? source.variant_sub_group_name)
  @IsString()
  @MinLength(1)
  variantSubGroupName?: string;

  @IsOptional()
  @ApiPropertyOptional({ type: [CreateProductDraftFacadeImageDto] })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateProductDraftFacadeImageDto)
  images?: CreateProductDraftFacadeImageDto[];

  @IsOptional()
  @ApiPropertyOptional({ type: [CreateProductDraftFacadeAttributeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductDraftFacadeAttributeDto)
  attributes?: CreateProductDraftFacadeAttributeDto[];

  @IsOptional()
  @ApiPropertyOptional({ type: [CreateProductDraftFacadeVariantDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateProductDraftFacadeVariantDto)
  variants?: CreateProductDraftFacadeVariantDto[];

  @IsOptional()
  @ApiPropertyOptional({ type: [CreateProductDraftFacadeInventoryDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateProductDraftFacadeInventoryDto)
  inventory?: CreateProductDraftFacadeInventoryDto[];

  @IsOptional()
  @ApiPropertyOptional({ type: [CreateProductDraftFacadePricingDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateProductDraftFacadePricingDto)
  pricing?: CreateProductDraftFacadePricingDto[];

  @IsOptional()
  @ApiPropertyOptional({ type: CreateProductDraftFacadeShippingDto })
  @ValidateNested()
  @Type(() => CreateProductDraftFacadeShippingDto)
  shipping?: CreateProductDraftFacadeShippingDto;
}
