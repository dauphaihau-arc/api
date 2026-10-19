import { ApiProperty } from '@nestjs/swagger';
import type { SellerPayablePosition } from '../../../app/ports/seller-payable-query.repository';

export class ShopSellerPayableResponseDto {
  @ApiProperty({
    description: 'The shop Settlement Currency the payable accrues in.',
    example: 'VND',
  })
  currency!: string;

  @ApiProperty({ description: 'Available Seller Payable in minor units.', example: 0 })
  available_minor!: number;

  @ApiProperty({
    description: 'Not-yet-available Seller Payable in minor units.',
    example: 9_000,
  })
  not_yet_available_minor!: number;
}

/**
 * The shop's Seller Payable: one position, in the shop's Settlement Currency,
 * in integer minor units only.
 */
export function toSellerPayableResponse(
  position: SellerPayablePosition,
): ShopSellerPayableResponseDto {
  return {
    currency: position.currency,
    available_minor: position.availableMinor,
    not_yet_available_minor: position.notYetAvailableMinor,
  };
}
