import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class UpdateMyAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address_1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address_2?: string;

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
  @Length(2, 2)
  country_code?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  state_code?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  state_text?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}
