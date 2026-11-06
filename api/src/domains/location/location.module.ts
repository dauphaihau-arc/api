import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { LocationReferenceRepository } from './app/ports/location-reference.repository';
import { ListAdministrativeAreasUseCase } from './app/use-cases/list-administrative-areas/list-administrative-areas.use-case';
import { ListLocationCountriesUseCase } from './app/use-cases/list-location-countries/list-location-countries.use-case';
import { LocationController } from './api/rest/location.controller';
import { MikroOrmLocationReferenceRepository } from './infra/mikro-orm-location-reference.repository';
import { LocationAdministrativeAreaEntity } from './infra/persistence/entities/location-administrative-area.entity';
import { LocationCountryEntity } from './infra/persistence/entities/location-country.entity';
import { LocationDatasetVersionEntity } from './infra/persistence/entities/location-dataset-version.entity';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      LocationCountryEntity,
      LocationAdministrativeAreaEntity,
      LocationDatasetVersionEntity,
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
  ],
  exports: [
    LocationReferenceRepository,
    ListLocationCountriesUseCase,
    ListAdministrativeAreasUseCase,
  ],
})
export class LocationModule {}
