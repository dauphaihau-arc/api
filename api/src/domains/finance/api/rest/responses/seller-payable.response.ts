import { ApiProperty } from '@nestjs/swagger';
import type { SellerPayableBalance } from '../../../app/ports/seller-payable-query.repository';

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
 * The shop's Seller Payable: one balance, in the shop's Settlement Currency,
 * in integer minor units only.
 */
export function toSellerPayableResponse(
  balance: SellerPayableBalance,
): ShopSellerPayableResponseDto {
  return {
    currency: balance.currency,
    available_minor: balance.availableMinor,
    not_yet_available_minor: balance.notYetAvailableMinor,
  };
}
