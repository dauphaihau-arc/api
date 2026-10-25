import { ApiProperty } from '@nestjs/swagger';
import type { PayoutAccountRecord } from '../../../app/ports/payout-account.repository';

/** The requirements summary as the HTTP surface names it. */
export interface PayoutAccountRequirementsResponse {
  currently_due: string[];
  disabled_reason: string | null;
}

/**
 * A shop's active Payout Account. It carries the provider's account id, the
 * capabilities it reports and display-only bank metadata (bank name and last
 * four); there is no bank number, routing number or holder name to mask
 * because none is stored.
 */
export class PayoutAccountResponseDto {
  @ApiProperty({
    description: 'Internal id of the Payout Account row.',
    example: '0f2a1c5e-9b6d-4c3a-8f01-2d5e7a9c4b18',
  })
  id!: string;

  @ApiProperty({
    description: 'Payout adapter: manual_bank or stripe_connect.',
    example: 'stripe_connect',
  })
  provider!: string;

  @ApiProperty({
    description: 'The provider\'s connected account id, or null for manual_bank.',
    example: 'acct_1Q2w3e4r5t6y7u8i',
    nullable: true,
  })
  provider_account_id!: string | null;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 country code.', example: 'US' })
  country!: string;

  @ApiProperty({
    description: 'The currency this destination is paid in.',
    example: 'USD',
  })
  currency!: string;

  @ApiProperty({
    description: 'Lifecycle status.',
    enum: ['onboarding', 'action_required', 'active', 'restricted', 'disabled'],
    example: 'active',
  })
  status!: string;

  @ApiProperty({
    description: 'Whether the provider reports it can pay this account.',
    example: true,
  })
  payouts_enabled!: boolean;

  @ApiProperty({
    description: 'Whether the provider reports it can charge for this account.',
    example: true,
  })
  charges_enabled!: boolean;

  @ApiProperty({
    description: 'The provider transfers capability, or null when unrequested.',
    example: 'active',
    nullable: true,
  })
  transfers_capability!: string | null;

  @ApiProperty({
    description:
      'Summary of the requirements still due and why the account is disabled.',
    example: { currently_due: [], disabled_reason: null },
    nullable: true,
  })
  requirements!: PayoutAccountRequirementsResponse | null;

  @ApiProperty({
    description: 'The provider\'s default currency for the account.',
    example: 'USD',
    nullable: true,
  })
  default_currency!: string | null;

  @ApiProperty({
    description: 'The bank\'s display name as the provider reports it.',
    example: 'Chase',
    nullable: true,
  })
  bank_name!: string | null;

  @ApiProperty({
    description: 'The last four digits of the payout account number.',
    example: '6789',
    nullable: true,
  })
  last4!: string | null;
}

export class ShopPayoutAccountResponseDto {
  @ApiProperty({
    description: 'The seller Payout Account, or null when none is onboarded.',
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
    description: 'The shop Payout Account, or null when none is onboarded.',
    type: PayoutAccountResponseDto,
    nullable: true,
  })
  payout_account!: PayoutAccountResponseDto | null;
}

/** The URL to send the seller to, or null for the local adapter. */
export class PayoutAccountOnboardingResponseDto {
  @ApiProperty({
    description:
      'Stripe-hosted onboarding URL, or null when the manual_bank adapter is active.',
    example: 'https://connect.stripe.com/setup/e/acct_1Q2w3e4r5t6y7u8i/abc',
    nullable: true,
  })
  url!: string | null;

  @ApiProperty({
    description: 'The Payout Account status after starting onboarding.',
    enum: ['onboarding', 'action_required', 'active', 'restricted', 'disabled'],
    example: 'onboarding',
  })
  status!: string;
}

/** Serializes one Payout Account for the HTTP surface. */
export function toPayoutAccountResponse(
  account: PayoutAccountRecord,
): PayoutAccountResponseDto {
  return {
    id: account.id,
    provider: account.provider,
    provider_account_id: account.providerAccountId,
    country: account.country,
    currency: account.currency,
    status: account.status,
    payouts_enabled: account.payoutsEnabled,
    charges_enabled: account.chargesEnabled,
    transfers_capability: account.transfersCapability,
    requirements: account.requirements
      ? {
        currently_due: account.requirements.currentlyDue,
        disabled_reason: account.requirements.disabledReason,
      }
      : null,
    default_currency: account.defaultCurrency,
    bank_name: account.bankName,
    last4: account.last4,
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

/** The countries the seller may choose when starting Connect onboarding. */
export class PayoutAccountCountriesResponseDto {
  @ApiProperty({
    description:
      'ISO 3166-1 alpha-2 codes the payout provider can onboard, sorted: Stripe’s cross-border payout region, optionally narrowed by configuration.',
    example: ['AT', 'BE', 'CA', 'CH', 'DE', 'ES', 'FR', 'GB', 'US'],
    type: [String],
  })
  countries!: string[];
}

/** Serializes the ops-owned Connect allowlist, sorted for a stable response. */
export function toPayoutAccountCountriesResponse(
  countries: readonly string[],
): PayoutAccountCountriesResponseDto {
  return {
    countries: [...countries].sort((left, right) => left.localeCompare(right)),
  };
}

export function toPayoutAccountOnboardingResponse(
  result: { url: string | null; status: string },
): PayoutAccountOnboardingResponseDto {
  return {
    url: result.url,
    status: result.status,
  };
}
