import { ApiProperty } from '@nestjs/swagger';

export class LocationCountryResponseDto {
  @ApiProperty({ example: 'VN', description: 'ISO 3166-1 alpha-2 country code.' })
  code!: string;

  @ApiProperty({ example: 'Vietnam' })
  name!: string;

  @ApiProperty({
    example: true,
    description: 'Whether active level-1 administrative areas exist for this country.',
  })
  has_administrative_areas!: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether a postal code is required for addresses in this country.',
  })
  postal_code_required!: boolean;
}

export class LocationAdministrativeAreaResponseDto {
  @ApiProperty({ example: 'VN-01', description: 'Level-1 administrative area code.' })
  code!: string;

  @ApiProperty({ example: 'Hanoi' })
  name!: string;
}
