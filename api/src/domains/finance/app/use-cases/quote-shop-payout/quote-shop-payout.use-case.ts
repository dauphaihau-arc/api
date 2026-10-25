import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '~/platform/time/clock';
import {
  PAYOUT_CONNECT_COUNTRIES_CONFIG,
  type PayoutConnectCountriesConfig,
} from '~/platform/config/payout-country.config';
import { PayoutAccountRepository } from '../../ports/payout-account.repository';
import { SettlementCurrencyRepository } from '../../ports/settlement-currency.repository';
import { PayoutQuoteService } from '../../services/payout-quote.service';
import { resolvePayoutAccountBlockReason } from '../../services/payout-eligibility';
import {
  PayoutAccountUnusableError,
  ShopSettlementCurrencyUnresolvedError,
} from '../../errors/finance-app.error';
import { PayoutAmountNotPositiveError } from '../../../domain/errors/finance-domain.error';
import type { PayoutQuote } from '../../../domain/rules/payout-quote';

export interface QuoteShopPayoutInput {
  shopId: string;

  /** The shop-currency amount the seller is considering withdrawing. */
  amountMinor: number;
}

/**
 * The seller-facing estimate of a withdrawal: the rate and roughly what lands in
 * the Payout Account. Nothing is written.
 *
 * There is no platform fee, and the estimate is not authoritative: the claim
 * records no local rate, and the provider's transfer reports the rate and
 * destination amount that actually applied.
 */
@Injectable()
export class QuoteShopPayoutUseCase {
  constructor(
    private readonly payoutAccountRepository: PayoutAccountRepository,
    private readonly settlementCurrencyRepository: SettlementCurrencyRepository,
    private readonly payoutQuoteService: PayoutQuoteService,
    private readonly clock: Clock,
    @Inject(PAYOUT_CONNECT_COUNTRIES_CONFIG)
    private readonly payoutConnectCountriesConfig: PayoutConnectCountriesConfig,
  ) {}

  async execute(input: QuoteShopPayoutInput): Promise<PayoutQuote> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new PayoutAmountNotPositiveError(input.amountMinor);
    }

    const [settlementCurrency, account] = await Promise.all([
      this.settlementCurrencyRepository.ensureCurrentCurrency(input.shopId),
      this.payoutAccountRepository.findActiveByShopId(input.shopId),
    ]);

    if (!settlementCurrency) {
      throw new ShopSettlementCurrencyUnresolvedError(input.shopId);
    }

    const blockReason = resolvePayoutAccountBlockReason(
      account,
      this.payoutConnectCountriesConfig.countries,
    );

    if (!account || blockReason) {
      throw new PayoutAccountUnusableError(
        input.shopId,
        blockReason ?? 'no_payout_account',
      );
    }

    return this.payoutQuoteService.quote({
      sourceCurrency: settlementCurrency,
      targetCurrency: account.currency,
      sourceAmountMinor: input.amountMinor,
      at: this.clock.now(),
    });
  }
}
