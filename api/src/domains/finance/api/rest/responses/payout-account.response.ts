import { ApiProperty } from '@nestjs/swagger';
import type { PayoutAccountRecord } from '../../../app/ports/payout-account.repository';

/**
 * A shop's active Payout Account, masked. The reference and its ciphertext are
 * deliberately absent: `last4` is all a reader needs to recognize the account.
 */
export class PayoutAccountResponseDto {
  @ApiProperty({
    description: 'Internal id of the Payout Account row.',
    example: '0f2a1c5e-9b6d-4c3a-8f01-2d5e7a9c4b18',
  })
  id!: string;

  @ApiProperty({ description: 'Destination kind: bank or wallet.', example: 'bank' })
  type!: string;

  @ApiProperty({ description: 'Name the account is held in.', example: 'Jane Seller' })
  holder_name!: string;

  @ApiProperty({ description: 'Bank the account is held at.', example: 'Example Bank' })
  bank_name!: string;

  @ApiProperty({
    description: 'Last 4 characters of the reference, for display.',
    example: '6789',
  })
  last4!: string;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 country code.', example: 'US' })
  country!: string;

  @ApiProperty({
    description: 'The shop\'s Settlement Currency when the account was recorded.',
    example: 'USD',
  })
  currency!: string;

  @ApiProperty({ description: 'Lifecycle status.', example: 'pending' })
  status!: string;

  @ApiProperty({
    description: 'Instant an operator verified the account, or null.',
    example: null,
    nullable: true,
  })
  verified_at!: string | null;
}

export class ShopPayoutAccountResponseDto {
  @ApiProperty({
    description: 'The seller Payout Account, or null when none is recorded.',
    type: PayoutAccountResponseDto,
    nullable: true,
  })
  payout_account!: PayoutAccountResponseDto | null;
}

export class AdminShopPayoutAccountResponseDto {
  @ApiProperty({
    description: 'Public id of the shop the Payout Account belongs to.',
    example: 'shop_01HZY4T2M8R6N3Q7W9K1V0B5CD',
  })
  shop_id!: string;

  @ApiProperty({
    description: 'The shop Payout Account, or null when none is recorded.',
    type: PayoutAccountResponseDto,
    nullable: true,
  })
  payout_account!: PayoutAccountResponseDto | null;
}

/** Serializes one masked Payout Account for the HTTP surface. */
export function toPayoutAccountResponse(
  account: PayoutAccountRecord,
): PayoutAccountResponseDto {
  return {
    id: account.id,
    type: account.type,
    holder_name: account.holderName,
    bank_name: account.bankName,
    last4: account.last4,
    country: account.country,
    currency: account.currency,
    status: account.status,
    verified_at: account.verifiedAt ? account.verifiedAt.toISOString() : null,
  };
}

export function toShopPayoutAccountResponse(
  account: PayoutAccountRecord | null,
): ShopPayoutAccountResponseDto {
  return {
    payout_account: account ? toPayoutAccountResponse(account) : null,
  };
}

export function toAdminShopPayoutAccountResponse(
  shopPublicId: string,
  account: PayoutAccountRecord | null,
): AdminShopPayoutAccountResponseDto {
  return {
    shop_id: shopPublicId,
    payout_account: account ? toPayoutAccountResponse(account) : null,
  };
}
