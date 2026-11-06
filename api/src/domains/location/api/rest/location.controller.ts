import {
  Controller,
  Get,
  Headers,
  Param,
  Res,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { resolveOrThrow } from '~/platform/application/result';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { ListAdministrativeAreasUseCase } from '../../app/use-cases/list-administrative-areas/list-administrative-areas.use-case';
import { ListLocationCountriesUseCase } from '../../app/use-cases/list-location-countries/list-location-countries.use-case';
import { locationErrorResponses } from './errors/location-error-responses';
import { mapLocationAppErrorToHttpException } from './errors/location-http-error-mapper';
import { buildLocationEtag, LOCATION_ETAG_ROUTES } from './presenters/location-etag';
import { writeLocationResponse } from './presenters/location-response-writer';
import {
  toLocationAdministrativeAreaResponse,
  toLocationCountryResponse,
} from './presenters/location-response.mapper';
import {
  LocationAdministrativeAreaResponseDto,
  LocationCountryResponseDto,
} from './responses/location-response.dto';

@Controller('locations')
@ApiTags('Locations')
export class LocationController {
  constructor(
    private readonly listLocationCountriesUseCase: ListLocationCountriesUseCase,
    private readonly listAdministrativeAreasUseCase: ListAdministrativeAreasUseCase,
  ) {}

  @Get('countries')
  @SkipThrottle()
  @ApiOperation({
    summary: 'List countries with subdivision availability and postal requiredness',
  })
  @ApiErrorResponses(locationErrorResponses.listCountries)
  @ApiOkResponse({
    description: 'Active countries sorted by name.',
    type: LocationCountryResponseDto,
    isArray: true,
  })
  @ApiResponse({
    status: 304,
    description: 'Dataset unchanged for the supplied If-None-Match validator.',
  })
  async listCountries(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const result = resolveOrThrow(
      await this.listLocationCountriesUseCase.execute(),
      mapLocationAppErrorToHttpException,
    );

    writeLocationResponse(response, {
      etag: buildLocationEtag({
        version: result.version,
        checksum: result.checksum,
        route: LOCATION_ETAG_ROUTES.countries,
      }),
      ifNoneMatch,
      body: result.countries.map(toLocationCountryResponse),
    });
  }

  @Get('countries/:code/administrative-areas')
  @SkipThrottle()
  @ApiOperation({
    summary: 'List active level-1 administrative areas for a country',
  })
  @ApiParam({
    name: 'code',
    type: String,
    description: 'ISO 3166-1 alpha-2 country code. Case-insensitive.',
  })
  @ApiErrorResponses(locationErrorResponses.listAdministrativeAreas)
  @ApiOkResponse({
    description:
      'Active administrative areas sorted by name. Empty when the country has none.',
    type: LocationAdministrativeAreaResponseDto,
    isArray: true,
  })
  @ApiResponse({
    status: 304,
    description: 'Dataset unchanged for the supplied If-None-Match validator.',
  })
  async listAdministrativeAreas(
    @Param('code') code: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const result = resolveOrThrow(
      await this.listAdministrativeAreasUseCase.execute(code),
      mapLocationAppErrorToHttpException,
    );

    writeLocationResponse(response, {
      etag: buildLocationEtag({
        version: result.version,
        checksum: result.checksum,
        route: `${LOCATION_ETAG_ROUTES.administrativeAreas}:${code.trim().toUpperCase()}`,
      }),
      ifNoneMatch,
      body: result.areas.map(toLocationAdministrativeAreaResponse),
    });
  }
}
