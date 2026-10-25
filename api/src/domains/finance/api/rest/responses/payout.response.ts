import { ApiProperty } from '@nestjs/swagger';
import type { PayoutRecord } from '../../../app/ports/payout.types';
import type { PayoutQuote } from '../../../domain/rules/payout-quote';

export class ShopPayoutResponseDto {
  @ApiProperty({
    description: 'Public id of the Payout.',
    example: 'pay_2f5a91c4b7de',
  })
  id!: string;

  @ApiProperty({
    description: 'Human-facing Payout number.',
    example: 'PAY-20261019-000042',
  })
  payout_number!: string;

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
    description:
      'The shop Settlement Currency the amount left the balance in; equal to ' +
      '`currency`, kept explicit for the frozen quote.',
    example: 'USD',
    nullable: true,
  })
  source_currency!: string | null;

  @ApiProperty({
    description:
      'The currency the provider actually transfers in: the platform balance ' +
      'currency this Payout was converted into. Null on Payouts claimed before ' +
      'platform-currency transfers.',
    example: 'USD',
    nullable: true,
  })
  transfer_currency!: string | null;

  @ApiProperty({
    description:
      'The amount the provider transferred, in `transfer_currency` minor units. ' +
      'Null on Payouts claimed before platform-currency transfers.',
    example: 12_500,
    nullable: true,
  })
  transfer_amount_minor!: number | null;

  @ApiProperty({
    description:
      'The currency that landed in the Payout Account; equal to `currency` ' +
      'for a same-currency payout.',
    example: 'VND',
    nullable: true,
  })
  target_currency!: string | null;

  @ApiProperty({
    description:
      'The claim-time rate that converted `amount_minor` into ' +
      '`transfer_amount_minor`, as text; `1` for an identity conversion. ' +
      'The provider rate into the account currency is in `provider_fx_rate`.',
    example: '1',
    nullable: true,
  })
  fx_rate!: string | null;

  @ApiProperty({
    description:
      'The amount that landed in `target_currency` minor units: what the ' +
      'provider derived when it converted. Null until the provider reports one.',
    example: 317_500_000,
    nullable: true,
  })
  target_amount_minor!: number | null;

  @ApiProperty({
    description:
      'The conversion rate the provider applied, as text exactly as reported. ' +
      'This is authoritative and supersedes `fx_rate`. Null when no conversion ' +
      'happened.',
    example: '25400.0000000000',
    nullable: true,
  })
  provider_fx_rate!: string | null;

  @ApiProperty({
    description:
      'The historical conversion fee in `source_currency` minor units. The ' +
      'platform charges none, so new Payouts record zero.',
    example: 0,
    nullable: true,
  })
  fx_fee_minor!: number | null;

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
    payout_number: payout.payoutNumber,
    amount_minor: payout.amountMinor,
    currency: payout.currency,
    source_currency: payout.sourceCurrency,
    transfer_currency: payout.transferCurrency,
    transfer_amount_minor: payout.transferAmountMinor,
    target_currency: payout.targetCurrency,
    fx_rate: payout.fxRate,
    target_amount_minor: payout.targetAmountMinor,
    provider_fx_rate: payout.providerFxRate,
    fx_fee_minor: payout.fxFeeMinor,
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

/**
 * The seller-facing quote for a withdrawal: what leaves the shop balance and what
 * lands in the Payout Account. Nothing is persisted; the claim re-quotes and
 * freezes the numbers it actually used.
 */
export class ShopPayoutQuoteResponseDto {
  @ApiProperty({
    description: 'The shop Settlement Currency, which the amount leaves in.',
    example: 'USD',
  })
  source_currency!: string;

  @ApiProperty({
    description: 'The Payout Account currency, which the amount arrives in.',
    example: 'VND',
  })
  target_currency!: string;

  @ApiProperty({
    description: 'The shop-currency amount being paid out, before the fee.',
    example: 12_500,
  })
  source_amount_minor!: number;

  @ApiProperty({
    description:
      'The rate this quote was computed at. The claim freezes its own rate, ' +
      'so a later movement is visible rather than silently applied.',
    example: '25400.0000000000',
  })
  fx_rate!: string;

  @ApiProperty({
    description:
      'What is expected to land, in target-currency minor units. An estimate: ' +
      'the provider reports the rate and amount that actually applied.',
    example: 285_750_000,
  })
  target_amount_minor!: number;

  @ApiProperty({
    description:
      'Always true: this is an estimate, never a settled amount. The claim ' +
      'records no local rate or target amount.',
    example: true,
  })
  estimated!: true;
}

export function toShopPayoutQuoteResponse(
  quote: PayoutQuote,
): ShopPayoutQuoteResponseDto {
  return {
    source_currency: quote.sourceCurrency,
    target_currency: quote.targetCurrency,
    source_amount_minor: quote.sourceAmountMinor,
    fx_rate: quote.fxRate,
    target_amount_minor: quote.targetAmountMinor,
    estimated: quote.estimated,
  };
}
