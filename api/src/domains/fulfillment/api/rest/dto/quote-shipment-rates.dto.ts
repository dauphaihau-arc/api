import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  Max,
  Min,
} from 'class-validator';

/** Package sanity bounds shared with the Mock Carrier rate contract. */
const MAX_WEIGHT_GRAMS = 100_000;
const MAX_DIMENSION_CM = 300;

/**
 * The package a seller wants priced. Currency is not part of the request: the
 * quote is always issued in the shop's Settlement Currency.
 */
export class QuoteShipmentRatesDto {
  @ApiProperty({ name: 'weight_grams', minimum: 1, maximum: MAX_WEIGHT_GRAMS })
  @Expose({ name: 'weight_grams' })
  @Transform(({ value, obj: source }) => value ?? source.weight_grams)
  @IsInt()
  @Min(1)
  @Max(MAX_WEIGHT_GRAMS)
  weightGrams!: number;

  @ApiProperty({ name: 'length_cm', minimum: 1, maximum: MAX_DIMENSION_CM })
  @Expose({ name: 'length_cm' })
  @Transform(({ value, obj: source }) => value ?? source.length_cm)
  @IsInt()
  @Min(1)
  @Max(MAX_DIMENSION_CM)
  lengthCm!: number;

  @ApiProperty({ name: 'width_cm', minimum: 1, maximum: MAX_DIMENSION_CM })
  @Expose({ name: 'width_cm' })
  @Transform(({ value, obj: source }) => value ?? source.width_cm)
  @IsInt()
  @Min(1)
  @Max(MAX_DIMENSION_CM)
  widthCm!: number;

  @ApiProperty({ name: 'height_cm', minimum: 1, maximum: MAX_DIMENSION_CM })
  @Expose({ name: 'height_cm' })
  @Transform(({ value, obj: source }) => value ?? source.height_cm)
  @IsInt()
  @Min(1)
  @Max(MAX_DIMENSION_CM)
  heightCm!: number;
}
