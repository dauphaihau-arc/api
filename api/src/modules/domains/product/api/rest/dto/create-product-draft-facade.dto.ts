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
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { ProductShippingCharge } from '~/modules/domains/product/domain/enums/product-shipping-charge.enum';
import { ProductVariantType } from '~/modules/domains/product/domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '~/modules/domains/product/domain/enums/product-who-made.enum';

export class CreateProductDraftFacadeImageDto {
  @Expose({ name: 'storage_key' })
  @Transform(({ value, obj: source }) => value ?? source.storage_key)
  @IsString()
  @MinLength(1)
  storageKey!: string;

  @IsNumber()
  @Min(1)
  rank!: number;
}

export class CreateProductDraftFacadeAttributeDto {
  @Expose({ name: 'category_attribute_id' })
  @Transform(({ value, obj: source }) => value ?? source.category_attribute_id)
  @IsUUID()
  categoryAttributeId!: string;

  @IsOptional()
  @Expose({ name: 'selected_option_id' })
  @Transform(({ value, obj: source }) => value ?? source.selected_option_id)
  @IsUUID()
  selectedOptionId?: string;

  @IsOptional()
  @Expose({ name: 'selected_text' })
  @Transform(({ value, obj: source }) => value ?? source.selected_text)
  @IsString()
  @MaxLength(255)
  selectedText?: string;
}

export class CreateProductDraftFacadeVariantDto {
  @Expose({ name: 'client_key' })
  @Transform(({ value, obj: source }) => value ?? source.client_key)
  @IsString()
  @MinLength(1)
  clientKey!: string;

  @Expose({ name: 'option_value_1' })
  @Transform(({ value, obj: source }) => value ?? source.option_value_1)
  @IsString()
  @MinLength(1)
  optionValue1!: string;

  @IsOptional()
  @Expose({ name: 'option_value_2' })
  @Transform(({ value, obj: source }) => value ?? source.option_value_2)
  @IsString()
  @MinLength(1)
  optionValue2?: string;
}

export class CreateProductDraftFacadeInventoryDto {
  @IsOptional()
  @Expose({ name: 'variant_client_key' })
  @Transform(({ value, obj: source }) => value ?? source.variant_client_key)
  @IsString()
  @MinLength(1)
  variantClientKey?: string;

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
  @Expose({ name: 'sale_price' })
  @Transform(({ value, obj: source }) => value ?? source.sale_price)
  @IsNumber()
  @Min(0)
  @Max(50000)
  salePrice?: number;
}

export class CreateProductDraftFacadeShippingDestinationDto {
  @Expose({ name: 'country_code' })
  @Transform(({ value, obj: source }) => value ?? source.country_code)
  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @Expose({ name: 'delivery_time_label' })
  @Transform(({ value, obj: source }) => value ?? source.delivery_time_label)
  @IsString()
  @MinLength(1)
  deliveryTimeLabel!: string;

  @IsString()
  @MinLength(1)
  service!: string;

  @Expose({ name: 'charge_type' })
  @Transform(({ value, obj: source }) => value ?? source.charge_type)
  @IsEnum(ProductShippingCharge)
  chargeType!: ProductShippingCharge;
}

export class CreateProductDraftFacadeShippingDto {
  @Expose({ name: 'origin_country' })
  @Transform(({ value, obj: source }) => value ?? source.origin_country)
  @IsString()
  @Length(2, 2)
  originCountry!: string;

  @Expose({ name: 'origin_zip' })
  @Transform(({ value, obj: source }) => value ?? source.origin_zip)
  @IsString()
  @MinLength(1)
  originZip!: string;

  @Expose({ name: 'process_time_label' })
  @Transform(({ value, obj: source }) => value ?? source.process_time_label)
  @IsString()
  @MinLength(1)
  processTimeLabel!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateProductDraftFacadeShippingDestinationDto)
  destinations!: CreateProductDraftFacadeShippingDestinationDto[];
}

export class CreateProductDraftFacadeDto {
  @IsOptional()
  @Expose({ name: 'category_id' })
  @Transform(({ value, obj: source }) => value ?? source.category_id)
  @IsUUID()
  categoryId?: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @MinLength(2)
  description!: string;

  @Expose({ name: 'who_made' })
  @Transform(({ value, obj: source }) => value ?? source.who_made)
  @IsEnum(ProductWhoMade)
  whoMade!: ProductWhoMade;

  @IsOptional()
  @Expose({ name: 'is_digital' })
  @Transform(({ value, obj: source }) => value ?? source.is_digital)
  @IsBoolean()
  isDigital?: boolean;

  @IsOptional()
  @Expose({ name: 'non_taxable' })
  @Transform(({ value, obj: source }) => value ?? source.non_taxable)
  @IsBoolean()
  nonTaxable?: boolean;

  @IsOptional()
  @Expose({ name: 'variant_type' })
  @Transform(({ value, obj: source }) => value ?? source.variant_type)
  @IsEnum(ProductVariantType)
  variantType?: ProductVariantType;

  @IsOptional()
  @Expose({ name: 'variant_group_name' })
  @Transform(({ value, obj: source }) => value ?? source.variant_group_name)
  @IsString()
  @MinLength(1)
  variantGroupName?: string;

  @IsOptional()
  @Expose({ name: 'variant_sub_group_name' })
  @Transform(({ value, obj: source }) => value ?? source.variant_sub_group_name)
  @IsString()
  @MinLength(1)
  variantSubGroupName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateProductDraftFacadeImageDto)
  images?: CreateProductDraftFacadeImageDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductDraftFacadeAttributeDto)
  attributes?: CreateProductDraftFacadeAttributeDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateProductDraftFacadeVariantDto)
  variants?: CreateProductDraftFacadeVariantDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateProductDraftFacadeInventoryDto)
  inventory?: CreateProductDraftFacadeInventoryDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateProductDraftFacadeShippingDto)
  shipping?: CreateProductDraftFacadeShippingDto;
}
