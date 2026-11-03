import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { FulfillmentShipmentItemDto } from './fulfillment-shipment-item.dto';

/**
 * Buys a carrier label for a previously quoted rate. The quote id is the only
 * pricing input; the package and price were fixed when it was quoted.
 */
export class PurchaseFulfillmentLabelDto {
  @ApiProperty({ name: 'quote_id', description: 'Rate quote id (rq_…) returned by shipment-rates.' })
  @Expose({ name: 'quote_id' })
  @Transform(({ value, obj: source }) => value ?? source.quote_id)
  @IsString()
  @Matches(/^rq_/)
  quoteId!: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'group_id' })
  @Expose({ name: 'group_id' })
  @Transform(({ value, obj: source }) => value ?? source.group_id)
  @IsUUID()
  groupId?: string;

  @ApiProperty({ type: [FulfillmentShipmentItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FulfillmentShipmentItemDto)
  items!: FulfillmentShipmentItemDto[];
}
