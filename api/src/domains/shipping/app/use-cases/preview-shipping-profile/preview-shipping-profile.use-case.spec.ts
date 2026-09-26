import { ShippingDestinationScope } from '../../../domain/enums/shipping-destination-scope.enum';
import { ShippingProfileStatus } from '../../../domain/enums/shipping-profile-status.enum';
import { ShippingProfileNotFoundError } from '../../errors/shipping-app.error';
import type { ShippingProfileSummary } from '../../shipping.types';
import { PreviewShippingProfileUseCase } from './preview-shipping-profile.use-case';

const shopId = 'shop-1';

function buildProfile(
  overrides: Partial<ShippingProfileSummary> = {},
): ShippingProfileSummary {
  return {
    id: 'profile-1',
    shopId,
    name: 'Standard shipping',
    status: ShippingProfileStatus.ACTIVE,
    version: 1,
    isDefault: false,
    shopCurrency: 'USD',
    shipFromCountry: 'US',
    shipFromPostal: '10001',
    processingTimeMinDays: 1,
    processingTimeMaxDays: 3,
    rates: [
      {
        id: 'rate-us',
        position: 1,
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: 'US',
        oneItemFeeMinor: 599,
        additionalItemFeeMinor: 199,
        deliveryTimeMinDays: 3,
        deliveryTimeMaxDays: 5,
      },
      {
        id: 'rate-everywhere',
        position: 3,
        destinationScope: ShippingDestinationScope.EVERYWHERE_ELSE,
        oneItemFeeMinor: 1999,
        additionalItemFeeMinor: 599,
        deliveryTimeMinDays: 5,
        deliveryTimeMaxDays: 10,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildUseCase(profile: ShippingProfileSummary | null) {
  const shippingProfileRepository = {
    findById: jest.fn().mockResolvedValue(profile),
  };
  const useCase = new PreviewShippingProfileUseCase(shippingProfileRepository as never);

  return { useCase, shippingProfileRepository };
}

describe('PreviewShippingProfileUseCase', () => {
  it('returns the matched country rate and one-item/additional-item arithmetic', async () => {
    const { useCase } = buildUseCase(buildProfile());

    const result = await useCase.execute(shopId, 'profile-1', {
      countryCode: 'us',
      quantity: 3,
    });

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value).toMatchObject({
      matched: true,
      currency: 'USD',
      checkoutReady: true,
      readinessIssues: [],
      rate: { id: 'rate-us' },
      processingTime: { minDays: 1, maxDays: 3 },
      deliveryTime: { minDays: 3, maxDays: 5 },
      arithmetic: {
        quantity: 3,
        baseItemFeeMinor: 599,
        additionalItemFeeMinor: 199,
        baseItemTotalMinor: 599,
        additionalItemsQuantity: 2,
        additionalItemsTotalMinor: 398,
        totalMinor: 997,
      },
    });
  });

  it('scopes the profile read to the requested shop', async () => {
    const { useCase, shippingProfileRepository } = buildUseCase(buildProfile());

    await useCase.execute(shopId, 'profile-1', { countryCode: 'US', quantity: 1 });

    expect(shippingProfileRepository.findById).toHaveBeenCalledWith(shopId, 'profile-1');
  });

  it('reports an unsupported destination without inventing a fee', async () => {
    const { useCase } = buildUseCase(
      buildProfile({
        rates: [
          {
            id: 'rate-us',
            position: 1,
            destinationScope: ShippingDestinationScope.COUNTRY,
            destinationCountry: 'US',
            oneItemFeeMinor: 599,
            additionalItemFeeMinor: 199,
            deliveryTimeMinDays: 3,
            deliveryTimeMaxDays: 5,
          },
        ],
      }),
    );

    const result = await useCase.execute(shopId, 'profile-1', {
      countryCode: 'DE',
      quantity: 2,
    });

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value).toMatchObject({ matched: false });
    expect(result.isOk && result.value.rate).toBeUndefined();
    expect(result.isOk && result.value.arithmetic).toBeUndefined();
  });

  it('still previews a draft profile while flagging it as not checkout-ready', async () => {
    const { useCase } = buildUseCase(
      buildProfile({ status: ShippingProfileStatus.DRAFT }),
    );

    const result = await useCase.execute(shopId, 'profile-1', {
      countryCode: 'US',
      quantity: 1,
    });

    expect(result.isOk && result.value).toMatchObject({
      matched: true,
      checkoutReady: false,
      readinessIssues: ['draft'],
      currency: 'USD',
      processingTime: { minDays: 1, maxDays: 3 },
      deliveryTime: { minDays: 3, maxDays: 5 },
    });
  });

  it('rejects an invalid destination or quantity instead of pricing it', async () => {
    const { useCase, shippingProfileRepository } = buildUseCase(buildProfile());

    const badCountry = await useCase.execute(shopId, 'profile-1', {
      countryCode: 'USA',
      quantity: 1,
    });
    const badQuantity = await useCase.execute(shopId, 'profile-1', {
      countryCode: 'US',
      quantity: 0,
    });

    expect(badCountry.isOk).toBe(false);
    expect(badQuantity.isOk).toBe(false);
    expect(shippingProfileRepository.findById).not.toHaveBeenCalled();
  });

  it('reports a missing profile', async () => {
    const { useCase } = buildUseCase(null);

    const result = await useCase.execute(shopId, 'profile-missing', {
      countryCode: 'US',
      quantity: 1,
    });

    expect(result.isOk).toBe(false);
    expect(result.isOk || result.error).toBeInstanceOf(ShippingProfileNotFoundError);
  });
});
