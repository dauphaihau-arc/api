import { Injectable } from '@nestjs/common';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import type { ConnectAccountDetails } from '~/integrations/payment/app/ports/connect-gateway';
import { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import {
  PayoutAccountRepository,
  type PayoutAccountRecord,
  type UpdatePayoutAccountInput,
} from '../../ports/payout-account.repository';
import {
  deriveConnectPayoutAccountStatus,
  toPayoutAccountRequirements,
} from '../../../domain/rules/payout-account';

export interface SyncPayoutAccountInput {
  account: ConnectAccountDetails;
}

/**
 * Applies what Stripe reports about a connected account to the stored Payout
 * Account.
 *
 * The row is found by `provider_account_id`, so a webhook for an account this
 * deployment does not store is ignored instead of inventing a row. Only fields
 * that actually changed are written, and the change is audited once; a repeated
 * `account.updated` is therefore a no-op.
 */
@Injectable()
export class SyncPayoutAccountUseCase {
  constructor(
    private readonly payoutAccountRepository: PayoutAccountRepository,
    private readonly auditLogService: AuditLogService,
    private readonly shopRepository: ShopRepository,
  ) {}

  async execute(
    input: SyncPayoutAccountInput,
  ): Promise<PayoutAccountRecord | null> {
    const stored = await this.payoutAccountRepository
      .findByProviderAccountId(input.account.id);

    if (!stored) {
      return null;
    }

    const status = deriveConnectPayoutAccountStatus({
      payoutsEnabled: input.account.payoutsEnabled,
      chargesEnabled: input.account.chargesEnabled,
      transfersCapability: input.account.transfersCapability,
      requirementsDue: input.account.requirementsDue,
      disabledReason: input.account.disabledReason,
    });

    const requirements = toPayoutAccountRequirements(
      input.account.requirementsDue,
      input.account.disabledReason,
    );

    const country = (input.account.country ?? stored.country)
      .trim()
      .toUpperCase();
    const defaultCurrency = input.account.defaultCurrency
      ?.trim()
      .toUpperCase() ?? null;

    // Display-only metadata. A payload without an external account (no bank
    // attached yet, or a card-only account) clears what was shown before.
    const bankName = input.account.externalAccount?.bankName?.trim() || null;
    const last4 = input.account.externalAccount?.last4?.trim() || null;

    const patch: UpdatePayoutAccountInput = { shopId: stored.shopId };
    const changedFields: string[] = [];

    const apply = <K extends keyof UpdatePayoutAccountInput>(
      field: K,
      value: UpdatePayoutAccountInput[K],
    ) => {
      patch[field] = value;
      changedFields.push(field as string);
    };

    if (status !== stored.status) apply('status', status);
    if (input.account.payoutsEnabled !== stored.payoutsEnabled) {
      apply('payoutsEnabled', input.account.payoutsEnabled);
    }
    if (input.account.chargesEnabled !== stored.chargesEnabled) {
      apply('chargesEnabled', input.account.chargesEnabled);
    }
    if (input.account.transfersCapability !== stored.transfersCapability) {
      apply('transfersCapability', input.account.transfersCapability);
    }
    if (!isSameRequirements(requirements, stored.requirements)) {
      apply('requirements', requirements);
    }
    if (country !== stored.country) apply('country', country);

    if (defaultCurrency !== stored.defaultCurrency) {
      apply('defaultCurrency', defaultCurrency);
    }

    // The account currency is Stripe's own `default_currency`, never a seller
    // choice: a synchronisation keeps the stored currency aligned with it so
    // the payout estimate names the currency the money actually arrives in.
    if (defaultCurrency !== null && defaultCurrency !== stored.currency) {
      apply('currency', defaultCurrency);
    }
    if (bankName !== stored.bankName) apply('bankName', bankName);
    if (last4 !== stored.last4) apply('last4', last4);

    if (changedFields.length === 0) {
      return stored;
    }

    const updated = await this.payoutAccountRepository.updateActive(patch);

    if (!updated) {
      return null;
    }

    const shop = await this.shopRepository.findById(updated.shopId);

    await this.auditLogService.record({
      action: 'finance.payout_account.synced',
      entityType: 'payout_account',
      entityId: updated.id,
      entityPublicId: shop?.publicId,
      summary: {
        shopId: updated.shopId,
        providerAccountId: updated.providerAccountId,
        previousStatus: stored.status,
        status: updated.status,
        changedFields,
      },
    });

    return updated;
  }
}

function isSameRequirements(
  left: PayoutAccountRecord['requirements'],
  right: PayoutAccountRecord['requirements'],
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.disabledReason === right.disabledReason
    && left.currentlyDue.length === right.currentlyDue.length
    && left.currentlyDue.every((item, index) => item === right.currentlyDue[index])
  );
}
