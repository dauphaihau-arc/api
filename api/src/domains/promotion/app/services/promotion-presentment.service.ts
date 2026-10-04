import { Injectable } from '@nestjs/common';
import type { FxRateCache } from '~/integrations/currency/fx-rate.service';
import { MoneyConversionService } from '~/integrations/currency/money-conversion.service';
import { fromMinorUnits, toMinorUnits } from '../../../../platform/money/money';
import type { PromotionPresentmentAmounts } from '../../../order/app/order.types';
import { PromotionBenefitType } from '../../domain/enums/promotion-benefit-type.enum';
import { PromotionMinOrderType } from '../../domain/enums/promotion-min-order-type.enum';
import type { PromoOffer } from '../types/promo-offer.mapper';

/**
 * Resolves a Promo Code's monetary fields from its canonical currency (the
 * owning Shop's currency) into the buyer's checkout currency through the shared
 * conversion seam. It keeps the FX concern out of the pricing and eligibility
 * rules: they only ever see money in one currency.
 */
@Injectable()
export class PromotionPresentmentService {
  constructor(private readonly moneyConversionService: MoneyConversionService) {}

  /**
   * Percentage discounts and quantity minimums are currency-neutral and resolve
   * to zero here; anything else needs a rate. Returns `undefined` when a
   * required rate is missing, so no caller can compare a native amount as if it
   * were the checkout currency.
   */
  async resolveForPromoOffer(
    offer: PromoOffer,
    checkoutCurrency: string,
    rateCache: FxRateCache,
  ): Promise<PromotionPresentmentAmounts | undefined> {
    const needsAmountOff = offer.benefitType === PromotionBenefitType.FIXED_AMOUNT;
    const needsMinOrderValue = offer.minOrderType === PromotionMinOrderType.ORDER_TOTAL;

    if (!needsAmountOff && !needsMinOrderValue) {
      return { amountOff: 0, minOrderValue: 0 };
    }

    if (offer.currency === checkoutCurrency) {
      return {
        amountOff: needsAmountOff ? offer.amountOff : 0,
        minOrderValue: needsMinOrderValue ? offer.minOrderValue : 0,
      };
    }

    const amountOff = needsAmountOff
      ? await this.convertAmount(
        offer.amountOff,
        offer.currency,
        checkoutCurrency,
        rateCache,
      )
      : 0;
    const minOrderValue = needsMinOrderValue
      ? await this.convertAmount(
        offer.minOrderValue,
        offer.currency,
        checkoutCurrency,
        rateCache,
      )
      : 0;

    if (amountOff === undefined || minOrderValue === undefined) {
      return undefined;
    }

    return { amountOff, minOrderValue };
  }

  private async convertAmount(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    rateCache: FxRateCache,
  ): Promise<number | undefined> {
    const converted = await this.moneyConversionService.convert({
      amountMinor: toMinorUnits(amount, fromCurrency),
      fromCurrency,
      toCurrency,
      calculationType: 'discount',
      rateCache,
    });

    return converted ? fromMinorUnits(converted.amountMinor, toCurrency) : undefined;
  }
}
