import { ShippingDestinationScope } from './enums/shipping-destination-scope.enum';
import { matchDestinationRate, type ShippingDestinationRate } from './shipping-destination-matcher';

const rate = (
  overrides: Partial<ShippingDestinationRate> & Pick<ShippingDestinationRate, 'id'>,
): ShippingDestinationRate => ({
  position: 1,
  destinationScope: ShippingDestinationScope.EVERYWHERE_ELSE,
  oneItemFeeMinor: 0,
  additionalItemFeeMinor: 0,
  ...overrides,
});

describe('matchDestinationRate', () => {
  it('prefers the configured country rate over the everywhere-else fallback', () => {
    const rates = [
      rate({ id: 'everywhere', position: 1 }),
      rate({
        id: 'us',
        position: 2,
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: 'US',
      }),
    ];

    const match = matchDestinationRate(rates, { countryCode: 'US' });

    expect(match.matched).toBe(true);
    expect(match.matched && match.rate.id).toBe('us');
  });

  it('uses the everywhere-else rate only when no configured country matches', () => {
    const rates = [
      rate({ id: 'everywhere', position: 1 }),
      rate({
        id: 'us',
        position: 2,
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: 'US',
      }),
    ];

    const match = matchDestinationRate(rates, { countryCode: 'DE' });

    expect(match.matched && match.rate.id).toBe('everywhere');
  });

  it('matches a buyer country name against a configured country code', () => {
    const rates = [
      rate({
        id: 'au',
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: 'AU',
      }),
    ];

    const match = matchDestinationRate(rates, { countryCode: 'Australia' });

    expect(match).toMatchObject({ matched: true, rate: { id: 'au' } });
  });

  it('matches a configured country name against a buyer country code', () => {
    const rates = [
      rate({
        id: 'germany',
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: 'Germany',
      }),
    ];

    expect(matchDestinationRate(rates, { countryCode: 'DE' }))
      .toMatchObject({ matched: true, rate: { id: 'germany' } });
  });

  it('treats an unmatched destination without an everywhere-else rate as unsupported', () => {
    const rates = [
      rate({
        id: 'us',
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: 'US',
      }),
    ];

    expect(matchDestinationRate(rates, { countryCode: 'DE' }).matched).toBe(false);
  });

  it('matches normalized structured fields regardless of case and padding', () => {
    const rates = [
      rate({
        id: 'us',
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: ' us ',
      }),
    ];

    const match = matchDestinationRate(rates, { countryCode: '  us ' });

    expect(match.matched && match.rate.id).toBe('us');
  });

  it('ignores a destination without a country code', () => {
    const rates = [rate({ id: 'everywhere' })];

    expect(matchDestinationRate(rates, { countryCode: '   ' }).matched).toBe(false);
  });

  it('resolves equal-specificity duplicates deterministically by position', () => {
    const rates = [
      rate({
        id: 'b',
        position: 2,
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: 'US',
      }),
      rate({
        id: 'a',
        position: 1,
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: 'US',
      }),
    ];

    expect(matchDestinationRate(rates, { countryCode: 'US' }).matched
      && matchDestinationRate(rates, { countryCode: 'US' })).toMatchObject({ rate: { id: 'a' } });
    expect(matchDestinationRate(rates.slice().reverse(), { countryCode: 'US' })).toMatchObject({
      rate: { id: 'a' },
    });
  });
});
