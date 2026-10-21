import { ApiProperty } from '@nestjs/swagger';
import type { PayoutRecord } from '../../../app/ports/payout.types';

export class ShopPayoutResponseDto {
  @ApiProperty({
    description: 'Public id of the Payout.',
    example: 'pay_2f5a91c4b7de',
  })
  id!: string;

  @ApiProperty({
    description: 'Amount paid, in the shop Settlement Currency minor units.',
    example: 12_500,
  })
  amount_minor!: number;

  @ApiProperty({
    description: 'The shop Settlement Currency the Payout was made in.',
    example: 'USD',
  })
  currency!: string;

  @ApiProperty({
    description: 'Lifecycle state of the Payout.',
    example: 'paid',
  })
  state!: string;

  @ApiProperty({
    description:
      'Whether an automatic run or a seller manual withdrawal created the Payout.',
    example: 'manual',
    enum: ['scheduled', 'manual'],
  })
  source!: string;

  @ApiProperty({
    description:
      'The platform month the Payout belongs to, as YYYY-MM; null on Payouts ' +
      'that predate the monthly allowance.',
    example: '2026-10',
    nullable: true,
  })
  period!: string | null;

  @ApiProperty({
    description:
      'Why a Blocked or Failed Payout ended as it did; null while pending or paid.',
    example: 'no_payout_account',
    nullable: true,
  })
  reason!: string | null;

  @ApiProperty({
    description: 'Instant the provider accepted the transfer, or null while it has not.',
    example: '2026-10-19T09:15:00.000Z',
    nullable: true,
  })
  paid_at!: string | null;

  @ApiProperty({
    description: 'Instant the Payout was created by a run or a manual request.',
    example: '2026-10-19T09:15:00.000Z',
  })
  created_at!: string;
}

export class ShopPayoutHistoryResponseDto {
  @ApiProperty({
    description: 'The shop Payouts, newest first.',
    type: ShopPayoutResponseDto,
    isArray: true,
  })
  payouts!: ShopPayoutResponseDto[];
}

/** One Payout, as a manual withdrawal returns it. */
export class ShopPayoutResponseWrapperDto {
  @ApiProperty({ type: ShopPayoutResponseDto })
  payout!: ShopPayoutResponseDto;
}

export function toShopPayoutResponse(payout: PayoutRecord): ShopPayoutResponseDto {
  return {
    id: payout.publicId,
    amount_minor: payout.amountMinor,
    currency: payout.currency,
    state: payout.state,
    source: payout.source,
    period: payout.periodKey,
    reason: payout.reason,
    paid_at: payout.paidAt ? payout.paidAt.toISOString() : null,
    created_at: payout.createdAt.toISOString(),
  };
}

export function toShopPayoutHistoryResponse(
  payouts: PayoutRecord[],
): ShopPayoutHistoryResponseDto {
  return {
    payouts: payouts.map(toShopPayoutResponse),
  };
}
