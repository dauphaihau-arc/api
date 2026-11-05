import { ApiProperty } from '@nestjs/swagger';
import {
  CARRIER_RATE_SERVICES,
  type CarrierRateService,
} from '~/integrations/carrier/app/ports/carrier-parcel.gateway';
import type { ShipmentRateView } from '../../../app/use-cases/quote-shipment-rates/quote-shipment-rates.use-case';

export class ShipmentRateEstimatedDaysDto {
  @ApiProperty()
  min!: number;

  @ApiProperty()
  max!: number;
}

export class ShipmentRateDto {
  @ApiProperty()
  quote_id!: string;

  @ApiProperty()
  carrier!: string;

  @ApiProperty({ enum: CARRIER_RATE_SERVICES })
  service!: CarrierRateService;

  @ApiProperty()
  price_minor!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ type: ShipmentRateEstimatedDaysDto })
  estimated_days!: ShipmentRateEstimatedDaysDto;

  @ApiProperty()
  expires_at!: string;
}

export class ShipmentRatesResponseDto {
  @ApiProperty({ type: [ShipmentRateDto] })
  rates!: ShipmentRateDto[];
}

export function toShipmentRatesResponse(result: { rates: ShipmentRateView[] }) {
  return {
    rates: result.rates.map(rate => ({
      quote_id: rate.quoteId,
      carrier: rate.carrier,
      service: rate.service,
      price_minor: rate.priceMinor,
      currency: rate.currency,
      estimated_days: {
        min: rate.estimatedDays.min,
        max: rate.estimatedDays.max,
      },
      expires_at: rate.expiresAt,
    })),
  };
}
