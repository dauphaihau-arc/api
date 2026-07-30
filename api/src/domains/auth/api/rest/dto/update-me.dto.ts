import {
  IsIn,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MARKETPLACE_CURRENCIES,
  MARKETPLACE_LANGUAGES,
  MARKETPLACE_REGIONS,
} from '~/platform/config/marketplace.config';

class UpdateMePreferencesDto {
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

export class UpdateMeDto {
  @ValidateNested()
  @Type(() => UpdateMePreferencesDto)
  preferences!: UpdateMePreferencesDto;
}
