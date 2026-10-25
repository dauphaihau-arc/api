import {
  DEFAULT_PAYOUT_CONNECT_COUNTRIES,
  DEFAULT_PAYOUT_PLATFORM_COUNTRY,
  STRIPE_CROSS_BORDER_PAYOUT_COUNTRIES,
  buildPayoutConnectCountriesConfig,
  isSupportedConnectCountry,
} from './payout-country.config';

function configFrom(values: Record<string, string | undefined>) {
  return {
    get: <T>(key: string, defaultValue?: T): T | undefined =>
      (values[key] ?? defaultValue) as T | undefined,
  };
}

describe('buildPayoutConnectCountriesConfig', () => {
  it('defaults to the US platform and Stripe’s whole supported recipient region', () => {
    const config = buildPayoutConnectCountriesConfig(configFrom({}));

    expect(config.platformCountry).toBe(DEFAULT_PAYOUT_PLATFORM_COUNTRY);
    expect(config.countries).toEqual(DEFAULT_PAYOUT_CONNECT_COUNTRIES);
    expect(config.countries).toEqual(STRIPE_CROSS_BORDER_PAYOUT_COUNTRIES);
  });

  it('allows the EEA, the UK, Canada, Switzerland and the US', () => {
    const config = buildPayoutConnectCountriesConfig(configFrom({}));

    expect(config.countries).toEqual(expect.arrayContaining([
      'US',
      'GB',
      'CA',
      'CH',
      'DE',
      'FR',
      'ES',
      'IT',
      'NL',
      'IE',
      'AT',
      'BE',
      'IS',
      'LI',
      'NO',
    ]));
  });

  it.each(['AU', 'JP', 'SG'])('does not allow the unsupported country %s', (country) => {
    const config = buildPayoutConnectCountriesConfig(configFrom({}));

    expect(config.countries).not.toContain(country);
    expect(isSupportedConnectCountry(config, country)).toBe(false);
  });

  it.each(['US', 'GB', 'DE', 'CA', 'CH'])(
    'accepts the supported country %s',
    (country) => {
      const config = buildPayoutConnectCountriesConfig(configFrom({}));

      expect(isSupportedConnectCountry(config, country)).toBe(true);
    },
  );

  it('accepts a platform in the UK, the EEA, Canada or Switzerland', () => {
    const us = buildPayoutConnectCountriesConfig(configFrom({}));

    for (const platformCountry of ['GB', 'DE', 'FR', 'CA', 'CH']) {
      const config = buildPayoutConnectCountriesConfig(
        configFrom({ PAYOUT_PLATFORM_COUNTRY: platformCountry.toLowerCase() }),
      );

      expect(config.platformCountry).toBe(platformCountry);
      expect(config.countries).toEqual(us.countries);
    }
  });

  it('narrows to the intersection when PAYOUT_CONNECT_COUNTRIES is set', () => {
    const config = buildPayoutConnectCountriesConfig(
      configFrom({ PAYOUT_CONNECT_COUNTRIES: ' us , GB,us, sg, AU ' }),
    );

    // Unsupported codes cannot expand the region set; they are dropped.
    expect(config.countries).toEqual(['US', 'GB']);
  });

  it('accepts a single country', () => {
    const config = buildPayoutConnectCountriesConfig(
      configFrom({ PAYOUT_CONNECT_COUNTRIES: 'gb' }),
    );

    expect(config.countries).toEqual(['GB']);
  });

  it('refuses a narrowing that leaves no supported country', () => {
    expect(() => buildPayoutConnectCountriesConfig(
      configFrom({ PAYOUT_CONNECT_COUNTRIES: 'SG,AU' }),
    )).toThrow(/PAYOUT_CONNECT_COUNTRIES/);
  });

  it.each([
    '',
    'USA',
    'U',
    '12',
  ])('rejects the malformed platform country %p at startup', (value) => {
    expect(() => buildPayoutConnectCountriesConfig(
      configFrom({ PAYOUT_PLATFORM_COUNTRY: value }),
    )).toThrow(/PAYOUT_PLATFORM_COUNTRY/);
  });

  it('rejects a platform country Stripe cannot pay out from', () => {
    expect(() => buildPayoutConnectCountriesConfig(
      configFrom({ PAYOUT_PLATFORM_COUNTRY: 'AU' }),
    )).toThrow(/PAYOUT_PLATFORM_COUNTRY/);
  });

  it.each([
    '',
    '   ',
    'USA',
    'U',
    '12',
    'US,GBR',
    'US,,GB',
    'US,',
  ])('rejects the malformed list %p at startup', (value) => {
    expect(() => buildPayoutConnectCountriesConfig(
      configFrom({ PAYOUT_CONNECT_COUNTRIES: value }),
    )).toThrow(/PAYOUT_CONNECT_COUNTRIES/);
  });
});

describe('isSupportedConnectCountry', () => {
  const config = { platformCountry: 'US', countries: ['US', 'GB'] };

  it.each(['US', 'us', ' gb '])('accepts %p', (country) => {
    expect(isSupportedConnectCountry(config, country)).toBe(true);
  });

  it.each(['VN', '', 'USA'])('refuses %p', (country) => {
    expect(isSupportedConnectCountry(config, country)).toBe(false);
  });
});
