import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

export class UpdateMyAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  zip?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}
