import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  Length,
  MinLength,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductShippingCharge } from '~/modules/domains/product/domain/enums/product-shipping-charge.enum';

export class ProductShippingDestinationDto {
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

export class SetProductShippingDto {
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
  @Type(() => ProductShippingDestinationDto)
  destinations!: ProductShippingDestinationDto[];
}
