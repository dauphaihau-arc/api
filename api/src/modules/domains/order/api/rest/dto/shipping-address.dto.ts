import { Expose, Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ShippingAddressDto {
  @Expose({ name: 'full_name' })
  @Transform(({ value, obj: source }) => value ?? source.full_name)
  @IsString()
  @MaxLength(255)
  fullName!: string;

  @Expose({ name: 'address_1' })
  @Transform(({ value, obj: source }) => value ?? source.address_1)
  @IsString()
  @MaxLength(255)
  address1!: string;

  @IsOptional()
  @Expose({ name: 'address_2' })
  @Transform(({ value, obj: source }) => value ?? source.address_2)
  @IsString()
  @MaxLength(255)
  address2?: string;

  @IsString()
  @MaxLength(255)
  city!: string;

  @IsString()
  @MaxLength(255)
  country!: string;

  @IsString()
  @MaxLength(255)
  state!: string;

  @IsString()
  @MaxLength(50)
  zip!: string;

  @IsString()
  @MaxLength(50)
  phone!: string;
}
