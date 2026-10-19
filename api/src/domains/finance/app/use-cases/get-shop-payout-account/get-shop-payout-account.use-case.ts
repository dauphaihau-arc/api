import { Injectable } from '@nestjs/common';
import {
  PayoutAccountCurrencyMismatchError,
  ShopSettlementCurrencyUnresolvedError,
} from '../../errors/finance-app.error';
import {
  PayoutAccountRepository,
  type PayoutAccountRecord,
} from '../../ports/payout-account.repository';
import { SettlementCurrencyRepository } from '../../ports/settlement-currency.repository';

export interface GetShopPayoutAccountInput {
  shopId: string;
}

/**
 * Reads a shop's active Payout Account, masked. A shop that never recorded one
 * reads as `null` rather than as an error.
 *
 * The account is refused when it was recorded in a currency the shop no longer
 * settles in: a Settlement Currency change closes nothing automatically, so the
 * mismatch is surfaced instead of presenting a destination that cannot receive
 * this shop's payouts as if it could.
 */
@Injectable()
export class GetShopPayoutAccountUseCase {
  constructor(
    private readonly payoutAccountRepository: PayoutAccountRepository,
    private readonly settlementCurrencyRepository: SettlementCurrencyRepository,
  ) {}

  async execute(
    input: GetShopPayoutAccountInput,
  ): Promise<PayoutAccountRecord | null> {
    const account = await this.payoutAccountRepository
      .findActiveByShopId(input.shopId);

    if (!account) {
      return null;
    }

    const settlementCurrency = await this.settlementCurrencyRepository
      .ensureCurrentCurrency(input.shopId);

    if (!settlementCurrency) {
      throw new ShopSettlementCurrencyUnresolvedError(input.shopId);
    }

    if (account.currency !== settlementCurrency) {
      throw new PayoutAccountCurrencyMismatchError(
        account.currency,
        settlementCurrency,
      );
    }

    return account;
  }
}
