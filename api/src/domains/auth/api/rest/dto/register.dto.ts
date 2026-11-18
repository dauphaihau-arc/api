import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  MARKETPLACE_CURRENCIES,
  MARKETPLACE_REGIONS,
  STOREFRONT_LANGUAGES,
} from '~/platform/config/marketplace.config';
import { IsAuthPassword } from '../validation/password-validation';

class UserPreferencesDto {
  @IsOptional()
  @IsIn(MARKETPLACE_REGIONS)
  region?: (typeof MARKETPLACE_REGIONS)[number];

  @IsOptional()
  @IsIn(STOREFRONT_LANGUAGES)
  language?: (typeof STOREFRONT_LANGUAGES)[number];

  @IsOptional()
  @IsIn(MARKETPLACE_CURRENCIES)
  currency?: (typeof MARKETPLACE_CURRENCIES)[number];
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsAuthPassword()
  password!: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'display_name' })
  @Expose({ name: 'display_name' })
  @Transform(({ value, obj: source }) => value ?? source.display_name)
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UserPreferencesDto)
  preferences?: UserPreferencesDto;
}
