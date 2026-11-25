import { ShippingDestinationScope } from '~/domains/shipping/domain/enums/shipping-destination-scope.enum';
import { ShippingProfileStatus } from '~/domains/shipping/domain/enums/shipping-profile-status.enum';
import type { ShippingProfileEntity } from '~/domains/shipping/infra/persistence/entities/shipping-profile.entity';
import { toCatalogShippingCoverage } from './assigned-shipping-profile.projector';

function buildProfile(overrides: {
  status?: ShippingProfileStatus;
  rates?: Array<{
    id?: string;
    position?: number;
    destinationScope: ShippingDestinationScope;
    destinationCountry?: string;
    deliveryTimeMinDays?: number;
    deliveryTimeMaxDays?: number;
    omitDeliveryRange?: boolean;
  }>;
  processingTimeMinDays?: number | null;
  processingTimeMaxDays?: number | null;
} = {}): ShippingProfileEntity {
  const rates = overrides.rates ?? [{
    destinationScope: ShippingDestinationScope.COUNTRY,
    destinationCountry: 'US',
  }];
  const processingTimeMinDays = 'processingTimeMinDays' in overrides
    ? overrides.processingTimeMinDays
    : 1;
  const processingTimeMaxDays = 'processingTimeMaxDays' in overrides
    ? overrides.processingTimeMaxDays
    : 3;

  return {
    id: 'profile-1',
    name: 'Standard shipping',
    status: overrides.status ?? ShippingProfileStatus.ACTIVE,
    version: 1,
    shop: { currency: 'USD' },
    shipFromCountry: 'US',
    processingTimeMinDays: processingTimeMinDays ?? undefined,
    processingTimeMaxDays: processingTimeMaxDays ?? undefined,
    rates: {
      getItems: () => rates.map((rate, index) => ({
        id: rate.id ?? `rate-${index + 1}`,
        position: rate.position ?? index + 1,
        destinationScope: rate.destinationScope,
        destinationCountry: rate.destinationCountry,
        oneItemFeeMinor: 599,
        additionalItemFeeMinor: 199,
        deliveryTimeMinDays: rate.omitDeliveryRange ? undefined : rate.deliveryTimeMinDays ?? 3,
        deliveryTimeMaxDays: rate.omitDeliveryRange ? undefined : rate.deliveryTimeMaxDays ?? 5,
      })),
    },
  } as unknown as ShippingProfileEntity;
}

describe('toCatalogShippingCoverage', () => {
  it('projects explicit country rates and an everywhere_else rate', () => {
    const coverage = toCatalogShippingCoverage(buildProfile({
      rates: [
        { destinationScope: ShippingDestinationScope.COUNTRY, destinationCountry: 'vn' },
        { destinationScope: ShippingDestinationScope.COUNTRY, destinationCountry: 'US' },
        { destinationScope: ShippingDestinationScope.COUNTRY, destinationCountry: 'US' },
        { destinationScope: ShippingDestinationScope.EVERYWHERE_ELSE },
      ],
    }));

    expect(coverage).toEqual({
      shipsToCountryCodes: ['US', 'VN'],
      shipsWorldwide: true,
    });
  });

  it('projects countries without worldwide coverage', () => {
    const coverage = toCatalogShippingCoverage(buildProfile());

    expect(coverage).toEqual({
      shipsToCountryCodes: ['US'],
      shipsWorldwide: false,
    });
  });

  it('contributes no coverage when the profile is missing', () => {
    expect(toCatalogShippingCoverage(undefined)).toEqual({
      shipsToCountryCodes: [],
      shipsWorldwide: false,
    });
  });

  it('contributes no coverage when the profile is not checkout-ready', () => {
    for (const profile of [
      buildProfile({ status: ShippingProfileStatus.DRAFT }),
      buildProfile({ rates: [] }),
      buildProfile({ processingTimeMinDays: undefined }),
      buildProfile({
        rates: [{
          destinationScope: ShippingDestinationScope.COUNTRY,
          destinationCountry: 'US',
          omitDeliveryRange: true,
        }],
      }),
    ]) {
      expect(toCatalogShippingCoverage(profile)).toEqual({
        shipsToCountryCodes: [],
        shipsWorldwide: false,
      });
    }
  });
});
