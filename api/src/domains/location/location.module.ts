import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { LocationReferenceRepository } from './app/ports/location-reference.repository';
import { GetCountryAddressRulesUseCase } from './app/use-cases/get-country-address-rules/get-country-address-rules.use-case';
import { ListAdministrativeAreasUseCase } from './app/use-cases/list-administrative-areas/list-administrative-areas.use-case';
import { ListLocationCountriesUseCase } from './app/use-cases/list-location-countries/list-location-countries.use-case';
import { LocationController } from './api/rest/location.controller';
import { MikroOrmLocationReferenceRepository } from './infra/mikro-orm-location-reference.repository';
import { CountryAddressRuleEntity } from './infra/persistence/entities/country-address-rule.entity';
import { LocationAdministrativeAreaEntity } from './infra/persistence/entities/location-administrative-area.entity';
import { LocationCountryEntity } from './infra/persistence/entities/location-country.entity';
import { LocationDatasetVersionEntity } from './infra/persistence/entities/location-dataset-version.entity';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      LocationCountryEntity,
      LocationAdministrativeAreaEntity,
      LocationDatasetVersionEntity,
      CountryAddressRuleEntity,
    ]),
  ],
  controllers: [LocationController],
  providers: [
    {
      provide: LocationReferenceRepository,
      useExisting: MikroOrmLocationReferenceRepository,
    },
    MikroOrmLocationReferenceRepository,
    ListLocationCountriesUseCase,
    ListAdministrativeAreasUseCase,
    GetCountryAddressRulesUseCase,
  ],
  exports: [
    LocationReferenceRepository,
    ListLocationCountriesUseCase,
    ListAdministrativeAreasUseCase,
    GetCountryAddressRulesUseCase,
  ],
})
export class LocationModule {}
