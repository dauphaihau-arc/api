import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateMyAddressDto {
  @IsString()
  @MaxLength(255)
  full_name!: string;

  // Keep numbered address fields in snake_case at the HTTP boundary.
  @IsString()
  @MaxLength(255)
  address_1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address_2?: string;

  @IsString()
  @MaxLength(255)
  city!: string;

  @IsString()
  @MaxLength(20)
  zip!: string;

  /** Canonical ISO alpha-2 country code. The only country identity. */
  @IsString()
  @Length(2, 2)
  country_code!: string;

  /** Canonical administrative-area code; required when the country publishes areas. */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  state_code?: string | null;

  /** Free-text subdivision, allowed only for countries with no area list. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  state_text?: string | null;

  @IsString()
  @MaxLength(20)
  phone!: string;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}
