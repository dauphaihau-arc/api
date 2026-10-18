import { ApiProperty } from '@nestjs/swagger';
import type { SellerPayablePosition } from '../../../app/ports/seller-payable-query.repository';

export class SellerPayablePositionResponseDto {
  @ApiProperty({ description: 'Currency the payable accrues in.', example: 'USD' })
  currency!: string;

  @ApiProperty({ description: 'Available Seller Payable in minor units.', example: 0 })
  available_minor!: number;

  @ApiProperty({
    description: 'Not-yet-available Seller Payable in minor units.',
    example: 9_000,
  })
  not_yet_available_minor!: number;
}

export class ShopSellerPayableResponseDto {
  @ApiProperty({ type: [SellerPayablePositionResponseDto] })
  positions!: SellerPayablePositionResponseDto[];
}

/**
 * The shop's Seller Payable by currency: integer minor units only, sorted by
 * currency, and an empty list for a shop with no payable yet.
 */
export function toSellerPayableResponse(
  positions: SellerPayablePosition[],
): ShopSellerPayableResponseDto {
  const sortedPositions = [...positions].sort((left, right) =>
    left.currency.localeCompare(right.currency),
  );

  return {
    positions: sortedPositions.map((position) => ({
      currency: position.currency,
      available_minor: position.availableMinor,
      not_yet_available_minor: position.notYetAvailableMinor,
    })),
  };
}
