import { ShippingDestinationScope } from '../../domain/enums/shipping-destination-scope.enum';
import { ShippingProfileStatus } from '../../domain/enums/shipping-profile-status.enum';
import { normalizeShippingProfileConfiguration } from './shipping-profile-configuration';

const baseConfiguration = {
  name: 'Standard shipping',
  status: ShippingProfileStatus.ACTIVE,
  shipFromCountry: 'us',
  shipFromPostal: '10001',
  processingTimeMinDays: 1,
  processingTimeMaxDays: 3,
  rates: [
    {
      destinationScope: ShippingDestinationScope.COUNTRY,
      destinationCountry: 'us',
      oneItemFeeMinor: 599,
      additionalItemFeeMinor: 199,
      deliveryTimeMinDays: 3,
      deliveryTimeMaxDays: 5,
    },
  ],
};

describe('normalizeShippingProfileConfiguration', () => {
  it('normalizes the seller-visible name and structured destination fields', () => {
    const result = normalizeShippingProfileConfiguration({
      ...baseConfiguration,
      name: '  Standard shipping  ',
    });

    if ('error' in result) throw result.error;

    expect(result.configuration).toMatchObject({
      name: 'Standard shipping',
      normalizedName: 'standard shipping',
      shipFromCountry: 'US',
      shipFromPostal: '10001',
      processingTimeMinDays: 1,
      processingTimeMaxDays: 3,
      rates: [
        {
          destinationScope: ShippingDestinationScope.COUNTRY,
          destinationCountry: 'US',
          oneItemFeeMinor: 599,
          additionalItemFeeMinor: 199,
        },
      ],
    });
  });

  it('requires a name', () => {
    const result = normalizeShippingProfileConfiguration({ ...baseConfiguration, name: '   ' });

    expect('error' in result && result.error.message).toMatch(/name is required/i);
  });

  it('requires at least one rate before a profile can be active', () => {
    const withoutRates = normalizeShippingProfileConfiguration({
      ...baseConfiguration,
      rates: [],
    });

    expect('error' in withoutRates && withoutRates.error.message).toMatch(/at least one rate/i);
  });

  it('accepts an incomplete draft so a seller can save work in progress', () => {
    const result = normalizeShippingProfileConfiguration({
      ...baseConfiguration,
      status: ShippingProfileStatus.DRAFT,
      rates: [],
    });

    if ('error' in result) throw result.error;

    expect(result.configuration).toMatchObject({
      status: ShippingProfileStatus.DRAFT,
      rates: [],
    });
  });

  it('rejects an archived status so archiving stays an explicit action', () => {
    const result = normalizeShippingProfileConfiguration({
      ...baseConfiguration,
      status: ShippingProfileStatus.ARCHIVED,
    });

    expect('error' in result && result.error.message).toMatch(/archive action/i);
  });

  it('rejects negative and fractional fees', () => {
    const negative = normalizeShippingProfileConfiguration({
      ...baseConfiguration,
      rates: [{ ...baseConfiguration.rates[0], oneItemFeeMinor: -1 }],
    });

    expect('error' in negative && negative.error.message).toMatch(/one-item fee/i);

    const fractional = normalizeShippingProfileConfiguration({
      ...baseConfiguration,
      rates: [{ ...baseConfiguration.rates[0], additionalItemFeeMinor: 12.5 }],
    });

    expect('error' in fractional && fractional.error.message).toMatch(/additional-item fee/i);
  });

  it('rejects duplicate destination scopes that would make matching ambiguous', () => {
    const result = normalizeShippingProfileConfiguration({
      ...baseConfiguration,
      rates: [baseConfiguration.rates[0], { ...baseConfiguration.rates[0] }],
    });

    expect('error' in result && result.error.message).toMatch(/duplicate shipping rate/i);
  });

  it('rejects a country rate that does not name a 2-letter country code', () => {
    const missingCountry = normalizeShippingProfileConfiguration({
      ...baseConfiguration,
      rates: [{
        destinationScope: ShippingDestinationScope.COUNTRY,
        oneItemFeeMinor: 100,
        additionalItemFeeMinor: 100,
      }],
    });

    expect('error' in missingCountry && missingCountry.error.message).toMatch(/COUNTRY rate/i);
  });

  it('allows at most one everywhere-else rate', () => {
    const result = normalizeShippingProfileConfiguration({
      ...baseConfiguration,
      rates: [
        { destinationScope: ShippingDestinationScope.EVERYWHERE_ELSE, oneItemFeeMinor: 0, additionalItemFeeMinor: 0 },
        { destinationScope: ShippingDestinationScope.EVERYWHERE_ELSE, oneItemFeeMinor: 0, additionalItemFeeMinor: 0 },
      ],
    });

    expect('error' in result && result.error.message).toMatch(/only one EVERYWHERE_ELSE/i);
  });

  it('normalizes a postal code instead of storing what was typed', () => {
    const result = normalizeShippingProfileConfiguration({
      ...baseConfiguration,
      shipFromPostal: '  sw1a   1aa  ',
    });

    if ('error' in result) throw result.error;

    expect(result.configuration.shipFromPostal).toBe('SW1A 1AA');
  });

  it('treats a blank postal code as absent', () => {
    const result = normalizeShippingProfileConfiguration({
      ...baseConfiguration,
      shipFromPostal: '   ',
    });

    if ('error' in result) throw result.error;

    expect(result.configuration.shipFromPostal).toBeUndefined();
  });

  it('accepts the postal shapes sellers actually use', () => {
    for (const postalCode of ['10001', 'SW1A 1AA', 'K1A 0B1', '12345-6789', 'EC1A-1BB']) {
      const result = normalizeShippingProfileConfiguration({
        ...baseConfiguration,
        shipFromPostal: postalCode,
      });

      expect('error' in result ? result.error.message : null).toBeNull();
    }
  });

  it('rejects a postal code that is too short', () => {
    const result = normalizeShippingProfileConfiguration({
      ...baseConfiguration,
      shipFromPostal: '1',
    });

    expect('error' in result && result.error.message).toMatch(/between 2 and 20 characters/i);
  });

  it('rejects a postal code that is too long', () => {
    const result = normalizeShippingProfileConfiguration({
      ...baseConfiguration,
      shipFromPostal: '1'.repeat(21),
    });

    expect('error' in result && result.error.message).toMatch(/between 2 and 20 characters/i);
  });

  it('rejects a postal code with characters no carrier would accept', () => {
    const result = normalizeShippingProfileConfiguration({
      ...baseConfiguration,
      shipFromPostal: '10001@home',
    });

    expect('error' in result && result.error.message).toMatch(/letters, numbers, spaces, and hyphens/i);
  });
});
