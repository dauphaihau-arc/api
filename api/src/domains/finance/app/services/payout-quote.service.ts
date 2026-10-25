import { Injectable } from '@nestjs/common';
import { MoneyConversionService } from '~/integrations/currency/money-conversion.service';
import { PayoutConversionRateUnavailableError } from '../errors/finance-app.error';
import type { PayoutQuote } from '../../domain/rules/payout-quote';

export interface BuildPayoutQuoteInput {
  /** The shop's Settlement Currency. */
  sourceCurrency: string;

  /** The Payout Account's currency, as the provider reports it. */
  targetCurrency: string;

  /** The shop-currency amount being paid out. */
  sourceAmountMinor: number;

  /** The instant the estimate is computed at. */
  at?: Date;
}

/**
 * The seller-facing payout estimate: what the shop-currency amount is worth in
 * the Payout Account's currency at the current rate. The platform charges no
 * conversion fee, so the whole amount is converted.
 *
 * This is display evidence only. The authoritative rate and destination amount
 * are read from the provider's transfer when it settles; nothing here is
 * written to the Payout, and the claim records no local rate at all.
 */
@Injectable()
export class PayoutQuoteService {
  constructor(
    private readonly moneyConversionService: MoneyConversionService,
  ) {}

  async quote(input: BuildPayoutQuoteInput): Promise<PayoutQuote> {
    const converted = await this.moneyConversionService.convert({
      amountMinor: input.sourceAmountMinor,
      fromCurrency: input.sourceCurrency,
      toCurrency: input.targetCurrency,
      at: input.at,
    });

    if (!converted) {
      throw new PayoutConversionRateUnavailableError(
        input.sourceCurrency,
        input.targetCurrency,
      );
    }

    return {
      sourceCurrency: input.sourceCurrency,
      targetCurrency: input.targetCurrency,
      sourceAmountMinor: input.sourceAmountMinor,
      // A same-currency conversion is the identity, so there is no rate
      // provenance to record; `'1'` states that explicitly.
      fxRate: converted.fx?.rate ?? '1',
      targetAmountMinor: converted.amountMinor,
      estimated: true,
    };
  }
}
