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

  /**
   * Legacy subdivision label. Required when no subdivision code is supplied;
   * resolved to a code when the reference dataset knows it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  state?: string;

  @IsString()
  @MaxLength(50)
  zip!: string;

  /**
   * Legacy country label. Required when country_code is omitted.
   */
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

  @IsString()
  @MaxLength(50)
  phone!: string;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}
