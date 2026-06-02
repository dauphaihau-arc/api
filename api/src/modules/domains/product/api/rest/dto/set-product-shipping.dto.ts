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
import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ProductShippingCharge } from '~/modules/domains/product/domain/enums/product-shipping-charge.enum';

export class ProductShippingDestinationDto {
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

export class SetProductShippingDto {
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

  @ApiProperty({ type: [ProductShippingDestinationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductShippingDestinationDto)
  destinations!: ProductShippingDestinationDto[];
}
