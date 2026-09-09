import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductShippingCharge } from '~/domains/product/domain/enums/product-shipping-charge.enum';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import {
  ProductOptionConfigurationDto,
  ProductVariantConfigurationDto,
} from './configure-product-variant-configuration.dto';

export class CreateProductDraftFacadeImageDto {
  @ApiProperty({ name: 'storage_key' })
  @Expose({ name: 'storage_key' })
  @Transform(({ value, obj: source }) => value ?? source.storage_key)
  @IsString()
  @MinLength(1)
  storageKey!: string;

  @ApiProperty()
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
export class CreateProductDraftFacadeInventoryDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'variant_client_key' })
  @Expose({ name: 'variant_client_key' })
  @Transform(({ value, obj: source }) => value ?? source.variant_client_key)
  @IsString()
  @MinLength(1)
  variantClientKey?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'variant_id' })
  @Expose({ name: 'variant_id' })
  @Transform(({ value, obj: source }) => value ?? source.variant_id)
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sku?: string | null;

  @IsOptional()
  @ApiPropertyOptional({ name: 'stock' })
  @IsNumber()
  stock?: number;

  @IsOptional()
  @ApiPropertyOptional({ name: 'on_hand_quantity' })
  @Expose({ name: 'on_hand_quantity' })
  @Transform(({ value, obj: source }) => value ?? source.on_hand_quantity)
  @IsNumber()
  onHandQuantity?: number;

  @IsOptional()
  @ApiPropertyOptional({ name: 'expected_on_hand_version' })
  @Expose({ name: 'expected_on_hand_version' })
  @Transform(({ value, obj: source }) => value ?? source.expected_on_hand_version)
  @IsNumber()
  expectedOnHandVersion?: number;
}

export class CreateProductDraftFacadePricingDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'variant_client_key' })
  @Expose({ name: 'variant_client_key' })
  @Transform(({ value, obj: source }) => value ?? source.variant_client_key)
  @IsString()
  @MinLength(1)
  variantClientKey?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'variant_id' })
  @Expose({ name: 'variant_id' })
  @Transform(({ value, obj: source }) => value ?? source.variant_id)
  @IsUUID()
  variantId?: string;

  @ApiProperty({ name: 'amount_minor' })
  @Expose({ name: 'amount_minor' })
  @Transform(({ value, obj: source }) => value ?? source.amount_minor)
  @IsNumber()
  amountMinor!: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
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
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(11)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(21, { each: true })
  tags?: string[];

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
  @ApiPropertyOptional({ type: [ProductOptionConfigurationDto] })
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => ProductOptionConfigurationDto)
  options?: ProductOptionConfigurationDto[];

  @IsOptional()
  @ApiPropertyOptional({ type: [ProductVariantConfigurationDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantConfigurationDto)
  variants?: ProductVariantConfigurationDto[];

  @IsOptional()
  @ApiPropertyOptional({ type: [CreateProductDraftFacadeInventoryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductDraftFacadeInventoryDto)
  inventory?: CreateProductDraftFacadeInventoryDto[];

  @IsOptional()
  @ApiPropertyOptional({ type: [CreateProductDraftFacadePricingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductDraftFacadePricingDto)
  pricing?: CreateProductDraftFacadePricingDto[];

  @IsOptional()
  @ApiPropertyOptional({ type: CreateProductDraftFacadeShippingDto })
  @ValidateNested()
  @Type(() => CreateProductDraftFacadeShippingDto)
  shipping?: CreateProductDraftFacadeShippingDto;
}
