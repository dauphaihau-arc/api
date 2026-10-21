import { ApiProperty } from '@nestjs/swagger';
import type { PayoutSettingsView } from '../../../app/use-cases/get-payout-settings/get-payout-settings.use-case';

export class ShopPayoutSettingsResponseDto {
  @ApiProperty({
    description:
      'Whether automatic Payout Runs may pay this shop without a manual request.',
    example: true,
  })
  auto_payout_enabled!: boolean;

  @ApiProperty({
    description:
      'The platform day of month (UTC) on which automatic payouts run. A shop is eligible only when auto payout was enabled before that day starts.',
    example: 15,
  })
  auto_payout_day_of_month!: number;

  @ApiProperty({
    description:
      'Whether the shop may opt in: it needs an open, verified Payout Account ' +
      'in its current Settlement Currency.',
    example: true,
  })
  auto_payout_eligible!: boolean;

  @ApiProperty({
    description:
      'Why automatic payouts cannot be enabled, or null when eligible.',
    example: 'no_payout_account',
    nullable: true,
  })
  auto_payout_ineligible_reason!: string | null;

  @ApiProperty({
    description:
      '1 while the shop may still withdraw manually this month, 0 once it has, ' +
      'and null when manual withdrawals are unlimited.',
    example: 1,
    nullable: true,
  })
  manual_withdrawals_remaining!: number | null;
}

export function toShopPayoutSettingsResponse(
  settings: PayoutSettingsView,
): ShopPayoutSettingsResponseDto {
  return {
    auto_payout_enabled: settings.autoPayoutEnabled,
    auto_payout_day_of_month: settings.autoPayoutDayOfMonth,
    auto_payout_eligible: settings.autoPayoutEligible,
    auto_payout_ineligible_reason: settings.autoPayoutIneligibleReason,
    manual_withdrawals_remaining: settings.manualWithdrawalsRemaining,
  };
}
