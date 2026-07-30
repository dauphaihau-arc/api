import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ShippingAddressDto {
  @ApiProperty({ name: 'full_name' })
  @Expose({ name: 'full_name' })
  @Transform(({ value, obj: source }) => value ?? source.full_name)
  @IsString()
  @MaxLength(255)
  fullName!: string;

  @ApiProperty({ name: 'address_1' })
  @Expose({ name: 'address_1' })
  @Transform(({ value, obj: source }) => value ?? source.address_1)
  @IsString()
  @MaxLength(255)
  address1!: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'address_2' })
  @Expose({ name: 'address_2' })
  @Transform(({ value, obj: source }) => value ?? source.address_2)
  @IsString()
  @MaxLength(255)
  address2?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  city!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  country!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  state!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  zip!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  phone!: string;
}
