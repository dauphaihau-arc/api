import type { CarrierRateQuote, CarrierRateService } from '~/integrations/carrier/app/ports/carrier-parcel.gateway';
import { QuoteShipmentRatesUseCase } from './quote-shipment-rates.use-case';

function buildUseCase(options: {
  currency?: string;
  quotes?: CarrierRateQuote[];
}) {
  const getSettlementCurrency = {
    execute: jest.fn(async () => ({
      currency: options.currency ?? 'USD',
    })),
  };
  const carrierParcelGateway = {
    quoteRates: jest.fn(async () => options.quotes ?? []),
  };

  return {
    useCase: new QuoteShipmentRatesUseCase(
      getSettlementCurrency as never,
      carrierParcelGateway as never,
    ),
    getSettlementCurrency,
    carrierParcelGateway,
  };
}

function quote(carrier: string, service: CarrierRateService): CarrierRateQuote {
  return {
    quoteId: 'rq_1',
    carrier,
    service,
    priceMinor: 1240,
    currency: 'USD',
    estimatedDays: { min: 3, max: 5 },
    expiresAt: '2026-11-02T12:15:00.000Z',
  };
}

describe('QuoteShipmentRatesUseCase', () => {
  it('prices the package in the shop Settlement Currency and maps carrier names', async () => {
    const { useCase, getSettlementCurrency, carrierParcelGateway } = buildUseCase({
      quotes: [quote('usps', 'standard'), quote('dhl', 'express')],
    });

    const result = await useCase.execute('shop-1', {
      weightGrams: 500,
      lengthCm: 10,
      widthCm: 20,
      heightCm: 30,
    });

    expect(getSettlementCurrency.execute).toHaveBeenCalledWith({ shopId: 'shop-1' });
    expect(carrierParcelGateway.quoteRates).toHaveBeenCalledWith({
      weightGrams: 500,
      lengthCm: 10,
      widthCm: 20,
      heightCm: 30,
      currency: 'USD',
    });
    expect(result.rates).toEqual([
      {
        quoteId: 'rq_1',
        carrier: 'usps',
        service: 'standard',
        priceMinor: 1240,
        currency: 'USD',
        estimatedDays: { min: 3, max: 5 },
        expiresAt: '2026-11-02T12:15:00.000Z',
      },
      {
        quoteId: 'rq_1',
        carrier: 'dhl',
        service: 'express',
        priceMinor: 1240,
        currency: 'USD',
        estimatedDays: { min: 3, max: 5 },
        expiresAt: '2026-11-02T12:15:00.000Z',
      },
    ]);
  });

  it('drops carriers the catalogue does not describe and carriers without label support', async () => {
    const { useCase } = buildUseCase({
      currency: 'EUR',
      quotes: [
        quote('usps', 'standard'),
        quote('other', 'standard'),
        quote('fedex', 'standard'),
      ],
    });

    const result = await useCase.execute('shop-1', {
      weightGrams: 500,
      lengthCm: 10,
      widthCm: 20,
      heightCm: 30,
    });

    expect(result.rates.map((rate) => rate.carrier)).toEqual(['usps']);
  });
});
