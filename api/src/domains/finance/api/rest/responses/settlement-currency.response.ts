import { ApiProperty } from '@nestjs/swagger';
import type { SettlementCurrencyView } from '../../../app/use-cases/get-settlement-currency/get-settlement-currency.use-case';
import type { SettlementCurrencyChange } from '../../../app/use-cases/change-settlement-currency/change-settlement-currency.use-case';

/** The shop's Settlement Currency and when it may change again. */
export class ShopSettlementCurrencyResponseDto {
  @ApiProperty({
    description: 'The currency the shop currently accrues Seller Payable in.',
    example: 'USD',
  })
  currency!: string;

  @ApiProperty({
    description: 'When the current Settlement Currency took effect.',
    example: '2026-10-22T09:30:00.000Z',
  })
  effective_from!: string;

  @ApiProperty({
    description:
      'The Settlement Currency this one replaced, or null for the shop\'s opening currency.',
    example: 'USD',
    nullable: true,
  })
  previous_currency!: string | null;

  @ApiProperty({
    description: 'The platform minimum interval between two changes, in days.',
    example: 90,
  })
  change_interval_days!: number;

  @ApiProperty({
    description:
      'When the shop may change Settlement Currency again, or null when it never changed.',
    example: '2027-01-20T09:30:00.000Z',
    nullable: true,
  })
  next_change_allowed_at!: string | null;

  @ApiProperty({
    description: 'Whether automatic payouts may currently pay this shop.',
    example: false,
  })
  auto_payout_enabled!: boolean;

  @ApiProperty({
    description:
      'Whether the shop may change Settlement Currency now. False when its own ' +
      'Seller Payable or Payout state blocks a change; a specific target ' +
      'currency can still be refused on POST with its own code.',
    example: false,
  })
  can_change!: boolean;

  @ApiProperty({
    description:
      'Why the shop cannot change Settlement Currency, or null when it can. ' +
      'Target-specific refusals (unsupported or unchanged currency, no rate) ' +
      'only appear on POST.',
    enum: ['balance_not_zero', 'payout_pending', 'change_too_soon'],
    nullable: true,
  })
  blocked_reason!: string | null;

  @ApiProperty({
    description: 'The shop\'s available Seller Payable, zero when it has none.',
    example: 1250,
  })
  available_minor!: number;

  @ApiProperty({
    description:
      'The shop\'s Seller Payable that is not yet available, zero when it has none.',
    example: 0,
  })
  not_yet_available_minor!: number;

  @ApiProperty({
    description: 'Whether the shop has a Payout that is still pending.',
    example: true,
  })
  pending_payout!: boolean;
}

/** The outcome of a granted Settlement Currency change. */
export class ShopSettlementCurrencyChangeResponseDto {
  @ApiProperty({
    description: 'The Settlement Currency the shop now settles in.',
    example: 'EUR',
  })
  currency!: string;

  @ApiProperty({
    description: 'The Settlement Currency the change retired.',
    example: 'USD',
  })
  previous_currency!: string;

  @ApiProperty({
    description:
      'The instant the change took effect. Orders recorded before it keep the ' +
      'currency they settled in; later reversals convert through the Cutover Rate.',
    example: '2026-10-22T09:30:00.000Z',
  })
  effective_from!: string;

  @ApiProperty({
    description:
      'Always false: a change turns automatic payouts off until a Payout Account ' +
      'in the new currency is recorded and verified.',
    example: false,
  })
  auto_payout_enabled!: boolean;
}

export function toShopSettlementCurrencyResponse(
  view: SettlementCurrencyView,
): ShopSettlementCurrencyResponseDto {
  return {
    currency: view.currency,
    effective_from: view.effectiveFrom.toISOString(),
    previous_currency: view.previousCurrency,
    change_interval_days: view.changeIntervalDays,
    next_change_allowed_at: view.nextChangeAllowedAt?.toISOString() ?? null,
    auto_payout_enabled: view.autoPayoutEnabled,
    can_change: view.canChange,
    blocked_reason: view.blockedReason,
    available_minor: view.availableMinor,
    not_yet_available_minor: view.notYetAvailableMinor,
    pending_payout: view.pendingPayout,
  };
}

export function toShopSettlementCurrencyChangeResponse(
  change: SettlementCurrencyChange,
): ShopSettlementCurrencyChangeResponseDto {
  return {
    currency: change.currency,
    previous_currency: change.previousCurrency,
    effective_from: change.effectiveFrom.toISOString(),
    auto_payout_enabled: change.autoPayoutEnabled,
  };
}
