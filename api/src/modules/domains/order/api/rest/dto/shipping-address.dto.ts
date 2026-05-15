import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ShippingAddressDto {
  @Transform(({ value, obj: source }) => value ?? source.full_name)
  @IsString()
  @MaxLength(255)
  fullName!: string;

  @IsString()
  @MaxLength(255)
  address1!: string;

  @IsOptional()
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
