import { ShippingDestinationScope } from '../../../domain/enums/shipping-destination-scope.enum';
import { ShippingProfileStatus } from '../../../domain/enums/shipping-profile-status.enum';
import { ShippingProfileNameTakenError } from '../../errors/shipping-app.error';
import { CreateShippingProfileUseCase } from './create-shipping-profile.use-case';

const shopId = 'shop-1';

function buildUseCase(existingProfile: unknown = null) {
  const shippingProfileRepository = {
    findByNormalizedName: jest.fn().mockResolvedValue(existingProfile),
    create: jest.fn().mockImplementation(async (input: Record<string, unknown>) => ({
      id: 'profile-1',
      shopId: input.shopId,
      shopPublicId: 'shop_public-1',
      name: input.name,
      status: input.status,
      version: 1,
      shopCurrency: 'USD',
      shipFromCountry: input.shipFromCountry,
      shipFromPostal: input.shipFromPostal,
      processingTimeMinDays: input.processingTimeMinDays,
      processingTimeMaxDays: input.processingTimeMaxDays,
      rates: ((input.rates ?? []) as Array<Record<string, unknown>>).map((rate, index) => ({
        id: `rate-${index + 1}`,
        position: index + 1,
        destinationScope: rate.destinationScope,
        destinationCountry: rate.destinationCountry,
        oneItemFeeMinor: rate.oneItemFeeMinor,
        additionalItemFeeMinor: rate.additionalItemFeeMinor,
        deliveryTimeMinDays: rate.deliveryTimeMinDays,
        deliveryTimeMaxDays: rate.deliveryTimeMaxDays,
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  };
  const useCase = new CreateShippingProfileUseCase(
    shippingProfileRepository as never,
  );

  return { useCase, shippingProfileRepository };
}

describe('CreateShippingProfileUseCase', () => {
  it('creates a checkout-ready active profile with no assignments yet', async () => {
    const { useCase, shippingProfileRepository } = buildUseCase();

    const result = await useCase.execute(shopId, {
      name: 'Standard shipping',
      status: ShippingProfileStatus.ACTIVE,
      processingTimeMinDays: 1,
      processingTimeMaxDays: 3,
      rates: [
        {
          destinationScope: ShippingDestinationScope.COUNTRY,
          destinationCountry: 'US',
          oneItemFeeMinor: 599,
          additionalItemFeeMinor: 199,
          deliveryTimeMinDays: 3,
          deliveryTimeMaxDays: 5,
        },
      ],
    });

    expect(result.isOk).toBe(true);
    expect(shippingProfileRepository.findByNormalizedName).toHaveBeenCalledWith(
      shopId,
      'standard shipping',
    );
    expect(shippingProfileRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId,
        name: 'Standard shipping',
        normalizedName: 'standard shipping',
        status: ShippingProfileStatus.ACTIVE,
      }),
    );
    expect(result.isOk && result.value).toMatchObject({
      assignedProductCount: 0,
      publishedProductCount: 0,
      checkoutReady: true,
      readinessIssues: [],
    });
  });

  it('rejects a name another profile in the same shop already uses', async () => {
    const { useCase, shippingProfileRepository } = buildUseCase({
      id: 'profile-existing',
    });

    const result = await useCase.execute(shopId, {
      name: '  standard SHIPPING ',
      status: ShippingProfileStatus.DRAFT,
    });

    expect(result.isOk).toBe(false);
    expect(result.isOk || result.error).toBeInstanceOf(ShippingProfileNameTakenError);
    expect(shippingProfileRepository.create).not.toHaveBeenCalled();
  });

  it('allows an incomplete draft to be saved for later review', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute(shopId, { name: 'Freight shipping' });

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value).toMatchObject({
      profile: { status: ShippingProfileStatus.DRAFT },
      checkoutReady: false,
      readinessIssues: ['draft', 'missing_rates', 'missing_processing_time'],
    });
  });

  it('does not create a profile when the configuration is invalid', async () => {
    const { useCase, shippingProfileRepository } = buildUseCase();

    const result = await useCase.execute(shopId, {
      name: '',
      status: ShippingProfileStatus.DRAFT,
    });

    expect(result.isOk).toBe(false);
    expect(shippingProfileRepository.create).not.toHaveBeenCalled();
  });
});
