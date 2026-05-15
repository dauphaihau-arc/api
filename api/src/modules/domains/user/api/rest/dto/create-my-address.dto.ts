import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

export class CreateMyAddressDto {
  @IsString()
  @MaxLength(255)
  full_name!: string;

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
  state!: string;

  @IsString()
  @MaxLength(50)
  zip!: string;

  @IsString()
  @MaxLength(255)
  country!: string;

  @IsString()
  @MaxLength(50)
  phone!: string;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}
