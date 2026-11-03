import { Injectable } from '@nestjs/common';
import { GetSettlementCurrencyUseCase } from '~/domains/finance/app/use-cases/get-settlement-currency/get-settlement-currency.use-case';
import { CarrierParcelGateway, CarrierRateQuoteUnavailableError, type CarrierRateService } from '~/integrations/carrier/app/ports/carrier-parcel.gateway';
import { findCarrier } from '../../../domain/carrier-catalogue';
import { CarrierRatesUnavailableError } from '../../errors/fulfillment-app.error';

/** The package facts a seller submits to have a shipment priced. */
export type QuoteShipmentRatesCommand = {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

/** One seller-facing rate option, already priced in the shop's currency. */
export type ShipmentRateView = {
  quoteId: string;
  carrier: string;
  service: CarrierRateService;
  priceMinor: number;
  currency: string;
  estimatedDays: { min: number; max: number };
  expiresAt: string;
};

/**
 * Prices a package with the carrier integration for a shop's order. Quoting is
 * read-only: it resolves the shop, asks for the shop's Settlement Currency, and
 * returns the carrier's options. No shipment, label, or ledger row is written,
 * and the quote is only actionable through a later purchase flow.
 */
@Injectable()
export class QuoteShipmentRatesUseCase {
  constructor(
    private readonly getSettlementCurrency: GetSettlementCurrencyUseCase,
    private readonly carrierParcelGateway: CarrierParcelGateway,
  ) {}

  async execute(
    shopId: string,
    input: QuoteShipmentRatesCommand,
  ): Promise<{ rates: ShipmentRateView[] }> {
    const { currency } = await this.getSettlementCurrency.execute({ shopId });

    const quotes = await this.carrierParcelGateway.quoteRates({
      weightGrams: input.weightGrams,
      lengthCm: input.lengthCm,
      widthCm: input.widthCm,
      heightCm: input.heightCm,
      currency,
    }).catch((error: unknown) => {
      if (error instanceof CarrierRateQuoteUnavailableError) {
        throw new CarrierRatesUnavailableError();
      }

      throw error;
    });

    return {
      rates: quotes.flatMap((quote): ShipmentRateView[] => {
        // Only a label-supported catalogue carrier can be quoted: a quote
        // exists to buy a label, so `other` and unknown codes are dropped.
        if (!findCarrier(quote.carrier)?.labelSupported) {
          return [];
        }

        return [{
          quoteId: quote.quoteId,
          carrier: quote.carrier,
          service: quote.service,
          priceMinor: quote.priceMinor,
          currency: quote.currency,
          estimatedDays: {
            min: quote.estimatedDays.min,
            max: quote.estimatedDays.max,
          },
          expiresAt: quote.expiresAt,
        }];
      }),
    };
  }
}
