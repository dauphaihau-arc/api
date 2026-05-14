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
import { Type } from 'class-transformer';
import { ProductShippingCharge } from '~/modules/domains/product/domain/enums/product-shipping-charge.enum';
import { ProductVariantType } from '~/modules/domains/product/domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '~/modules/domains/product/domain/enums/product-who-made.enum';

export class CreateProductDraftFacadeImageDto {
  @IsString()
  @MinLength(1)
  storageKey!: string;

  @IsNumber()
  @Min(1)
  rank!: number;
}

export class CreateProductDraftFacadeAttributeDto {
  @IsUUID()
  categoryAttributeId!: string;

  @IsOptional()
  @IsUUID()
  selectedOptionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  selectedText?: string;
}

export class CreateProductDraftFacadeVariantDto {
  @IsString()
  @MinLength(1)
  clientKey!: string;

  @IsString()
  @MinLength(1)
  optionValue1!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  optionValue2?: string;
}

export class CreateProductDraftFacadeInventoryDto {
  @IsOptional()
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
  @IsNumber()
  @Min(0)
  @Max(50000)
  salePrice?: number;
}

export class CreateProductDraftFacadeShippingDestinationDto {
  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @IsString()
  @MinLength(1)
  deliveryTimeLabel!: string;

  @IsString()
  @MinLength(1)
  service!: string;

  @IsEnum(ProductShippingCharge)
  chargeType!: ProductShippingCharge;
}

export class CreateProductDraftFacadeShippingDto {
  @IsString()
  @Length(2, 2)
  originCountry!: string;

  @IsString()
  @MinLength(1)
  originZip!: string;

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
  @IsUUID()
  categoryId?: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @MinLength(2)
  description!: string;

  @IsEnum(ProductWhoMade)
  whoMade!: ProductWhoMade;

  @IsOptional()
  @IsBoolean()
  isDigital?: boolean;

  @IsOptional()
  @IsBoolean()
  nonTaxable?: boolean;

  @IsOptional()
  @IsEnum(ProductVariantType)
  variantType?: ProductVariantType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  variantGroupName?: string;

  @IsOptional()
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
