import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MARKETPLACE_CURRENCIES,
  MARKETPLACE_LANGUAGES,
  MARKETPLACE_REGIONS
} from '~/config/marketplace.config';

class MarketPreferencesDto {
  @IsOptional()
  @IsIn(MARKETPLACE_REGIONS)
  region?: (typeof MARKETPLACE_REGIONS)[number];

  @IsOptional()
  @IsIn(MARKETPLACE_LANGUAGES)
  language?: (typeof MARKETPLACE_LANGUAGES)[number];

  @IsOptional()
  @IsIn(MARKETPLACE_CURRENCIES)
  currency?: (typeof MARKETPLACE_CURRENCIES)[number];
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MarketPreferencesDto)
  market_preferences?: MarketPreferencesDto;
}
