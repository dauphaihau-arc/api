import { Injectable } from '@nestjs/common';
import type { FxRateCache } from '~/integrations/currency/fx-rate.service';
import { MoneyConversionService } from '~/integrations/currency/money-conversion.service';
import { fromMinorUnits, toMinorUnits } from '../../../../platform/money/money';
import type { CouponPresentmentAmounts } from '../../../order/app/order.types';
import type { ManualPromoOffer } from '../types/coupon.types';
import { couponToManualOffer } from '../types/coupon.types';
import type { CouponEntity } from '../../infra/persistence/entities/coupon.entity';

/**
 * Resolves a Coupon's monetary fields from its canonical currency (the owning
 * Shop's currency) into the buyer's checkout currency through the shared
 * conversion seam. It keeps the FX concern out of the pricing and eligibility
 * rules: they only ever see money in one currency.
 */
@Injectable()
export class CouponPresentmentService {
  constructor(private readonly moneyConversionService: MoneyConversionService) {}

  /**
   * Percentage discounts and quantity minimums are currency-neutral and resolve
   * to zero here; anything else needs a rate. Returns `undefined` when a
   * required rate is missing, so no caller can compare a native amount as if it
   * were the checkout currency.
   */
  async resolveForManualPromoOffer(
    offer: ManualPromoOffer,
    checkoutCurrency: string,
    rateCache: FxRateCache,
  ): Promise<CouponPresentmentAmounts | undefined> {
    const needsAmountOff = offer.type === 'fixed_amount';
    const needsMinOrderValue = offer.minOrderType === 'order_total';

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

  /**
   * Legacy Coupon adapter around the shared manual-promo presentment rule.
   */
  async resolveForCoupon(
    coupon: CouponEntity,
    checkoutCurrency: string,
    rateCache: FxRateCache,
  ): Promise<CouponPresentmentAmounts | undefined> {
    return this.resolveForManualPromoOffer(
      couponToManualOffer(coupon),
      checkoutCurrency,
      rateCache,
    );
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
