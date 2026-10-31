import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { CarrierDefinition } from '../../../domain/carrier-catalogue';
import { CARRIER_CATALOGUE } from '../../../domain/carrier-catalogue';

export class CarrierResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  tracking_pattern!: string | null;

  @ApiProperty({ type: String, nullable: true })
  tracking_hint!: string | null;

  @ApiProperty()
  observable!: boolean;

  @ApiProperty()
  label_supported!: boolean;
}

export class CarrierListResponseDto {
  @ApiProperty({ type: [CarrierResponseDto] })
  @Type(() => CarrierResponseDto)
  carriers!: CarrierResponseDto[];
}

function toCarrierResponse(carrier: CarrierDefinition) {
  return {
    code: carrier.code,
    name: carrier.name,
    tracking_pattern: carrier.trackingPattern?.source ?? null,
    tracking_hint: carrier.trackingHint ?? null,
    observable: carrier.observable,
    label_supported: carrier.labelSupported,
  };
}

export function toCarrierListResponse(): CarrierListResponseDto {
  return { carriers: CARRIER_CATALOGUE.map(toCarrierResponse) };
}
