import { ProductState } from '../../../../product/domain/enums/product-state.enum';
import { ShippingDestinationScope } from '../../../domain/enums/shipping-destination-scope.enum';
import { ShippingProfileStatus } from '../../../domain/enums/shipping-profile-status.enum';
import {
  ShippingProfileArchivedError,
  ShippingProfileNameTakenError,
  ShippingProfileReadinessRequiredError,
  ShippingProfileVersionConflictError,
} from '../../errors/shipping-app.error';
import type { ShippingProfileSummary } from '../../shipping.types';
import type { ShippingProfileTransitionOutcome } from '../../ports/shipping-profile.repository';
import { UpdateShippingProfileUseCase } from './update-shipping-profile.use-case';

const shopId = 'shop-1';

function buildProfile(
  overrides: Partial<ShippingProfileSummary> = {},
): ShippingProfileSummary {
  return {
    id: 'profile-1',
    shopId,
    shopPublicId: 'shop_public-1',
    name: 'Standard shipping',
    status: ShippingProfileStatus.ACTIVE,
    version: 3,
    isDefault: false,
    shopCurrency: 'USD',
    shipFromCountry: 'US',
    shipFromPostal: '10001',
    processingTimeMinDays: 1,
    processingTimeMaxDays: 3,
    rates: [
      {
        id: 'rate-1',
        position: 1,
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: 'US',
        oneItemFeeMinor: 599,
        additionalItemFeeMinor: 199,
        deliveryTimeMinDays: 3,
        deliveryTimeMaxDays: 5,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildUseCase(
  profile: ShippingProfileSummary | null,
  nameOwner: unknown = null,
  updateOutcome: ShippingProfileTransitionOutcome | null = null,
) {
  const current = profile;
  const shippingProfileRepository = {
    findById: jest.fn().mockResolvedValue(current),
    findByNormalizedName: jest.fn().mockResolvedValue(nameOwner),
    update: jest.fn().mockImplementation(async (input: Record<string, unknown>) => (
      updateOutcome ?? {
        status: 'ok',
        profile: {
          ...(current as ShippingProfileSummary),
          name: input.name as string,
          status: input.status as ShippingProfileStatus,
          version: (current?.version ?? 1) + 1,
          rates: [],
        },
      }
    )),
  };
  const productShippingAssignmentPort = {
    listByShippingProfileIds: jest.fn().mockResolvedValue([]),
  };
  const useCase = new UpdateShippingProfileUseCase(
    shippingProfileRepository as never,
    productShippingAssignmentPort as never,
  );

  return { useCase, shippingProfileRepository, productShippingAssignmentPort };
}

describe('UpdateShippingProfileUseCase', () => {
  it('replaces the profile configuration and returns the next version', async () => {
    const { useCase, shippingProfileRepository } = buildUseCase(buildProfile());

    const result = await useCase.execute(shopId, 'profile-1', {
      version: 3,
      name: 'Express shipping',
      rates: [
        {
          destinationScope: ShippingDestinationScope.EVERYWHERE_ELSE,
          oneItemFeeMinor: 1999,
          additionalItemFeeMinor: 599,
          deliveryTimeMinDays: 4,
          deliveryTimeMaxDays: 8,
        },
      ],
    });

    expect(result.isOk).toBe(true);
    expect(shippingProfileRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId,
        shippingProfileId: 'profile-1',
        expectedVersion: 3,
        name: 'Express shipping',
        normalizedName: 'express shipping',
      }),
    );
    expect(result.isOk && result.value.profile.version).toBe(4);
  });

  it('reports a version conflict instead of overwriting a concurrent edit', async () => {
    const { useCase, shippingProfileRepository } = buildUseCase(buildProfile());

    const result = await useCase.execute(shopId, 'profile-1', { version: 2, name: 'Rename' });

    expect(result.isOk).toBe(false);
    expect(result.isOk || result.error).toBeInstanceOf(ShippingProfileVersionConflictError);
    expect(shippingProfileRepository.update).not.toHaveBeenCalled();
  });

  it('rejects editing an archived profile', async () => {
    const { useCase, shippingProfileRepository } = buildUseCase(
      buildProfile({ status: ShippingProfileStatus.ARCHIVED }),
    );

    const result = await useCase.execute(shopId, 'profile-1', { version: 3, name: 'Rename' });

    expect(result.isOk).toBe(false);
    expect(result.isOk || result.error).toBeInstanceOf(ShippingProfileArchivedError);
    expect(shippingProfileRepository.update).not.toHaveBeenCalled();
  });

  it('rejects a name already used by another profile in the shop', async () => {
    const { useCase, shippingProfileRepository } = buildUseCase(buildProfile(), {
      id: 'profile-other',
    });

    const result = await useCase.execute(shopId, 'profile-1', {
      version: 3,
      name: 'Express shipping',
    });

    expect(result.isOk).toBe(false);
    expect(result.isOk || result.error).toBeInstanceOf(ShippingProfileNameTakenError);
    expect(shippingProfileRepository.update).not.toHaveBeenCalled();
  });

  it('refuses to activate a profile that still has no rates', async () => {
    const { useCase, shippingProfileRepository } = buildUseCase(
      buildProfile({ status: ShippingProfileStatus.DRAFT, rates: [] }),
    );

    const result = await useCase.execute(shopId, 'profile-1', {
      version: 3,
      status: ShippingProfileStatus.ACTIVE,
    });

    expect(result.isOk).toBe(false);
    expect(shippingProfileRepository.update).not.toHaveBeenCalled();
  });

  it('refuses an edit that would stop pricing checkouts while published Products reference the profile', async () => {
    const { useCase } = buildUseCase(buildProfile(), null, {
      status: 'published_products_reference',
      publishedProductCount: 1,
    });

    const result = await useCase.execute(shopId, 'profile-1', {
      version: 3,
      status: ShippingProfileStatus.DRAFT,
    });

    expect(result.isOk).toBe(false);
    expect(result.isOk || result.error).toBeInstanceOf(ShippingProfileReadinessRequiredError);
    expect(result.isOk || (result.error as ShippingProfileReadinessRequiredError).publishedProductCount).toBe(1);
  });

  it('reports how many Products already use the edited profile', async () => {
    const { useCase, productShippingAssignmentPort } = buildUseCase(buildProfile());
    productShippingAssignmentPort.listByShippingProfileIds.mockResolvedValue([
      { productId: 'product-1', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
      { productId: 'product-2', shippingProfileId: 'profile-1', productState: ProductState.DRAFT },
    ]);

    const result = await useCase.execute(shopId, 'profile-1', { version: 3, name: 'Renamed' });

    expect(result.isOk && result.value).toMatchObject({
      assignedProductCount: 2,
      publishedProductCount: 1,
    });
  });
});
