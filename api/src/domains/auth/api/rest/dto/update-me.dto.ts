import {
  IsIn,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MARKETPLACE_CURRENCIES,
  MARKETPLACE_REGIONS,
  STOREFRONT_LANGUAGES,
} from '~/platform/config/marketplace.config';

class UpdateMePreferencesDto {
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

export class UpdateMeDto {
  @ValidateNested()
  @Type(() => UpdateMePreferencesDto)
  preferences!: UpdateMePreferencesDto;
}
