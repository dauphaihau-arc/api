import { ApiProperty } from '@nestjs/swagger';
import type {
  AddressRuleControl,
  AddressRuleFieldKey,
} from '../../../app/location.types';

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

export class LocationAddressRuleResponseDto {
  @ApiProperty({
    enum: ['full_name', 'address_1', 'address_2', 'city', 'subdivision', 'zip', 'phone'],
    example: 'zip',
  })
  key!: AddressRuleFieldKey;

  @ApiProperty({ example: 'Postal code' })
  label!: string;

  @ApiProperty({ example: true })
  visible!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether the field must be submitted. Hidden fields are never required.',
  })
  required!: boolean;

  @ApiProperty({ enum: ['text', 'select', 'tel'], example: 'text' })
  control!: AddressRuleControl;

  @ApiProperty({ example: 'postal-code' })
  autocomplete!: string;
}

export class LocationCountryAddressRulesResponseDto {
  @ApiProperty({ example: 'JP', description: 'ISO 3166-1 alpha-2 country code.' })
  country_code!: string;

  @ApiProperty({
    type: LocationAddressRuleResponseDto,
    isArray: true,
    description: 'Merged address fields in the order the form should render them.',
  })
  fields!: LocationAddressRuleResponseDto[];
}
