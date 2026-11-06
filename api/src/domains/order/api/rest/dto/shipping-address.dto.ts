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

  /**
   * Legacy display name, accepted during the expand release. Ignored by the
   * server when `country_code` is present.
   */
  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(255)
  country?: string;

  /** Canonical ISO alpha-2 country code; names are derived from it. */
  @IsOptional()
  @ApiPropertyOptional({ name: 'country_code' })
  @Expose({ name: 'country_code' })
  @Transform(({ value, obj: source }) => value ?? source.country_code)
  @IsString()
  @MaxLength(2)
  countryCode?: string;

  /**
   * Legacy subdivision display name, accepted during the expand release.
   * Ignored by the server when `state_code` is present.
   */
  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(255)
  state?: string;

  /** Canonical administrative-area code; the display name is derived from it. */
  @IsOptional()
  @ApiPropertyOptional({ name: 'state_code' })
  @Expose({ name: 'state_code' })
  @Transform(({ value, obj: source }) => value ?? source.state_code)
  @IsString()
  @MaxLength(255)
  stateCode?: string;

  /** Free-text subdivision for countries with no administrative-area list. */
  @IsOptional()
  @ApiPropertyOptional({ name: 'state_text' })
  @Expose({ name: 'state_text' })
  @Transform(({ value, obj: source }) => value ?? source.state_text)
  @IsString()
  @MaxLength(255)
  stateText?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20)
  zip!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20)
  phone!: string;
}
